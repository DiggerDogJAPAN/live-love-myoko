import importlib.util
from pathlib import Path
import unittest
from contextlib import nullcontext, redirect_stderr
from unittest.mock import patch
from types import SimpleNamespace
from io import StringIO

spec = importlib.util.spec_from_file_location("privacy_retention", Path(__file__).parents[1] / "scripts/privacy-retention.py")
retention = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)


class Connection:
    def __init__(self, results, role=retention.ROLE):
        self.results = iter(results)
        self.role = role
        self.calls = []

    def execute(self, query):
        self.calls.append(query)
        self.value = (self.role, "postgres") if query.startswith("SELECT current_user") else (next(self.results),)
        return self

    def fetchone(self):
        return self.value

    def transaction(self):
        return nullcontext()


class RetentionTests(unittest.TestCase):
    def test_only_verified_supabase_project_and_dedicated_role_are_accepted(self):
        value = "postgresql://finder_privacy_retention_worker.fgdoqsepihlzfqlqymet:synthetic@aws-0-test.pooler.supabase.com:5432/postgres"
        env = {"FINDER_PRIVACY_RETENTION_DATABASE_URL": value, "FINDER_PRIVACY_DB_SSLROOTCERT": "/private/synthetic-ca.crt"}
        self.assertEqual(retention.configuration(env)[0], value)
        for wrong in [value.replace("finder_privacy_retention_worker", "postgres"), value.replace("fgdoqsepihlzfqlqymet", "a" * 20), value.replace("pooler.supabase.com", "example.invalid"), value + "?options=unsafe"]:
            with self.assertRaises(ValueError):
                retention.configuration({**env, "FINDER_PRIVACY_RETENTION_DATABASE_URL": wrong})

    def test_cleanup_is_bounded_and_summary_has_no_record_values(self):
        c = Connection([{"deliveryRowsDeleted": 2, "expiredReceiptsDeleted": 1}, {"deliveryRowsDeleted": 0, "expiredReceiptsDeleted": 0}])
        batches = []
        self.assertEqual(retention.run_cleanup(c, batches.append), {"deliveryRowsDeleted": 2, "expiredReceiptsDeleted": 1})
        self.assertEqual(batches, [{"deliveryRowsDeleted": 2, "expiredReceiptsDeleted": 1}])
        self.assertEqual(c.calls, ["SELECT current_user,current_database()", "SELECT public.finder_privacy_cleanup()", "SELECT public.finder_privacy_cleanup()"])
        c = Connection([{"deliveryRowsDeleted": 1000, "expiredReceiptsDeleted": 0}] * 20)
        self.assertEqual(retention.run_cleanup(c)["deliveryRowsDeleted"], 10000)
        self.assertEqual(len(c.calls), 11)

    def test_overscoped_role_or_unexpected_result_never_runs_unbounded_cleanup(self):
        c = Connection([], role="postgres")
        with self.assertRaises(ValueError):
            retention.run_cleanup(c)
        self.assertEqual(len(c.calls), 1)
        with self.assertRaises(ValueError):
            retention.run_cleanup(Connection([{"recipient": "DO NOT LOG"}]))

    def test_connection_failures_do_not_log_credentials_or_exception_contents(self):
        value = "postgresql://finder_privacy_retention_worker.fgdoqsepihlzfqlqymet:PRIVATE_PASSWORD@aws-0-test.pooler.supabase.com:5432/postgres"
        env = {"FINDER_PRIVACY_RETENTION_DATABASE_URL": value, "FINDER_PRIVACY_DB_SSLROOTCERT": "/private/synthetic-ca.crt"}
        def fail(*args, **kwargs):
            raise RuntimeError(value)
        output = StringIO()
        with patch.dict(retention.os.environ, env, clear=True), patch.dict(retention.sys.modules, {"psycopg": SimpleNamespace(connect=fail)}), redirect_stderr(output):
            self.assertEqual(retention.main(), 1)
        self.assertNotIn("PRIVATE_PASSWORD", output.getvalue())
        self.assertNotIn("postgresql", output.getvalue())


if __name__ == "__main__":
    unittest.main()
