-- LOCAL TEST SETUP ONLY, NOT A PRODUCTION MIGRATION. NOT EXECUTED IN PHASE 4B-1.
-- Use a new disposable cluster: roles are cluster-wide, not database-local.
-- Refuse remote servers, unexpected database names and pre-existing app roles.
BEGIN;
DO $$
BEGIN
    IF current_database() !~ '^myoko_schema_test_[a-z0-9_]+$' THEN
        RAISE EXCEPTION 'Use a disposable database named myoko_schema_test_<suffix>';
    END IF;
    IF inet_server_addr() IS NOT NULL AND
       inet_server_addr() NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
        RAISE EXCEPTION 'Only a local Unix socket or loopback server is allowed';
    END IF;
    IF current_setting('server_version_num')::integer < 150000 OR
       current_setting('server_encoding') <> 'UTF8' THEN
        RAISE EXCEPTION 'PostgreSQL 15+ with UTF8 is required';
    END IF;
    IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user) THEN
        RAISE EXCEPTION 'Local test setup needs a disposable-cluster superuser';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN
               ('anon', 'authenticated', 'service_role', 'crawler_writer', 'crawler_customer_reader')) OR
       EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname IN ('crawler', 'property_api')) THEN
        RAISE EXCEPTION 'Role/schema names already exist; use a fresh isolated cluster, never modify shared roles';
    END IF;
END;
$$;
CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- Emulate the important Supabase service-role attribute without any object grants.
CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
COMMIT;
