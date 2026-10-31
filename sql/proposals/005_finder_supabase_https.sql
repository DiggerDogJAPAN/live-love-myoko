-- Project fgdoqsepihlzfqlqymet. Apply once AFTER membership migration 004.
-- Supabase HTTPS replaces all website SQL/Hyperdrive reads. No role-cap changes,
-- crawler/Auth data or policies, administrator assignments or paid memberships.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
BEGIN
    IF current_database()<>'postgres' OR current_user<>'postgres'
       OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls)
       OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('finder_security.saved_visible_properties(uuid[])')
            AND proowner='crawler_customer_reader'::regrole AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog','row_security=on'])
       OR to_regclass('finder_security.saved_api_settings') IS NULL
       OR NOT EXISTS(SELECT 1 FROM finder_security.saved_api_settings WHERE singleton AND NOT customer_access_enabled)
       OR NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member='postgres'::regrole
            AND roleid='crawler_customer_reader'::regrole AND admin_option AND NOT inherit_option AND NOT set_option)
       OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member='postgres'::regrole
            AND roleid='crawler_customer_reader'::regrole AND grantor='postgres'::regrole)
       OR has_schema_privilege('crawler_customer_reader','finder_security','USAGE,CREATE') THEN
        RAISE EXCEPTION 'Expected approved migration 004 and unchanged restricted eligibility role';
    END IF;
    IF to_regprocedure('public.finder_account()') IS NOT NULL OR to_regprocedure('public.finder_properties()') IS NOT NULL THEN
        RAISE EXCEPTION 'Migration already or partially applied; stop rather than overwrite';
    END IF;
END $$;

-- A single live account/permission decision shared by account, search and saves.
-- No caller supplies user/session IDs or membership flags.
CREATE FUNCTION finder_security.api_account_snapshot()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE claims jsonb; u uuid; s uuid; t timestamptz; epoch_now numeric; a record;
    administrator boolean; paid boolean; enabled boolean;
BEGIN
    claims:=auth.jwt(); u:=auth.uid(); s:=(claims->>'session_id')::uuid;
    t:=clock_timestamp(); epoch_now:=extract(epoch FROM t);
    IF u IS NULL OR s IS NULL OR claims->>'role' IS DISTINCT FROM 'authenticated'
       OR claims->>'aud' IS DISTINCT FROM 'authenticated'
       OR claims->>'iss' IS DISTINCT FROM 'https://fgdoqsepihlzfqlqymet.supabase.co/auth/v1'
       OR claims->'is_anonymous' IS DISTINCT FROM 'false'::jsonb
       OR claims->>'exp' IS NULL OR (claims->>'exp')::numeric<=epoch_now
       OR claims->>'iat' IS NULL OR (claims->>'iat')::numeric<=0
       OR (claims->>'iat')::numeric>epoch_now+5 OR (claims->>'exp')::numeric<=(claims->>'iat')::numeric THEN
        RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501';
    END IF;
    SELECT * INTO a FROM finder_security.account_snapshot(u,s);
    IF NOT FOUND OR a.schema_version<>2 OR a.session_active IS NOT TRUE OR a.account_active IS NOT TRUE
       OR (a.session_valid_until IS NOT NULL AND a.session_valid_until<=t)
       OR a.account_role NOT IN ('customer','administrator') THEN
        RAISE EXCEPTION 'account_unavailable' USING ERRCODE='42501';
    END IF;
    administrator:=a.account_role='administrator';
    paid:=COALESCE(a.subscription_active IS TRUE AND a.tier IN ('basic','premium') AND a.status='active'
        AND a.payment_status='paid' AND a.revoked_at IS NULL AND a.access_starts_at<=t AND a.paid_through>t,false);
    enabled:=EXISTS(SELECT 1 FROM finder_security.saved_api_settings WHERE singleton AND customer_access_enabled);
    RETURN jsonb_build_object('schemaVersion',2,'userId',u,'sessionId',s,'sessionActive',true,
        'sessionValidUntil',a.session_valid_until,'accountActive',true,'role',a.account_role,
        'subscriptionActive',a.subscription_active,'tier',a.tier,'status',a.status,'paymentStatus',a.payment_status,
        'accessStartsAt',a.access_starts_at,'paidThrough',a.paid_through,'revokedAt',a.revoked_at,
        'membershipActive',paid,'paidAccessEnabled',enabled,
        'finderAccess',administrator OR (enabled AND paid),
        'savedPropertiesAccess',administrator OR (enabled AND paid AND a.tier='premium'));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501';
END $$;
ALTER FUNCTION finder_security.api_account_snapshot() OWNER TO postgres;
REVOKE ALL ON FUNCTION finder_security.api_account_snapshot() FROM PUBLIC,anon,authenticated,service_role,
    authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader;

-- Extend the SAME non-bypass projection from 004. NULL IDs means the bounded
-- directory; saved pages still pass <=20 IDs and retain the original 20 limit.
GRANT crawler_customer_reader TO postgres WITH INHERIT FALSE, SET TRUE;
GRANT USAGE,CREATE ON SCHEMA finder_security TO crawler_customer_reader;
SET LOCAL ROLE crawler_customer_reader;
GRANT EXECUTE ON FUNCTION finder_security.saved_visible_properties(uuid[]) TO crawler_customer_reader;
CREATE OR REPLACE FUNCTION finder_security.saved_visible_properties(p_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
    SELECT COALESCE(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM (
        SELECT listing_id,title,asking_price_jpy,location_en,location_display,location_ja,
            publication_status,availability_status,source_attribution,original_pdf_url,thumbnail_url,
            location_needs_review,region_en,region_ja,municipality,property_type,transaction_type,purchase_conditions_ja
        FROM property_api.customer_properties
        WHERE (p_ids IS NULL OR listing_id=ANY(p_ids)) AND publication_status='active' AND availability_status='active'
        ORDER BY asking_price_jpy ASC NULLS LAST,original_pdf_url ASC
        LIMIT CASE WHEN p_ids IS NULL THEN 501 ELSE 20 END
    ) p
$$;
REVOKE ALL ON FUNCTION finder_security.saved_visible_properties(uuid[]) FROM PUBLIC,anon,authenticated,service_role,
    authenticator,crawler_writer,property_finder_web_reader,crawler_customer_reader;
GRANT EXECUTE ON FUNCTION finder_security.saved_visible_properties(uuid[]) TO postgres;
RESET ROLE;
REVOKE USAGE,CREATE ON SCHEMA finder_security FROM crawler_customer_reader;
REVOKE crawler_customer_reader FROM postgres GRANTED BY postgres;

-- Keep 004's public interfaces and existing quota/rate/ownership enforcement.
CREATE OR REPLACE FUNCTION finder_security.saved_api_identity(p_write boolean)
RETURNS TABLE(user_id uuid,session_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE a jsonb; u uuid; s uuid;
BEGIN
    a:=finder_security.api_account_snapshot();
    IF (a->>'savedPropertiesAccess')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'saved_access_denied' USING ERRCODE='42501';
    END IF;
    u:=(a->>'userId')::uuid; s:=(a->>'sessionId')::uuid;
    PERFORM finder_security.check_saved_access(u,s,p_write);
    RETURN QUERY SELECT u,s;
EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE EXCEPTION 'saved_access_denied' USING ERRCODE='42501';
END $$;
ALTER FUNCTION finder_security.saved_api_identity(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION finder_security.saved_api_identity(boolean) FROM PUBLIC,anon,authenticated,service_role,
    authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader;

CREATE FUNCTION public.finder_account()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
BEGIN
    RETURN finder_security.api_account_snapshot();
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN ('authentication_required','account_unavailable') THEN RAISE; END IF;
    RAISE LOG 'finder_rpc_failure operation=account databaseCode=%',SQLSTATE;
    RAISE EXCEPTION 'authentication_unavailable' USING ERRCODE='P0001';
END $$;

CREATE FUNCTION public.finder_properties()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE a jsonb; properties jsonb;
BEGIN
    a:=finder_security.api_account_snapshot();
    IF (a->>'finderAccess')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'active_membership_required' USING ERRCODE='42501';
    END IF;
    properties:=finder_security.saved_visible_properties(NULL);
    IF jsonb_array_length(properties)>500 THEN
        RAISE EXCEPTION 'directory_unavailable' USING ERRCODE='P0001';
    END IF;
    RETURN jsonb_build_object('rows',properties,'count',jsonb_array_length(properties));
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN ('authentication_required','account_unavailable','active_membership_required','directory_unavailable') THEN RAISE; END IF;
    RAISE LOG 'finder_rpc_failure operation=properties databaseCode=%',SQLSTATE;
    RAISE EXCEPTION 'directory_unavailable' USING ERRCODE='P0001';
END $$;
ALTER FUNCTION public.finder_account() OWNER TO postgres;
ALTER FUNCTION public.finder_properties() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finder_account(),public.finder_properties() FROM PUBLIC,anon,authenticated,service_role,
    authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader;
GRANT EXECUTE ON FUNCTION public.finder_account(),public.finder_properties() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
