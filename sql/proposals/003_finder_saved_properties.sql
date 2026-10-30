-- REVIEW ONLY / NOT APPLIED. Apply once after 001/002 with verified recovery.
-- No Auth ownership/policy changes, crawler writes, user/role/payment seeds.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
BEGIN
    IF current_database()<>'postgres' OR current_user<>'postgres'
       OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls)
       OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('finder_security.account_snapshot(uuid,uuid)')
            AND proowner='postgres'::regrole AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog','row_security=on'])
       OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('finder_security.account_roles')
            AND relowner='postgres'::regrole AND relrowsecurity AND relforcerowsecurity)
       OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='property_finder_web_reader' AND rolcanlogin AND NOT rolinherit
            AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
       OR pg_has_role('property_finder_web_reader','crawler_writer','MEMBER')
       OR to_regclass('crawler.properties') IS NULL
       OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='crawler.properties'::regclass AND attname='id' AND atttypid='uuid'::regtype AND NOT attisdropped)
       OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='property_api.customer_properties'::regclass AND relowner='postgres'::regrole
            AND reloptions @> ARRAY['security_invoker=true','security_barrier=true']) THEN
        RAISE EXCEPTION 'Expected existing postgres-owned membership and eligible property schema; stop for review';
    END IF;
    -- Drift guard from the read-only production catalog review. Never replace an
    -- unreviewed newer eligibility/thumbnail view with this saved-feature proposal.
    IF md5(pg_get_viewdef('property_api.customer_properties'::regclass,true)) <> 'b2ebaa972161cc589610c753e66833a4' THEN
        RAISE EXCEPTION 'Customer view changed since review; stop and compare eligibility/thumbnail rules';
    END IF;
    IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='property_api.customer_properties'::regclass AND attname='listing_id' AND NOT attisdropped)
       OR to_regclass('finder_security.saved_properties') IS NOT NULL THEN
        RAISE EXCEPTION 'Migration already or partially applied; do not overwrite or rerun';
    END IF;
END $$;
-- Append the stable crawler UUID. Existing view projection, predicates, security
-- flags and grants stay unchanged. This matches crawler migration 007 exactly.
GRANT SELECT(id) ON crawler.properties TO crawler_customer_reader;
CREATE OR REPLACE VIEW property_api.customer_properties
WITH (security_invoker=true,security_barrier=true) AS
SELECT
    'Property in ' || COALESCE(NULLIF(p.area_en,''),NULLIF(p.area,''),NULLIF(p.region_en,''),p.municipality,'Unknown location') AS title,
    p.asking_price_jpy,p.area AS location_ja,p.area_en AS location_en,
    COALESCE(p.area_en,p.area) AS location_display,p.region_ja,p.region_en,
    cardinality(p.unmapped_locations)>0 AS location_needs_review,
    CASE WHEN p.image_permission='permitted' THEN p.main_image_url ELSE NULL END AS thumbnail_url,
    p.original_listing_url AS original_pdf_url,p.listing_status AS publication_status,
    p.availability_status,'Active'::text AS status,CASE WHEN p.source_key='iizuna_akiya_bank' AND p.original_listing_url LIKE 'https://rakuen-akiya.jp/bukken/%' THEN 'Source: Rakuen Shinshu Akiya Bank (Iizuna)' ELSE 'Source: ' || s.agency_name END AS source_attribution,
    p.last_checked_at,p.municipality,p.property_type,p.transaction_type,
    p.purchase_conditions_ja, p.id AS listing_id
FROM crawler.properties p JOIN crawler.sources s USING(source_key)
WHERE NOT s.synthetic AND crawler.source_customer_eligible(p.source_key,p.listing_status,
    p.availability_status,p.source_status_ja,p.transaction_type,p.property_type);


CREATE TABLE finder_security.saved_properties (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Deliberately no crawler FK/cascade: removed listings retain removable tombstones.
    property_id uuid NOT NULL,
    saved_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(user_id,property_id)
);
CREATE INDEX saved_properties_order ON finder_security.saved_properties(user_id,saved_at DESC,property_id DESC);
CREATE TABLE finder_security.saved_property_limits (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    window_start timestamptz NOT NULL,
    reads integer NOT NULL DEFAULT 0,
    writes integer NOT NULL DEFAULT 0
);
ALTER TABLE finder_security.saved_properties OWNER TO postgres;
ALTER TABLE finder_security.saved_property_limits OWNER TO postgres;
ALTER TABLE finder_security.saved_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE finder_security.saved_properties FORCE ROW LEVEL SECURITY;
ALTER TABLE finder_security.saved_property_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE finder_security.saved_property_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON finder_security.saved_properties,finder_security.saved_property_limits
    FROM PUBLIC,anon,authenticated,service_role,authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader;

-- Trusted backend only: JWT verification supplies these signed IDs. Recheck
-- ownership/live session/entitlement inside the same transaction as each operation.
CREATE FUNCTION finder_security.check_saved_access(p_user uuid,p_session uuid,p_write boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE a record; t timestamptz; limits finder_security.saved_property_limits%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
    t:=clock_timestamp();
    SELECT * INTO a FROM finder_security.account_snapshot(p_user,p_session);
    IF NOT FOUND OR a.schema_version<>2 OR a.session_active IS NOT TRUE OR a.account_active IS NOT TRUE
       OR (a.session_valid_until IS NOT NULL AND a.session_valid_until<=t)
       OR NOT (a.account_role='administrator' OR (a.account_role='customer' AND a.subscription_active IS TRUE
          AND a.tier='premium' AND a.status='active' AND a.payment_status='paid' AND a.revoked_at IS NULL
          AND a.access_starts_at<=t AND a.paid_through>t)) THEN
        RAISE EXCEPTION 'saved_access_denied' USING ERRCODE='P0001';
    END IF;
    -- One row per account, bounded storage and serialized quota/rate checks.
    INSERT INTO finder_security.saved_property_limits(user_id,window_start) VALUES(p_user,t) ON CONFLICT(user_id) DO NOTHING;
    SELECT * INTO limits FROM finder_security.saved_property_limits WHERE user_id=p_user FOR UPDATE;
    IF limits.window_start<=t-interval '1 minute' THEN
        UPDATE finder_security.saved_property_limits SET window_start=t,reads=0,writes=0 WHERE user_id=p_user;
        limits.reads:=0; limits.writes:=0;
    END IF;
    IF (p_write AND limits.writes>=30) OR (NOT p_write AND limits.reads>=60) THEN
        RAISE EXCEPTION 'saved_rate_limited' USING ERRCODE='P0001';
    END IF;
    UPDATE finder_security.saved_property_limits SET reads=reads+CASE WHEN p_write THEN 0 ELSE 1 END,
        writes=writes+CASE WHEN p_write THEN 1 ELSE 0 END WHERE user_id=p_user;
END $$;

CREATE FUNCTION finder_security.saved_property_ids(p_user uuid,p_session uuid)
RETURNS TABLE(property_id uuid,saved_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
BEGIN
    PERFORM finder_security.check_saved_access(p_user,p_session,false);
    RETURN QUERY SELECT s.property_id,s.saved_at FROM finder_security.saved_properties s
        WHERE s.user_id=p_user ORDER BY s.saved_at DESC,s.property_id DESC LIMIT 500;
END $$;

CREATE FUNCTION finder_security.save_property(p_user uuid,p_session uuid,p_property uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
BEGIN
    PERFORM finder_security.check_saved_access(p_user,p_session,true);
    IF p_property IS NULL OR NOT EXISTS(SELECT 1 FROM property_api.customer_properties WHERE listing_id=p_property) THEN
        RAISE EXCEPTION 'saved_listing_unavailable' USING ERRCODE='P0001';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM finder_security.saved_properties WHERE user_id=p_user AND property_id=p_property)
       AND (SELECT count(*) FROM finder_security.saved_properties WHERE user_id=p_user)>=500 THEN
        RAISE EXCEPTION 'saved_limit_reached' USING ERRCODE='P0001';
    END IF;
    INSERT INTO finder_security.saved_properties(user_id,property_id) VALUES(p_user,p_property)
        ON CONFLICT(user_id,property_id) DO NOTHING;
END $$;

CREATE FUNCTION finder_security.remove_saved_property(p_user uuid,p_session uuid,p_property uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
BEGIN
    PERFORM finder_security.check_saved_access(p_user,p_session,true);
    DELETE FROM finder_security.saved_properties WHERE user_id=p_user AND property_id=p_property;
END $$;

ALTER FUNCTION finder_security.check_saved_access(uuid,uuid,boolean) OWNER TO postgres;
ALTER FUNCTION finder_security.saved_property_ids(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION finder_security.save_property(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION finder_security.remove_saved_property(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION finder_security.check_saved_access(uuid,uuid,boolean),
    finder_security.saved_property_ids(uuid,uuid),finder_security.save_property(uuid,uuid,uuid),finder_security.remove_saved_property(uuid,uuid,uuid)
    FROM PUBLIC,anon,authenticated,service_role,authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader;
GRANT EXECUTE ON FUNCTION finder_security.saved_property_ids(uuid,uuid),finder_security.save_property(uuid,uuid,uuid),
    finder_security.remove_saved_property(uuid,uuid,uuid) TO property_finder_web_reader;
COMMIT;
