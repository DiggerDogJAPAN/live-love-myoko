from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from tools.supabase_preflight import (ENV_KEYS, PROJECT_NAME, PreflightError, QUERIES, SECURITY_QUERIES,
    assess_inventory, inspect_database, load_settings, main, read_private_env, settings_from_values)
from tools.validation_manifest import load_supabase_validation_order

REFERENCE = "a" * 20  # Fictional project; no test connects to it.
SECRET = "SYNTHETIC_PASSWORD_SENTINEL"


def values(pooler=True):
    user = "postgres." + REFERENCE if pooler else "postgres"
    host = "aws-0-test-region.pooler.supabase.com" if pooler else "db." + REFERENCE + ".supabase.co"
    return {"MYOKO_DATABASE_URL": "postgresql://" + user + ":" + SECRET + "@" + host + ":5432/postgres",
            "MYOKO_SUPABASE_PROJECT_REF": REFERENCE, "MYOKO_SUPABASE_PROJECT_NAME": PROJECT_NAME}


def inventory():
    return {"identity": [{"database_name": "postgres", "actor": "postgres", "session_actor": "postgres",
                          "server_version_num": 170000, "server_encoding": "UTF8", "transaction_read_only": "on",
                          "can_create_schema": True}],
            "roles": [{"name": "postgres", "create_role": True, "superuser": False}],
            "schemas": [{"name": "public"}, {"name": "auth"}],
            "relations": [{"schema": "auth", "name": "users", "owner": "supabase_auth_admin", "extension_owned": False}],
            "functions": [], "memberships": [], "extensions": [], "policies": [], "default_privileges": [], "api_schema_settings": []}


class FakeConnection:
    def __init__(self, data=None, tls=True):
        self.data = data if data is not None else inventory()
        self.pgconn = SimpleNamespace(ssl_in_use=tls)
        self.read_only = False
        self.executed = []
        self.rollback = Mock()
        self.close = Mock()

    def execute(self, sql):
        if not self.read_only:
            raise AssertionError("SQL attempted outside a read-only transaction")
        self.executed.append(sql)
        if sql.startswith("SET LOCAL"):
            return None
        name = next(key for key, value in {**QUERIES, **SECURITY_QUERIES}.items() if value == sql)
        return SimpleNamespace(fetchall=lambda: self.data[name])


class SupabaseConfigurationTests(unittest.TestCase):
    def private_file(self, directory, data=None):
        path = Path(directory) / '.env.supabase.local'
        content = data if data is not None else values()
        path.write_text('\n'.join(key + '=' + value for key, value in content.items()) + '\n', encoding='utf-8')
        path.chmod(0o600)
        return path

    def test_session_pooler_and_direct_reference_validation(self):
        for pooler, mode in ((True, 'session_pooler'), (False, 'direct')):
            settings = settings_from_values(values(pooler))
            self.assertEqual(settings.connection_mode, mode)
            self.assertEqual(settings.project_ref, REFERENCE)
            self.assertNotIn(SECRET, repr(settings))

    def test_uri_without_query_parameters_is_valid(self):
        self.assertEqual(settings_from_values(values()).sslrootcert, 'system')

    def test_wrong_reference_and_project_name_are_rejected(self):
        for key, value in (('MYOKO_SUPABASE_PROJECT_REF', 'b' * 20), ('MYOKO_SUPABASE_PROJECT_NAME', 'Other Project')):
            data = values()
            data[key] = value
            with self.subTest(key=key), self.assertRaises(PreflightError):
                settings_from_values(data)

    def test_transaction_pooling_and_other_hosts_are_rejected(self):
        for old, new in ((':5432/', ':6543/'), ('.pooler.supabase.com', '.other.invalid')):
            data = values()
            data['MYOKO_DATABASE_URL'] = data['MYOKO_DATABASE_URL'].replace(old, new)
            with self.subTest(new=new), self.assertRaises(PreflightError):
                settings_from_values(data)

    def test_unsafe_query_options_are_rejected(self):
        for query in ('sslmode=disable', 'hostaddr=127.0.0.1', 'options=unsafe', 'sslmode=require&sslmode=disable'):
            data = values()
            data['MYOKO_DATABASE_URL'] += '?' + query
            with self.subTest(query=query), self.assertRaises(PreflightError):
                settings_from_values(data)

    def test_missing_or_relative_ca_path_stops_before_connecting(self):
        with tempfile.TemporaryDirectory() as directory:
            for filename in ('relative.crt', str(Path(directory) / 'missing.crt')):
                data = values()
                data['MYOKO_DB_SSLROOTCERT'] = filename
                with self.subTest(filename=filename), self.assertRaises(PreflightError):
                    settings_from_values(data)

    def test_encrypted_uri_options_do_not_weaken_verified_tls(self):
        data = values()
        data['MYOKO_DATABASE_URL'] += '?sslmode=require'
        settings = settings_from_values(data)
        connection = FakeConnection()
        connect = Mock(return_value=connection)
        inspect_database(settings, connect=connect)
        self.assertEqual(connect.call_args.kwargs['sslmode'], 'verify-full')

    def test_private_file_permissions_quotes_and_no_secret_logging(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.private_file(directory)
            self.assertEqual(load_settings(path, {}).project_ref, REFERENCE)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            path.chmod(0o644)
            with self.assertRaises(PreflightError):
                read_private_env(path)

    def test_environment_file_is_data_not_shell_code(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.private_file(directory)
            path.write_text('MYOKO_DATABASE_URL="$(do-not-execute)"\n', encoding='utf-8')
            self.assertEqual(read_private_env(path)['MYOKO_DATABASE_URL'], '$(do-not-execute)')
            path.write_text('MYOKO_DATABASE_URL=x\nMYOKO_DATABASE_URL=y\n', encoding='utf-8')
            with self.assertRaises(PreflightError):
                read_private_env(path)

    def test_ambient_routing_cannot_redirect_the_connection(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.private_file(directory)
            with self.assertRaises(PreflightError):
                load_settings(path, {'PGSERVICE': 'other-project'})

    def test_config_only_command_never_connects_and_hides_secret(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.private_file(directory)
            output = io.StringIO()
            with patch.dict(os.environ, {}, clear=True), patch('tools.supabase_preflight.inspect_database') as connect, redirect_stdout(output):
                self.assertEqual(main(['--env-file', str(path), '--check-config']), 0)
                connect.assert_not_called()
            self.assertNotIn(SECRET, output.getvalue())
            self.assertFalse(json.loads(output.getvalue())['database_connected'])


class SupabaseReadOnlyTests(unittest.TestCase):
    def test_only_catalog_queries_in_read_only_transaction(self):
        connection = FakeConnection()
        connect = Mock(return_value=connection)
        result = inspect_database(settings_from_values(values()), connect=connect)
        self.assertEqual(result, inventory())
        self.assertEqual(len(connection.executed), len(QUERIES) + 3)
        self.assertTrue(all(sql.startswith(('SELECT', 'SET LOCAL')) for sql in connection.executed))
        connection.rollback.assert_called_once()
        connection.close.assert_called_once()
        self.assertEqual(connect.call_args.kwargs['prepare_threshold'], None)

    def test_no_inventory_queries_before_tls(self):
        connection = FakeConnection(tls=False)
        with self.assertRaises(PreflightError):
            inspect_database(settings_from_values(values()), connect=Mock(return_value=connection))
        self.assertEqual(connection.executed, [])
        connection.close.assert_called_once()

    def test_wrong_identity_stops_before_further_catalog_inspection(self):
        data = inventory()
        data['identity'][0]['database_name'] = 'other'
        connection = FakeConnection(data)
        with self.assertRaises(PreflightError):
            inspect_database(settings_from_values(values()), connect=Mock(return_value=connection))
        self.assertEqual(len(connection.executed), 4)

    def test_connection_errors_never_echo_uri_password_or_driver_message(self):
        for message, category in ((SECRET + ' certificate verify failed', 'certificate verification'),
                                  (SECRET + ' password authentication failed', 'authentication'),
                                  (values()['MYOKO_DATABASE_URL'], 'unclassified')):
            with self.subTest(category=category):
                with self.assertRaises(PreflightError) as caught:
                    inspect_database(settings_from_values(values()), connect=Mock(side_effect=RuntimeError(message)))
                self.assertNotIn(SECRET, str(caught.exception))
                self.assertIn(category, str(caught.exception))

    def test_close_errors_do_not_expose_connection_details(self):
        connection = FakeConnection()
        connection.close.side_effect = RuntimeError(SECRET)
        self.assertEqual(inspect_database(settings_from_values(values()), connect=Mock(return_value=connection)), inventory())

    def test_existing_application_relations_or_functions_block_fresh_install(self):
        for kind in ('relations', 'functions'):
            data = inventory()
            data[kind].append({'schema': 'public', 'name': 'existing_app', 'owner': 'postgres', 'extension_owned': False})
            assessment = assess_inventory(data)
            self.assertTrue(assessment['blockers'])
            self.assertFalse(assessment['empty_application_inventory'])

    def test_managed_platform_relations_are_not_mistaken_for_customer_tables(self):
        assessment = assess_inventory(inventory())
        self.assertEqual(assessment['blockers'], [])
        self.assertTrue(assessment['empty_application_inventory'])
        self.assertFalse(assessment['migration_approved'])

    def test_existing_application_roles_or_schemas_prevent_reapply(self):
        for kind, entry in (('roles', {'name': 'crawler_writer'}), ('schemas', {'name': 'crawler'})):
            data = inventory()
            data[kind].append(entry)
            self.assertTrue(assess_inventory(data)['blockers'])

    def test_catalog_queries_never_select_passwords_or_function_bodies(self):
        for query in QUERIES.values():
            self.assertNotIn('rolpassword', query)
            self.assertNotIn('pg_authid', query)
            self.assertNotIn('pg_get_functiondef', query)
        self.assertIn("WHERE setting LIKE 'pgrst.db_schemas=%'", QUERIES['api_schema_settings'])


class SupabasePlanTests(unittest.TestCase):
    def test_remote_manifest_excludes_local_bootstrap_and_checks_hashes(self):
        plan = load_supabase_validation_order()
        self.assertTrue(plan['approval_required'])
        self.assertTrue(plan['readonly_preflight_required'])
        self.assertFalse(plan['real_property_import'])
        self.assertNotIn('local_setup', plan)
        self.assertEqual([x['path'] for x in plan['schema']], ['sql/001_proposed_schema.sql'])

    def test_remote_plan_rejects_missing_approval_and_preflight(self):
        plan = load_supabase_validation_order()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'plan.json'
            for key in ('approval_required', 'readonly_preflight_required'):
                invalid = dict(plan, **{key: False})
                path.write_text(json.dumps(invalid), encoding='utf-8')
                with self.subTest(key=key), self.assertRaises(ValueError):
                    load_supabase_validation_order(path)

    def test_synthetic_checks_guard_empty_tables_and_roll_back(self):
        sql = Path('sql/supabase/001_synthetic_validation.sql').read_text(encoding='utf-8')
        body = '\n'.join(line for line in sql.splitlines() if not line.startswith('--'))
        self.assertTrue(body.strip().startswith('BEGIN;'))
        self.assertTrue(body.strip().endswith('ROLLBACK;'))
        self.assertNotIn('SET SESSION AUTHORIZATION', body)
        self.assertNotIn('CREATE ROLE', body)
        guard, inserts = body.split('INSERT INTO', 1)
        for table in ('sources', 'properties', 'crawl_runs', 'price_changes', 'status_changes', 'translations'):
            self.assertIn('SELECT 1 FROM crawler.' + table, guard)
        self.assertIn('SET LOCAL ROLE crawler_customer_reader', inserts)
        self.assertIn('SET LOCAL ROLE crawler_writer', inserts)
