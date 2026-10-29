-- REVIEW ONLY. Apply after 001 only after approval; no production application here.
-- Roles are separate from paid tiers. No administrator/account/payment rows are seeded.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
BEGIN
    IF current_database()<>'postgres' OR current_user<>'postgres'
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls) THEN
        RAISE EXCEPTION 'Run as the existing hosted postgres administrator';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='finder_security' AND nspowner='postgres'::regrole)
       OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('finder_security.memberships')
            AND relowner='postgres'::regrole AND relrowsecurity AND relforcerowsecurity)
       OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('finder_security.membership_snapshot(uuid,uuid)')
            AND proowner='postgres'::regrole AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog','row_security=on']) THEN
        RAISE EXCEPTION 'Apply the revised 001 first; do not repair or overwrite a partial/legacy installation automatically';
    END IF;
END $$;
CREATE TABLE finder_security.account_roles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    account_role text NOT NULL DEFAULT 'customer' CHECK (account_role IN ('customer','administrator')),
    is_active boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE finder_security.account_roles OWNER TO postgres;
ALTER TABLE finder_security.account_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE finder_security.account_roles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON finder_security.account_roles FROM PUBLIC,anon,authenticated,service_role,authenticator,
    crawler_writer,crawler_customer_reader,property_finder_web_reader;

-- Unlike v1 membership_snapshot, this returns a live unpaid account with no ledger
-- row. This permits account management, never listings. Missing role means customer.
CREATE FUNCTION finder_security.account_snapshot(p_user_id uuid,p_session_id uuid)
RETURNS TABLE (
    schema_version integer,user_id uuid,session_id uuid,session_active boolean,
    session_valid_until timestamptz,account_active boolean,tier text,status text,
    payment_status text,access_starts_at timestamptz,paid_through timestamptz,revoked_at timestamptz,
    account_role text,subscription_active boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
    SELECT 2,u.id,s.id,(s.not_after IS NULL OR s.not_after>CURRENT_TIMESTAMP),s.not_after,
        (COALESCE(a.is_active,true) AND u.deleted_at IS NULL AND u.is_anonymous IS FALSE
            AND u.email_confirmed_at IS NOT NULL
            AND (u.banned_until IS NULL OR u.banned_until<=CURRENT_TIMESTAMP)),
        m.tier,COALESCE(m.status,'inactive'),COALESCE(m.payment_status,'unpaid'),
        m.access_starts_at,m.paid_through,m.revoked_at,
        COALESCE(a.account_role,'customer'),COALESCE(m.account_active,false)
    FROM auth.users u
    JOIN auth.sessions s ON s.user_id=u.id AND s.id=p_session_id
    LEFT JOIN finder_security.account_roles a ON a.user_id=u.id
    LEFT JOIN finder_security.memberships m ON m.user_id=u.id
    WHERE u.id=p_user_id
$$;
ALTER FUNCTION finder_security.account_snapshot(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION finder_security.account_snapshot(uuid,uuid)
    FROM PUBLIC,anon,authenticated,service_role,authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader;
GRANT EXECUTE ON FUNCTION finder_security.account_snapshot(uuid,uuid) TO property_finder_web_reader;
-- Administrator promotion is a separately approved operator action on account_roles.
-- Neither public registration nor user_metadata/app_metadata assigns this role.
COMMIT;
