-- REVIEW ONLY: NOT APPLIED. Requires separate approval and verified recovery coverage.
-- Does not change property data, crawler roles/policies or existing view grants.
-- No customer rows, active memberships, credentials or payment writes are seeded.
-- Run once as an authorized database administrator; deliberately not idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
    IF current_database()<>'postgres' OR current_user<>'postgres'
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls)
       OR NOT has_database_privilege(current_user,current_database(),'CREATE') THEN
        RAISE EXCEPTION 'Run as the existing hosted postgres administrator; do not elevate application roles';
    END IF;
    IF to_regclass('auth.users') IS NULL OR to_regclass('auth.sessions') IS NULL
       OR to_regclass('property_api.customer_properties') IS NULL THEN
        RAISE EXCEPTION 'Expected dedicated Supabase Auth/property project';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='property_finder_web_reader'
        AND rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls
        AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
       OR pg_has_role('property_finder_web_reader','crawler_writer','MEMBER')
       OR pg_has_role('property_finder_web_reader','postgres','MEMBER') THEN
        RAISE EXCEPTION 'Expected isolated restricted website reader';
    END IF;
    IF (SELECT count(*) FROM pg_roles WHERE rolname IN
        ('anon','authenticated','service_role','authenticator','crawler_writer','crawler_customer_reader'))<>6 THEN
        RAISE EXCEPTION 'Expected existing Supabase and crawler roles';
    END IF;
    IF NOT has_schema_privilege(current_user,'auth','USAGE')
       OR NOT has_column_privilege(current_user,'auth.users','id','REFERENCES')
       OR NOT (SELECT bool_and(has_column_privilege(current_user,'auth.'||t,c,'SELECT'))
            FROM (VALUES ('users','id'),('users','banned_until'),('users','deleted_at'),
                ('users','is_anonymous'),('users','email_confirmed_at'),
                ('sessions','id'),('sessions','user_id'),('sessions','not_after')) AS required(t,c)) THEN
        RAISE EXCEPTION 'Existing postgres Auth read/reference permissions are required; do not grant custom-role Auth access';
    END IF;
END $$;

-- Supabase's supported pattern: postgres already has Auth read access. Fixed
-- SECURITY DEFINER helpers retain that owner; no new role receives Auth grants.
CREATE SCHEMA finder_security AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA finder_security FROM PUBLIC,anon,authenticated,service_role,authenticator,
    crawler_writer,crawler_customer_reader,property_finder_web_reader;

CREATE TABLE finder_security.memberships (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tier text NOT NULL CHECK (tier IN ('basic','premium')),
    account_active boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'inactive'
        CHECK (status IN ('active','inactive','past_due','unpaid','canceled','expired')),
    payment_status text NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN ('paid','unpaid','refunded')),
    access_starts_at timestamptz NOT NULL,
    paid_through timestamptz NOT NULL,
    revoked_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (paid_through > access_starts_at)
);
ALTER TABLE finder_security.memberships OWNER TO postgres;
ALTER TABLE finder_security.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE finder_security.memberships FORCE ROW LEVEL SECURITY;
-- No public policies. Only the checked postgres owner bypasses these private
-- tables' RLS inside the bounded helpers; callers receive no table grants.
REVOKE ALL ON ALL TABLES IN SCHEMA finder_security FROM PUBLIC,anon,authenticated,
    service_role,authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader;

CREATE FUNCTION finder_security.membership_snapshot(p_user_id uuid,p_session_id uuid)
RETURNS TABLE (
    schema_version integer,user_id uuid,session_id uuid,session_active boolean,
    session_valid_until timestamptz,account_active boolean,tier text,status text,
    payment_status text,access_starts_at timestamptz,paid_through timestamptz,revoked_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on
AS $$
    SELECT 1,m.user_id,s.id,
        (s.not_after IS NULL OR s.not_after > CURRENT_TIMESTAMP),s.not_after,
        (m.account_active AND u.deleted_at IS NULL AND u.is_anonymous IS FALSE
            AND u.email_confirmed_at IS NOT NULL
            AND (u.banned_until IS NULL OR u.banned_until <= CURRENT_TIMESTAMP)),
        m.tier,m.status,m.payment_status,m.access_starts_at,m.paid_through,m.revoked_at
    FROM finder_security.memberships m
    JOIN auth.users u ON u.id=m.user_id
    JOIN auth.sessions s ON s.user_id=m.user_id AND s.id=p_session_id
    WHERE m.user_id=p_user_id
$$;
ALTER FUNCTION finder_security.membership_snapshot(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION finder_security.membership_snapshot(uuid,uuid)
    FROM PUBLIC,anon,authenticated,service_role,authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader;
GRANT USAGE ON SCHEMA finder_security TO property_finder_web_reader;
GRANT EXECUTE ON FUNCTION finder_security.membership_snapshot(uuid,uuid) TO property_finder_web_reader;
-- Every future private object must revoke its own ACLs explicitly. Do not change
-- postgres's existing global defaults or assume per-schema revokes override them.

-- No membership writer/login is provisioned. A later reviewed billing service must
-- have its own narrowly scoped, audited writes. Never use the crawler writer or
-- grant customer/admin browser JWT roles access to this schema.
COMMIT;
