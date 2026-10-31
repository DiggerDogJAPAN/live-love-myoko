"""Bounded retention only. No customer exports, account deletion or email sending."""
import json
import os
import sys
from urllib.parse import parse_qs, unquote, urlsplit

PROJECT = "fgdoqsepihlzfqlqymet"
ROLE = "finder_privacy_retention_worker"


def configuration(env):
    value = env.get("FINDER_PRIVACY_RETENTION_DATABASE_URL", "")
    cert = env.get("FINDER_PRIVACY_DB_SSLROOTCERT", "")
    parsed = urlsplit(value)
    login = unquote(parsed.username or "")
    direct = parsed.hostname == "db." + PROJECT + ".supabase.co"
    pooler = (parsed.hostname or "").endswith(".pooler.supabase.com")
    expected_login = ROLE if direct else ROLE + "." + PROJECT
    if (parsed.scheme not in ("postgres", "postgresql") or not (direct or pooler)
            or login != expected_login or not parsed.password or parsed.path != "/postgres"
            or parsed.fragment or set(parse_qs(parsed.query)) - {"sslmode"} or not cert):
        raise ValueError("Invalid retention configuration")
    return value, cert


def run_cleanup(connection, report_batch=None):
    if connection.execute("SELECT current_user,current_database()").fetchone() != (ROLE, "postgres"):
        raise ValueError("Unexpected retention database role")
    totals = {"deliveryRowsDeleted": 0, "expiredReceiptsDeleted": 0}
    for _ in range(10):
        with connection.transaction():
            row = connection.execute("SELECT public.finder_privacy_cleanup()").fetchone()[0]
            if not isinstance(row, dict) or set(row) != set(totals):
                raise ValueError("Invalid retention result")
            if any(type(row[k]) is not int or not 0 <= row[k] <= 1000 for k in totals):
                raise ValueError("Invalid retention result")
            for key in totals:
                totals[key] += row[key]
        if report_batch and any(row.values()):
            report_batch({key: row[key] for key in totals})
        if not any(row.values()):
            break
    return totals


def main():
    try:
        value, cert = configuration(os.environ)
        import psycopg  # Already used by crawler's existing [database] extra.
        with psycopg.connect(value, sslmode="verify-full", sslrootcert=cert,
                              connect_timeout=10, autocommit=True,
                              options="-c statement_timeout=30000 -c lock_timeout=3000") as connection:
            counts = run_cleanup(connection, lambda batch: print(json.dumps({"event": "privacy_retention_batch", **batch}), flush=True))
            print(json.dumps({"event": "privacy_retention_cleanup", **counts}))
        return 0
    except Exception:
        # Connection exceptions can contain URLs, credentials or record values.
        print("Privacy retention cleanup failed; review configuration and database permissions.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
