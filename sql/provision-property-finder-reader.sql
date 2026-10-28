-- Provisioned 2026-10-28 in the dedicated project. Reference script; do not rerun.
-- Run only for a new environment as the dedicated project's administrator.
-- PostgreSQL 17+. No table/view/RLS/Data API changes, no password stored here.
-- Intentionally fails if the login already exists; review before any retry.
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'crawler_customer_reader'
        AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcanlogin
    ) OR to_regclass('property_api.customer_properties') IS NULL THEN
        RAISE EXCEPTION 'Expected restricted reader/view not found; stop and review project';
    END IF;
END $$;

CREATE ROLE property_finder_web_reader
    LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
    CONNECTION LIMIT 5;
GRANT CONNECT ON DATABASE postgres TO property_finder_web_reader;
GRANT crawler_customer_reader TO property_finder_web_reader WITH INHERIT FALSE, SET TRUE;
ALTER ROLE property_finder_web_reader SET default_transaction_read_only = on;
ALTER ROLE property_finder_web_reader SET statement_timeout = '5s';
ALTER ROLE property_finder_web_reader SET idle_in_transaction_session_timeout = '10s';

COMMIT;

-- In an interactive psql session AFTER committing, set a unique generated password:
-- \password property_finder_web_reader
-- Do not paste/store the password in this file, a shell command, chat or Git.
-- Do not grant crawler schema USAGE, crawler_writer, BYPASSRLS, service_role,
-- anon/authenticated access or any direct table privileges.
