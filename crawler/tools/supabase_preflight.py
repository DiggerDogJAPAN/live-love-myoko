"""Credential-safe, read-only Supabase inventory. There is NO migration executor.

Connection credentials come only from a private environment file/process env.
The target reference is checked before connecting. Every remote query is fixed,
catalog-only SQL in a read-only transaction; no property data is imported/read.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

from .validation_manifest import load_supabase_validation_order

from myoko_property_crawler.db_connection import (
    ENV_KEYS, PROJECT_NAME, PreflightError, Settings, read_private_env,
    settings_from_values, load_settings,
)

APP_ROLES = {"crawler_writer", "crawler_customer_reader"}
APP_SCHEMAS = {"crawler", "property_api"}
PLATFORM_OWNERS = {
    "auth": {"supabase_auth_admin", "supabase_admin"},
    "storage": {"supabase_storage_admin", "supabase_admin"},
    "realtime": {"supabase_admin", "supabase_realtime_admin"},
    "supabase_functions": {"supabase_admin", "supabase_functions_admin"},
}

QUERIES = {
    "identity": """SELECT current_database() AS database_name, current_user AS actor,
        session_user AS session_actor, current_setting('server_version_num')::integer AS server_version_num,
        current_setting('server_encoding') AS server_encoding,
        current_setting('transaction_read_only') AS transaction_read_only,
        has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema""",
    "roles": """SELECT rolname AS name, rolsuper AS superuser, rolcreaterole AS create_role,
        rolcreatedb AS create_database, rolcanlogin AS login, rolbypassrls AS bypass_rls,
        rolinherit AS inherit FROM pg_catalog.pg_roles ORDER BY rolname""",
    "schemas": """SELECT n.nspname AS name, pg_catalog.pg_get_userbyid(n.nspowner) AS owner,
        n.nspacl::text AS privileges FROM pg_catalog.pg_namespace n
        WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' ORDER BY n.nspname""",
    "relations": """SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind,
        pg_catalog.pg_get_userbyid(c.relowner) AS owner,
        c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
        c.relacl::text AS privileges,
        EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_class'::regclass
                AND d.objid = c.oid AND d.deptype = 'e') AS extension_owned
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
          AND c.relkind IN ('r', 'p', 'f', 'm', 'v', 'S') ORDER BY n.nspname, c.relname""",
    "memberships": """SELECT role.rolname AS granted_role, member.rolname AS member,
        m.admin_option FROM pg_catalog.pg_auth_members m
        JOIN pg_catalog.pg_roles role ON role.oid = m.roleid
        JOIN pg_catalog.pg_roles member ON member.oid = m.member ORDER BY role.rolname, member.rolname""",
    "extensions": """SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema
        FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace ORDER BY e.extname""",
    "policies": """SELECT schemaname AS schema, tablename AS table_name, policyname AS name,
        roles, cmd AS command FROM pg_catalog.pg_policies ORDER BY schemaname, tablename, policyname""",
    "default_privileges": """SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS owner,
        n.nspname AS schema, d.defaclobjtype AS object_type, d.defaclacl::text AS privileges
        FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
        ORDER BY owner, schema, object_type""",
    "functions": """SELECT n.nspname AS schema, p.proname AS name,
        pg_catalog.pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer,
        p.proacl::text AS privileges,
        EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_proc'::regclass
                AND d.objid = p.oid AND d.deptype = 'e') AS extension_owned
        FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' ORDER BY n.nspname, p.proname""",
    # Do not print all role configuration: it can contain unrelated secrets.
    "api_schema_settings": """SELECT r.rolname AS role, setting AS schema_setting
        FROM pg_catalog.pg_db_role_setting s JOIN pg_catalog.pg_roles r ON r.oid = s.setrole
        CROSS JOIN LATERAL unnest(s.setconfig) AS settings(setting)
        WHERE setting LIKE 'pgrst.db_schemas=%' ORDER BY r.rolname""",
}

# Opt-in review only. Definitions remain in a private local artifact, never in
# ordinary preflight output. Only the nine previously observed helpers qualify.
SECURITY_QUERIES = {
    "helper_definitions": """SELECT p.oid::integer AS oid, n.nspname AS schema, p.proname AS name,
        pg_get_function_identity_arguments(p.oid) AS arguments,
        pg_get_function_result(p.oid) AS result_type, l.lanname AS language,
        pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer,
        p.proacl::text AS privileges,
        ARRAY(SELECT c FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%') AS search_path,
        pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        JOIN pg_language l ON l.oid=p.prolang
        WHERE (n.nspname='extensions' AND p.proname IN
          ('grant_pg_cron_access','grant_pg_graphql_access','grant_pg_net_access',
           'pgrst_ddl_watch','pgrst_drop_watch','set_graphql_placeholder'))
          OR (n.nspname='public' AND p.proname='rls_auto_enable')
          OR (n.nspname='graphql_public' AND p.proname='graphql')
          OR (n.nspname='pgbouncer' AND p.proname='get_auth')
        ORDER BY n.nspname,p.proname,p.oid""",
    "event_triggers": """SELECT e.evtname AS name, e.evtevent AS event, e.evtenabled AS enabled,
        e.evttags AS tags, pg_get_userbyid(e.evtowner) AS owner,
        n.nspname AS function_schema, p.proname AS function_name
        FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid
        JOIN pg_namespace n ON n.oid=p.pronamespace ORDER BY e.evtname""",
    "membership_options": """SELECT r.rolname AS granted_role, u.rolname AS member,
        m.admin_option, m.inherit_option, m.set_option
        FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
        JOIN pg_roles u ON u.oid=m.member ORDER BY r.rolname,u.rolname""",
    "role_creation_defaults": """SELECT current_setting('createrole_self_grant',true) AS self_grant""",
    "schema_effective_access": """SELECT r.rolname AS role, n.nspname AS schema,
        has_schema_privilege(r.oid,n.oid,'USAGE') AS usage,
        has_schema_privilege(r.oid,n.oid,'CREATE') AS create
        FROM pg_roles r CROSS JOIN pg_namespace n
        WHERE r.rolname IN ('anon','authenticated','authenticator','service_role','postgres')
          AND n.nspname IN ('public','extensions','graphql_public','pgbouncer','crawler','property_api')
        ORDER BY r.rolname,n.nspname""",
    "helper_effective_execute": """SELECT r.rolname AS role, n.nspname AS schema, p.proname AS name,
        has_function_privilege(r.oid,p.oid,'EXECUTE') AS execute,
        has_schema_privilege(r.oid,n.oid,'USAGE') AS schema_usage
        FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE r.rolname IN ('anon','authenticated','authenticator','service_role')
          AND ((n.nspname='public' AND p.proname='rls_auto_enable')
            OR (n.nspname='pgbouncer' AND p.proname='get_auth'))
        ORDER BY r.rolname,n.nspname,p.proname""",
    "api_session_settings": """SELECT current_setting('pgrst.db_schemas',true) AS exposed_schemas,
        current_setting('pgrst.db_extra_search_path',true) AS extra_search_path""",
    "api_role_settings": """SELECT COALESCE(r.rolname,'ALL') AS role,
        COALESCE(d.datname,'ALL') AS database, c AS setting
        FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid=s.setrole
        LEFT JOIN pg_database d ON d.oid=s.setdatabase
        CROSS JOIN LATERAL unnest(s.setconfig) c
        WHERE c LIKE 'pgrst.db_schemas=%' OR c LIKE 'pgrst.db_extra_search_path=%'
        ORDER BY role,database,setting""",
    "publications": """SELECT pubname AS name, puballtables AS all_tables,
        pubinsert AS inserts, pubupdate AS updates, pubdelete AS deletes FROM pg_publication ORDER BY pubname""",
}


def assess_inventory(inventory):
    blockers = []
    identity = inventory["identity"][0]
    if identity["database_name"] != "postgres" or identity["actor"] != "postgres":
        blockers.append("Unexpected database or migration actor")
    if identity["server_version_num"] < 150000 or identity["server_encoding"] != "UTF8":
        blockers.append("PostgreSQL 15+ / UTF8 requirement not met")
    if identity["transaction_read_only"] != "on":
        blockers.append("Read-only transaction was not active")
    role_map = {row["name"]: row for row in inventory["roles"]}
    actor = role_map.get(identity["actor"], {})
    if not (actor.get("create_role") or actor.get("superuser")) or not identity["can_create_schema"]:
        blockers.append("Migration actor lacks declared role/schema creation capability; do not widen grants automatically")
    if APP_ROLES & set(role_map) or APP_SCHEMAS & {row["name"] for row in inventory["schemas"]}:
        blockers.append("Application roles/schemas already exist; fresh-install proposal must not be rerun")
    candidates = [row for row in inventory["relations"] if not row["extension_owned"] and
                  row["owner"] not in PLATFORM_OWNERS.get(row["schema"], set())]
    if candidates:
        blockers.append("Non-platform relations require review; an empty application database is not confirmed")
    functions = [row for row in inventory["functions"] if not row["extension_owned"] and
                 row["owner"] not in PLATFORM_OWNERS.get(row["schema"], set())]
    if functions:
        blockers.append("Non-platform functions require review before treating the project as a fresh installation")
    return {"blockers": blockers, "application_relation_candidates": candidates,
            "application_function_candidates": functions,
            "empty_application_inventory": not candidates and not functions and not (APP_SCHEMAS & {row["name"] for row in inventory["schemas"]}),
            "dashboard_project_name": "user confirmation of reference/name mapping required; not stored in PostgreSQL",
            "data_api_exposure": "SQL-visible settings recorded; dashboard exposed-schema review still required",
            "migration_approved": False}


def inspect_database(settings, connect=None, review_security=False):
    # Import only for actual connectivity; offline configuration checks need no driver.
    if connect is None:
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError:
            raise PreflightError("Install the optional client from requirements-database.txt before connecting") from None
        connect = psycopg.connect
    else:
        dict_row = None
    connection = None
    stage = "connection"
    try:
        connection = connect(settings.dsn, sslmode="verify-full", sslrootcert=settings.sslrootcert,
                             connect_timeout=10, application_name="myoko-schema-readonly-preflight",
                             autocommit=False, prepare_threshold=None, row_factory=dict_row)
        if not connection.pgconn.ssl_in_use:
            raise PreflightError("Verified TLS was not established; no inventory queries were issued")
        connection.read_only = True
        stage = "read-only session setup"
        connection.execute("SET LOCAL statement_timeout = '10s'")
        connection.execute("SET LOCAL lock_timeout = '3s'")
        connection.execute("SET LOCAL search_path = pg_catalog")
        inventory = {}
        queries = {**QUERIES, **SECURITY_QUERIES} if review_security else QUERIES
        for name, sql in queries.items():
            stage = "catalog " + name
            inventory[name] = connection.execute(sql).fetchall()
            if name == "identity":
                identities = inventory[name]
                if (len(identities) != 1 or identities[0]["database_name"] != "postgres"
                        or identities[0]["actor"] != "postgres" or identities[0]["transaction_read_only"] != "on"):
                    raise PreflightError("Unexpected database/actor or read-only state; further inventory stopped")
        return inventory
    except PreflightError:
        raise
    except Exception as error:
        code = getattr(error, "sqlstate", None)
        suffix = " (SQLSTATE " + code + ")" if isinstance(code, str) and re.fullmatch(r"[0-9A-Z]{5}", code) else ""
        # Classify locally; never include the underlying message in output.
        detail = str(error).lower()
        category = "unclassified client/database error"
        patterns = (
            ("certificate verification", ("certificate verify failed", "root certificate", "certificate verification")),
            ("name resolution", ("could not translate host name", "failed to resolve host", "name or service not known", "nodename nor servname")),
            ("authentication", ("password authentication failed", "tenant or user not found", "authentication failed")),
            ("connection timeout", ("timeout expired", "connection timeout")),
            ("network reachability", ("network is unreachable", "connection refused", "no route to host")),
            ("authorization", ("permission denied",)),
        )
        for label, phrases in patterns:
            if any(phrase in detail for phrase in phrases):
                category = label
                break
        raise PreflightError("Read-only inspection failed during " + stage + ": " + category + suffix + "; sensitive details suppressed") from None
    finally:
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                pass
            try:
                connection.close()
            except Exception:
                pass


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=Path(".env.supabase.local"))
    parser.add_argument("--check-config", action="store_true", help="Validate target and checksums without connecting")
    args = parser.parse_args(argv)
    try:
        plan = load_supabase_validation_order()  # Check reviewed remote order before any network access.
        settings = load_settings(args.env_file)
        report = {"project_name": PROJECT_NAME, "project_ref": settings.project_ref,
                  "connection_mode": settings.connection_mode, "tls_mode": "verify-full",
                  "schema_sha256": hashlib.sha256(Path("sql/001_proposed_schema.sql").read_bytes()).hexdigest(),
                  "prepared_file_order": [entry["path"] for phase in ("schema", "checks") for entry in plan[phase]],
                  "proposed_cluster_role_creation": ["crawler_writer", "crawler_customer_reader"],
                  "migration_executed": False}
        if args.check_config:
            report.update({"configuration_ready": True, "database_connected": False})
        else:
            inventory = inspect_database(settings)
            report.update({"database_connected": True, "inventory": inventory, "assessment": assess_inventory(inventory)})
        print(json.dumps(report, indent=2))
        return 0
    except (PreflightError, OSError, ValueError, KeyError):
        # Only our intentionally safe messages are displayed, never driver/URI/parser errors.
        error = sys.exc_info()[1]
        message = str(error) if isinstance(error, PreflightError) else "Local configuration or checksum check failed; details suppressed"
        print("Preflight stopped: " + message, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
