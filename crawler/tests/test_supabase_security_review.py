"""Offline review regressions; no remote SQL is executed by these tests."""

import copy
import hashlib
import json
from pathlib import Path
import unittest
from unittest.mock import Mock

from tools.review_supabase_security import review_helpers, safe_summary
from tools.supabase_preflight import inspect_database, SECURITY_QUERIES
from .test_supabase_preflight import FakeConnection, SECRET, inventory, settings_from_values, values


def security_inventory():
    data = inventory()
    data.update({key: [] for key in SECURITY_QUERIES})
    data['helper_definitions'] = [{'schema': 'public', 'name': 'rls_auto_enable', 'arguments': '',
        'result_type': 'event_trigger', 'owner': 'postgres', 'security_definer': True,
        'search_path': ['search_path=pg_catalog'], 'privileges': None,
        'definition': 'synthetic function body ' + SECRET}]
    data['functions'] = [{'schema': 'public', 'name': 'rls_auto_enable', 'owner': 'postgres', 'extension_owned': False}]
    return data


def baseline(data):
    row = data['helper_definitions'][0]
    return {'helpers': {'public.rls_auto_enable()': {
        **{key: row[key] for key in ('owner', 'privileges', 'search_path')},
        'definition_sha256': hashlib.sha256(row['definition'].encode()).hexdigest()}},
        'event_triggers': copy.deepcopy(data['event_triggers'])}


class SecurityReviewTests(unittest.TestCase):
    def test_optional_review_only_uses_fixed_read_only_catalog_queries(self):
        data = security_inventory()
        connection = FakeConnection(data)
        result = inspect_database(settings_from_values(values()), connect=Mock(return_value=connection), review_security=True)
        self.assertEqual(result, data)
        self.assertTrue(all(sql.startswith(('SELECT', 'SET LOCAL')) for sql in connection.executed))
        self.assertTrue(all(sql in connection.executed for sql in SECURITY_QUERIES.values()))
        connection.rollback.assert_called_once()

    def test_console_summary_never_prints_helper_definitions(self):
        data = security_inventory()
        output = json.dumps(safe_summary(data))
        self.assertNotIn(SECRET, output)
        self.assertNotIn('synthetic function body', output)
        self.assertIn('definition_sha256', output)
        self.assertFalse(safe_summary(data)['database_changed'])

    def test_review_accepts_exact_baseline_without_granting_approval(self):
        data = security_inventory()
        result = review_helpers(data, baseline(data))
        self.assertTrue(result['reviewed_helpers_match'])
        self.assertFalse(result['migration_approved'])
        self.assertTrue(result['data_api_dashboard_confirmation_required'])

    def test_review_rejects_definition_owner_acl_and_search_path_drift(self):
        for key, replacement in (('definition', 'changed'), ('owner', 'other'),
                                  ('privileges', '{anon=X/postgres}'), ('search_path', ['search_path=public'])):
            data = security_inventory()
            reviewed = baseline(data)
            data['helper_definitions'][0][key] = replacement
            with self.subTest(key=key):
                result = review_helpers(data, reviewed)
                self.assertFalse(result['reviewed_helpers_match'])
                self.assertEqual(result['helper_drift'], ['public.rls_auto_enable()'])

    def test_review_rejects_missing_helper_and_unexpected_application_function(self):
        for missing in (True, False):
            data = security_inventory()
            reviewed = baseline(data)
            if missing:
                data['helper_definitions'] = []
            else:
                data['functions'].append({'schema': 'public', 'name': 'unreviewed', 'owner': 'postgres', 'extension_owned': False})
            with self.subTest(missing=missing):
                self.assertFalse(review_helpers(data, reviewed)['reviewed_helpers_match'])

    def test_review_rejects_event_trigger_changes(self):
        data = security_inventory()
        reviewed = baseline(data)
        data['event_triggers'].append({'name': 'new_trigger'})
        result = review_helpers(data, reviewed)
        self.assertTrue(result['event_trigger_drift'])
        self.assertFalse(result['reviewed_helpers_match'])

    def test_existing_helper_baseline_has_only_hashes_and_metadata(self):
        reviewed = json.loads(Path('sql/supabase/reviewed-helpers.json').read_text())
        self.assertEqual(len(reviewed['helpers']), 9)
        for row in reviewed['helpers'].values():
            self.assertEqual(set(row), {'owner', 'privileges', 'search_path', 'definition_sha256'})
            self.assertRegex(row['definition_sha256'], '^[0-9a-f]{64}$')


try:
    from pglast import ast, parse_sql
    from tools.schema_checks import SchemaDesign, parse_future_tests
except ImportError:
    SchemaDesign = None


@unittest.skipIf(SchemaDesign is None, 'Optional SQL parser: install requirements-schema.txt')
class HardenedMigrationTests(unittest.TestCase):
    def test_rehearsal_has_one_transaction_and_never_commits(self):
        from tools.prepare_supabase_rehearsal import build_rehearsal
        from unittest.mock import patch
        with patch('socket.socket', side_effect=AssertionError('Network forbidden')):
            sql = build_rehearsal()
        statements = [x.stmt for x in parse_sql(sql)]
        transactions = [x.kind.name for x in statements if isinstance(x, ast.TransactionStmt)]
        self.assertEqual(transactions, ['TRANS_STMT_BEGIN', 'TRANS_STMT_ROLLBACK'])
        self.assertEqual(sum(isinstance(x, ast.CreateStmt) for x in statements), 6)
        self.assertEqual(sum(isinstance(x, ast.CreateRoleStmt) for x in statements), 2)
        self.assertEqual(sum(isinstance(x, ast.GrantRoleStmt) for x in statements), 1)

    def test_rehearsal_retains_safety_guards_and_all_procedural_bodies_parse(self):
        from tools.prepare_supabase_rehearsal import build_rehearsal
        import tempfile
        sql = build_rehearsal()
        self.assertIn('Synthetic validation requires empty application tables', sql)
        self.assertIn('WITH INHERIT FALSE, SET TRUE', sql)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'rehearsal.sql'
            path.write_text(sql, encoding='utf-8')
            self.assertEqual(parse_future_tests(path), (106, 11))

    def test_migration_pins_search_path_and_bounded_timeouts_locally(self):
        design = SchemaDesign()
        settings = {node.name: node for node in design.statements if isinstance(node, ast.VariableSetStmt)}
        self.assertEqual(set(settings), {'search_path', 'lock_timeout', 'statement_timeout'})
        for key, value in (('search_path', 'pg_catalog'), ('lock_timeout', '5s'), ('statement_timeout', '60s')):
            self.assertTrue(settings[key].is_local)
            self.assertEqual(settings[key].args[0].val.sval, value)

    def test_customer_view_explicitly_excludes_synthetic_sources(self):
        clause = SchemaDesign().views['customer_properties'].query.whereClause
        self.assertEqual(clause.boolop.name, 'AND_EXPR')
        self.assertEqual(clause.args[1].boolop.name, 'NOT_EXPR')
        self.assertEqual([x.sval for x in clause.args[1].args[0].fields], ['s', 'synthetic'])

    def test_remote_synthetic_suite_parses_all_procedural_bodies(self):
        filename = Path('sql/supabase/001_synthetic_validation.sql')
        count, bodies = parse_future_tests(filename)
        self.assertEqual((count, bodies), (43, 11))
        statements = [x.stmt for x in parse_sql(filename.read_text())]
        self.assertEqual(statements[-1].kind.name, 'TRANS_STMT_ROLLBACK')
        roles = {node.args[0].val.sval for node in statements
                 if isinstance(node, ast.VariableSetStmt) and node.name == 'role' and node.args}
        self.assertEqual(roles, {'anon', 'authenticated', 'service_role', 'crawler_writer', 'crawler_customer_reader'})
        self.assertFalse(any(isinstance(x, (ast.GrantStmt, ast.CreateRoleStmt, ast.CreateStmt)) for x in statements))
        grants = [x for x in statements if isinstance(x, ast.GrantRoleStmt)]
        self.assertEqual(len(grants), 1)
        self.assertEqual([x.rolename for x in grants[0].grantee_roles], ['postgres'])
        self.assertEqual({x.priv_name for x in grants[0].granted_roles}, {'crawler_writer', 'crawler_customer_reader'})
        options = {x.defname: x.arg.boolval for x in grants[0].opt}
        self.assertEqual(options, {'inherit': False, 'set': True})

    def test_role_capability_guard_precedes_any_fixture_insert(self):
        sql = Path('sql/supabase/001_synthetic_validation.sql').read_text()
        guard = sql.split('INSERT INTO', 1)[0]
        self.assertIn("current_setting('server_version_num')::integer < 170000", guard)
        self.assertIn("pg_has_role(current_user, 'crawler_customer_reader', 'SET')", guard)
        self.assertIn("pg_has_role(current_user, 'crawler_writer', 'SET')", guard)
        self.assertLess(sql.index('m.admin_option'), sql.index('GRANT crawler_customer_reader'))

    def test_subscription_claims_never_authorize_database_access(self):
        # Subscription state is deliberately not a caller-controlled SQL GUC.
        function = SchemaDesign().functions[('crawler', 'customer_eligible')]
        self.assertEqual([x.name for x in function.parameters], ['publication', 'availability', 'status_label'])
        sql = Path('sql/supabase/001_synthetic_validation.sql').read_text()
        self.assertIn('"is_subscribed":true', sql)
        self.assertIn('Claimed subscription bypassed backend-only access', sql)
        self.assertIn('Authenticated customer accessed private crawler records', sql)
