"""Static SQL contracts only: these tests never create or connect a database."""

from dataclasses import fields, replace
from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch

try:
    from pglast import ast, parse_sql
    from tools.schema_checks import SchemaDesign, names, parse_future_tests, load_validation_order
except ImportError:
    SchemaDesign = None

from myoko_property_crawler.customer import customer_property, is_customer_eligible
from myoko_property_crawler.models import AvailabilityStatus, ListingStatus, Property
from myoko_property_crawler.storage import load_state
from .helpers import initial_batch


def literals(node):
    if isinstance(node, ast.A_Const) and not node.isnull and isinstance(node.val, ast.String):
        return {node.val.sval}
    if isinstance(node, ast.Node):
        return set().union(*(literals(getattr(node, field)) for field in node))
    if isinstance(node, (tuple, list)):
        return set().union(*(literals(item) for item in node))
    return set()


@unittest.skipIf(SchemaDesign is None, "Optional SQL parser: install requirements-schema.txt")
class SchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.design = SchemaDesign()

    def unique_keys(self, table):
        return {names(c.keys) for c in self.design.constraints(table) if c.contype.name == "CONSTR_UNIQUE"}

    def grants_to(self, role):
        return [g for g in self.design.grants if g.is_grant and any(r.rolename == role for r in g.grantees)]

    def test_proposal_parses_as_one_transaction_with_six_private_tables(self):
        self.assertEqual(set(self.design.tables), {"sources", "properties", "crawl_runs", "price_changes", "status_changes", "translations"})
        self.assertEqual(self.design.statements[0].kind.name, "TRANS_STMT_BEGIN")
        self.assertEqual(self.design.statements[-1].kind.name, "TRANS_STMT_COMMIT")
        self.assertTrue(all(t.relation.schemaname == "crawler" for t in self.design.tables.values()))

    def test_every_current_model_field_is_mapped(self):
        model = {field.name for field in fields(Property)}
        normalized_source_fields = {"source_agency_name", "source_website"}
        self.assertLessEqual(model - normalized_source_fields, self.design.columns("properties").keys())
        self.assertLessEqual({"agency_name", "website", "source_key"}, self.design.columns("sources").keys())

    def test_optional_future_fields_remain_nullable(self):
        for field in ("address", "land_area_sqm", "building_area_sqm", "construction_date", "building_age_years",
                      "floor_plan", "parking", "description_ja", "description_en", "title_en", "asking_price_jpy"):
            column = self.design.columns("properties")[field]
            with self.subTest(field=field):
                self.assertNotIn("CONSTR_NOTNULL", {c.contype.name for c in column.constraints or ()})

    def test_municipality_is_extensible_text_without_a_town_allowlist(self):
        column = self.design.columns("properties")["municipality"]
        self.assertEqual(names(column.typeName.names), ("text",))
        self.assertEqual(literals(column.constraints), {""})  # Nonblank, not a fixed town list.
        self.assertLessEqual({"area", "area_en", "region_ja", "region_en"}, self.design.columns("properties").keys())

    def test_enum_values_match_python(self):
        columns = self.design.columns("properties")
        self.assertEqual(literals(columns["listing_status"].constraints), {s.value for s in ListingStatus})
        self.assertEqual(literals(columns["availability_status"].constraints), {s.value for s in AvailabilityStatus})

    def test_source_scoped_identity_and_url_uniqueness(self):
        keys = self.unique_keys("properties")
        self.assertIn(("source_key", "identity_token"), keys)
        self.assertIn(("source_key", "original_listing_url"), keys)
        self.assertNotIn(("original_listing_url",), keys)
        generated = self.design.columns("properties")["identity_token"].constraints[0]
        self.assertEqual(generated.contype.name, "CONSTR_GENERATED")
        self.assertEqual(literals(generated.raw_expr), {"id:", "url:"})

    def test_seen_timestamp_and_missing_state_are_conservative(self):
        column = self.design.columns("properties")["last_seen_at"]
        self.assertNotIn("CONSTR_NOTNULL", {c.contype.name for c in column.constraints or ()})
        self.assertFalse(any(c.contype.name == "CONSTR_DEFAULT" for c in column.constraints or ()))
        missing = self.design.columns("properties")["missing_verification_state"].constraints[0]
        self.assertEqual(missing.contype.name, "CONSTR_GENERATED")
        self.assertEqual(literals(missing.raw_expr), {"not_found", "pending_verification", "not_missing"})

    def test_run_retries_and_history_events_have_idempotency_keys(self):
        self.assertIn(("source_key", "idempotency_key"), self.unique_keys("crawl_runs"))
        self.assertNotIn(("source_key", "snapshot_sha256"), self.unique_keys("crawl_runs"))
        for table in ("price_changes", "status_changes"):
            self.assertIn(("property_id", "crawl_run_id"), self.unique_keys(table))
            references = {c.pktable.relname: names(c.fk_attrs) for c in self.design.constraints(table)
                          if c.contype.name == "CONSTR_FOREIGN"}
            self.assertEqual(references, {"properties": ("property_id", "source_key"), "crawl_runs": ("crawl_run_id", "source_key")})
        self.assertIn(("property_id", "legacy_event_key"), self.unique_keys("price_changes"))
        legacy_run = self.design.columns("price_changes")["crawl_run_id"]
        self.assertNotIn("CONSTR_NOTNULL", {c.contype.name for c in legacy_run.constraints or ()})

    def test_crawl_logs_source_checks_and_status_history_are_retained(self):
        self.assertLessEqual({"warnings", "error_summary", "records_processed", "records_extracted", "summary", "status"}, self.design.columns("crawl_runs").keys())
        self.assertLessEqual({"last_successful_check_at", "last_complete_check_at", "permissions", "crawl_config"}, self.design.columns("sources").keys())
        self.assertLessEqual({"old_listing_status", "new_listing_status", "old_availability_status", "new_availability_status",
                             "old_source_status_ja", "new_source_status_ja", "detected_at"}, self.design.columns("status_changes").keys())
        self.assertIn("original_listing_url", self.design.columns("price_changes"))

    def test_translation_cache_keys_include_original_and_model_prompt_versions(self):
        self.assertIn(("property_id", "field_name", "source_text_sha256", "source_language", "target_language", "provider", "model", "prompt_version"), self.unique_keys("translations"))

    def test_rls_enabled_and_forced_on_every_table(self):
        operations = {}
        for node in self.design.statements:
            if isinstance(node, ast.AlterTableStmt):
                operations.setdefault(node.relation.relname, set()).update(c.subtype.name for c in node.cmds)
        for table in self.design.tables:
            self.assertLessEqual({"AT_EnableRowSecurity", "AT_ForceRowSecurity"}, operations[table])

    def test_customer_view_and_rls_share_the_same_eligibility_function(self):
        view = self.design.views["customer_properties"]
        self.assertEqual(view.view.schemaname, "property_api")
        options = {o.defname: o.arg.sval for o in view.options}
        self.assertEqual(options, {"security_invoker": "true", "security_barrier": "true"})
        self.assertEqual(view.query.whereClause.boolop.name, 'AND_EXPR')
        self.assertEqual(names(view.query.whereClause.args[0].funcname), ("crawler", "customer_eligible"))
        policy = self.design.policies["properties_customer_read"]
        self.assertEqual(names(policy.qual.funcname), ("crawler", "customer_eligible"))
        self.assertEqual([r.rolename for r in policy.roles], ["crawler_customer_reader"])

    def test_customer_view_omits_ids_raw_labels_and_internal_fields(self):
        actual = set()
        for target in self.design.views["customer_properties"].query.targetList:
            actual.add(target.name or names(target.val.fields)[-1])
        prop = replace(initial_batch().properties[0], source_key="myoko_akiya_bank", availability_status=AvailabilityStatus.ACTIVE)
        self.assertEqual(actual, set(customer_property(prop)) - {"source_status_ja"})
        self.assertFalse({"id", "source_property_id", "source_key", "source_status_ja", "identity_token", "title_ja", "title_en"} & actual)

    def test_anonymous_authenticated_and_service_roles_have_no_grants(self):
        for role in ("anon", "authenticated", "service_role"):
            self.assertEqual(self.grants_to(role), [])
        self.assertFalse(any(g.is_grant and any(r.roletype.name == "ROLESPEC_PUBLIC" for r in g.grantees) for g in self.design.grants))

    def test_customer_role_cannot_name_private_schema_or_read_identifiers(self):
        usage = [g for g in self.grants_to("crawler_customer_reader") if g.objtype.name == "OBJECT_SCHEMA"]
        self.assertEqual([name.sval for g in usage for name in g.objects], ["property_api"])
        for grant in self.grants_to("crawler_customer_reader"):
            if grant.objtype.name != "OBJECT_TABLE":
                continue
            for relation in grant.objects:
                if relation.schemaname == "crawler":
                    for privilege in grant.privileges:
                        self.assertEqual(privilege.priv_name, "select")
                        self.assertTrue(privilege.cols)  # No blanket SELECT on internal tables.
                        self.assertFalse({"id", "source_property_id", "identity_token"} & set(names(privilege.cols)))

    def test_roles_have_no_login_bypass_or_membership_and_no_delete_grants(self):
        roles = [s for s in self.design.statements if isinstance(s, ast.CreateRoleStmt)]
        self.assertEqual(len(roles), 2)
        for role in roles:
            self.assertTrue(all(not option.arg.boolval for option in role.options))
        self.assertFalse(any(isinstance(s, ast.GrantRoleStmt) for s in self.design.statements))
        for grant in self.design.grants:
            if grant.is_grant:
                self.assertTrue(grant.privileges)
                self.assertFalse({"delete", "truncate"} & {p.priv_name for p in grant.privileges})

    def test_eligibility_function_is_invoker_and_pins_search_path(self):
        function = self.design.functions[("crawler", "customer_eligible")]
        options = {o.defname: o.arg for o in function.options}
        self.assertFalse(options["security"].boolval)
        self.assertEqual(options["set"].name, "search_path")
        self.assertEqual(options["set"].args[0].val.sval, "pg_catalog")

    def test_parsed_eligibility_contract_matches_python_status_label_matrix(self):
        labels = (None, "", "  ", "募集中", "値下げ", "新着", "ＮＥＷ", "NEW 値下げ Price Reduced",
                  "商談中", "内覧受付終了", "成約済", "登録取消", "未成約", "不明", "新着 商談中", "要確認")
        base = replace(initial_batch().properties[0], source_key="myoko_akiya_bank")
        for publication in ListingStatus:
            for availability in AvailabilityStatus:
                for label in labels:
                    prop = replace(base, listing_status=publication, availability_status=availability, source_status_ja=label)
                    with self.subTest(publication=publication, availability=availability, label=label):
                        self.assertEqual(self.design.eligible(publication.value, availability.value, label), is_customer_eligible(prop))

    def test_validator_performs_no_network_or_database_connections(self):
        with patch("socket.socket", side_effect=AssertionError("Connections forbidden")):
            schema = SchemaDesign()
            self.assertTrue(schema.eligible("active", "active", None))
            self.assertFalse(schema.eligible("active", "under_negotiation", "商談中"))

    def test_prepared_sql_tests_parse_and_end_in_rollback(self):
        with patch("socket.socket", side_effect=AssertionError("Connections forbidden")):
            statement_count, body_count = parse_future_tests()
        self.assertEqual(statement_count, 62)
        self.assertEqual(body_count, 16)
        for path in Path("sql/tests").glob("*.sql"):
            with self.subTest(path=path):
                statements = parse_sql(path.read_text(encoding="utf-8"))
                self.assertEqual(statements[0].stmt.kind.name, "TRANS_STMT_BEGIN")
                self.assertEqual(statements[-1].stmt.kind.name, "TRANS_STMT_ROLLBACK")

    def test_validation_manifest_defines_explicit_order_and_pins_file_contents(self):
        plan = load_validation_order()
        self.assertEqual(plan["target"], "disposable_local_cluster")
        self.assertEqual([entry["path"] for phase in ("local_setup", "schema", "checks") for entry in plan[phase]], [
            "sql/local/000_test_roles.sql", "sql/001_proposed_schema.sql",
            "sql/tests/001_contract_checks.sql", "sql/tests/002_security_hardening_checks.sql"])

    def test_validation_manifest_rejects_stale_checksums(self):
        plan = load_validation_order()
        plan["schema"][0]["sha256"] = "0" * 64
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            path.write_text(json.dumps(plan), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                load_validation_order(path)

    def test_validation_manifest_rejects_path_escape_and_duplicate_steps(self):
        for invalid in ("../outside.sql", "/tmp/outside.sql", "sql/local/000_test_roles.sql"):
            with self.subTest(invalid=invalid), tempfile.TemporaryDirectory() as directory:
                plan = load_validation_order()
                plan["schema"][0]["path"] = invalid
                path = Path(directory) / "plan.json"
                path.write_text(json.dumps(plan), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "Unsafe or duplicate"):
                    load_validation_order(path)

    def test_local_setup_is_guarded_and_adds_no_object_grants(self):
        statements = [item.stmt for item in parse_sql(Path("sql/local/000_test_roles.sql").read_text(encoding="utf-8"))]
        roles = {s.role: s for s in statements if isinstance(s, ast.CreateRoleStmt)}
        self.assertEqual(set(roles), {"anon", "authenticated", "service_role"})
        for role in roles.values():
            flags = {o.defname: o.arg.boolval for o in role.options}
            self.assertFalse(flags["canlogin"])
            self.assertFalse(flags["superuser"])
            self.assertEqual(flags["bypassrls"], role.role == "service_role")
        self.assertFalse(any(isinstance(s, (ast.GrantStmt, ast.GrantRoleStmt)) for s in statements))
        text = Path("sql/local/000_test_roles.sql").read_text(encoding="utf-8")
        for guard in ("myoko_schema_test_", "inet_server_addr()", "server_version_num", "pg_catalog.pg_roles", "pg_catalog.pg_namespace"):
            self.assertIn(guard, text)

    def test_hardening_checks_replace_privileged_session_identity_without_extra_grants(self):
        statements = [item.stmt for item in parse_sql(Path("sql/tests/002_security_hardening_checks.sql").read_text(encoding="utf-8"))]
        roles = {s.args[0].val.sval for s in statements if isinstance(s, ast.VariableSetStmt)
                 and s.name == "session_authorization" and s.args}
        self.assertEqual(roles, {"anon", "authenticated", "service_role", "crawler_customer_reader", "crawler_writer"})
        self.assertFalse(any(isinstance(s, (ast.GrantStmt, ast.GrantRoleStmt)) for s in statements))
