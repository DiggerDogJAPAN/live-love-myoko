-- REVIEW ONLY / NOT APPLIED. Project fgdoqsepihlzfqlqymet / database postgres.
-- Requires applied membership migrations 001,002,003 and a verified restore point.
-- No crawler/view/data, Auth ACL/RLS, membership, account-role or connection-limit changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
BEGIN
    IF current_database()<>'postgres' OR current_user<>'postgres'
       OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls)
       OR NOT has_schema_privilege(current_user,'public','CREATE')
       OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.jwt()') IS NULL
       OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('finder_security.check_saved_access(uuid,uuid,boolean)')
            AND proowner='postgres'::regrole AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog','row_security=on'])
       OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('finder_security.account_snapshot(uuid,uuid)')
            AND proowner='postgres'::regrole AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog','row_security=on'])
       OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('finder_security.saved_properties')
            AND relowner='postgres'::regrole AND relrowsecurity AND relforcerowsecurity)
       OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='property_api.customer_properties'::regclass
            AND relowner='postgres'::regrole AND reloptions @> ARRAY['security_invoker=true','security_barrier=true'])
       OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='crawler_customer_reader' AND NOT rolcanlogin
            AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb)
       OR pg_has_role('crawler_customer_reader','crawler_writer','MEMBER')
       OR NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member='postgres'::regrole
            AND roleid='crawler_customer_reader'::regrole AND admin_option AND NOT inherit_option AND NOT set_option)
       OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member='postgres'::regrole
            AND roleid='crawler_customer_reader'::regrole AND grantor='postgres'::regrole)
       OR has_schema_privilege('crawler_customer_reader','finder_security','USAGE,CREATE') THEN
        RAISE EXCEPTION 'Expected reviewed existing Auth, private saved tables and isolated eligibility role; stop for review';
    END IF;
    IF to_regclass('finder_security.saved_api_settings') IS NOT NULL
       OR to_regprocedure('public.finder_saved_ids()') IS NOT NULL THEN
        RAISE EXCEPTION 'Migration already or partially applied; do not overwrite or rerun';
    END IF;
END $$;

-- Direct HTTPS bypasses the Workers rollout flag. Enforce the same disabled
-- customer rollout in PRIVATE database configuration, independently of clients.
CREATE TABLE finder_security.saved_api_settings (
    singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
    customer_access_enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE finder_security.saved_api_settings OWNER TO postgres;
ALTER TABLE finder_security.saved_api_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finder_security.saved_api_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON finder_security.saved_api_settings FROM PUBLIC,anon,authenticated,service_role,authenticator,
    crawler_writer,crawler_customer_reader,property_finder_web_reader;
INSERT INTO finder_security.saved_api_settings(singleton,customer_access_enabled) VALUES(true,false);

-- This private projection executes AS the existing NON-BYPASSRLS customer role.
-- A postgres-owned RPC reading the security_invoker view itself would bypass
-- restrictive portal RLS. Never replace this with a postgres-owned view read.
-- Temporary ownership prerequisites are restored in this same transaction;
-- no new rights/memberships on the crawler or Supabase-managed Auth are granted.
GRANT crawler_customer_reader TO postgres WITH INHERIT FALSE, SET TRUE;
GRANT USAGE,CREATE ON SCHEMA finder_security TO crawler_customer_reader;
CREATE FUNCTION finder_security.saved_visible_properties(p_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
    SELECT COALESCE(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM (
        SELECT listing_id,title,asking_price_jpy,location_en,location_display,location_ja,
            publication_status,availability_status,source_attribution,original_pdf_url,thumbnail_url,
            location_needs_review,region_en,region_ja,municipality,property_type,transaction_type,purchase_conditions_ja
        FROM property_api.customer_properties
        WHERE listing_id=ANY(p_ids) AND publication_status='active' AND availability_status='active'
        LIMIT 20
    ) p
$$;
ALTER FUNCTION finder_security.saved_visible_properties(uuid[]) OWNER TO crawler_customer_reader;
SET LOCAL ROLE crawler_customer_reader;
REVOKE ALL ON FUNCTION finder_security.saved_visible_properties(uuid[]) FROM PUBLIC,anon,authenticated,service_role,
    authenticator,crawler_writer,property_finder_web_reader,crawler_customer_reader;
GRANT EXECUTE ON FUNCTION finder_security.saved_visible_properties(uuid[]) TO postgres;
RESET ROLE;
REVOKE USAGE,CREATE ON SCHEMA finder_security FROM crawler_customer_reader;
-- Remove only our temporary self-grant; retain the original platform grant intact.
REVOKE crawler_customer_reader FROM postgres GRANTED BY postgres;

CREATE FUNCTION finder_security.saved_api_identity(p_write boolean)
RETURNS TABLE(user_id uuid,session_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE claims jsonb; u uuid; s uuid; t numeric;
BEGIN
    claims:=auth.jwt(); u:=auth.uid(); s:=(claims->>'session_id')::uuid;
    t:=extract(epoch FROM clock_timestamp());
    IF u IS NULL OR s IS NULL OR claims->>'role' IS DISTINCT FROM 'authenticated'
       OR claims->>'aud' IS DISTINCT FROM 'authenticated'
       OR claims->>'iss' IS DISTINCT FROM 'https://fgdoqsepihlzfqlqymet.supabase.co/auth/v1'
       OR claims->'is_anonymous' IS DISTINCT FROM 'false'::jsonb
       OR (claims->>'exp') IS NULL OR (claims->>'exp')::numeric<=t
       OR (claims->>'iat') IS NULL OR (claims->>'iat')::numeric<=0
       OR (claims->>'iat')::numeric>t+5 OR (claims->>'exp')::numeric<=(claims->>'iat')::numeric THEN
        RAISE EXCEPTION 'saved_access_denied' USING ERRCODE='42501';
    END IF;
    -- Existing helper rechecks the live Auth session, verification, bans,
    -- private role, paid-through/status/revocation, and serialized rate limits.
    PERFORM finder_security.check_saved_access(u,s,p_write);
    IF NOT EXISTS(SELECT 1 FROM finder_security.account_roles a
            WHERE a.user_id=u AND a.account_role='administrator' AND a.is_active)
       AND NOT EXISTS(SELECT 1 FROM finder_security.saved_api_settings WHERE singleton AND customer_access_enabled) THEN
        RAISE EXCEPTION 'customer_access_disabled' USING ERRCODE='42501';
    END IF;
    RETURN QUERY SELECT u,s;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'saved_access_denied' USING ERRCODE='42501';
END $$;
ALTER FUNCTION finder_security.saved_api_identity(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION finder_security.saved_api_identity(boolean) FROM PUBLIC,anon,authenticated,service_role,
    authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader;

CREATE FUNCTION public.finder_saved_ids()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE u uuid; ids jsonb;
BEGIN
    SELECT user_id INTO STRICT u FROM finder_security.saved_api_identity(false);
    SELECT COALESCE(jsonb_agg(s.property_id ORDER BY s.saved_at DESC,s.property_id DESC),'[]'::jsonb)
        INTO ids FROM finder_security.saved_properties s WHERE s.user_id=u;
    RETURN jsonb_build_object('userId',u,'ids',ids,'total',jsonb_array_length(ids));
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN ('saved_access_denied','customer_access_disabled') THEN
        RAISE EXCEPTION '%',SQLERRM USING ERRCODE='42501';
    END IF;
    IF SQLERRM IN ('saved_rate_limited','saved_limit_reached',
        'saved_listing_unavailable','invalid_listing_id','invalid_saved_request') THEN RAISE; END IF;
    RAISE LOG 'finder_saved_rpc_failure operation=finder_saved_ids databaseCode=%',SQLSTATE;
    RAISE EXCEPTION 'saved_properties_unavailable' USING ERRCODE='P0001';
END $$;

CREATE FUNCTION public.finder_save_property(p_property uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE u uuid;
BEGIN
    SELECT user_id INTO STRICT u FROM finder_security.saved_api_identity(true);
    IF p_property IS NULL OR jsonb_array_length(finder_security.saved_visible_properties(ARRAY[p_property]))<>1 THEN
        RAISE EXCEPTION 'saved_listing_unavailable' USING ERRCODE='P0001';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM finder_security.saved_properties WHERE user_id=u AND property_id=p_property)
       AND (SELECT count(*) FROM finder_security.saved_properties WHERE user_id=u)>=500 THEN
        RAISE EXCEPTION 'saved_limit_reached' USING ERRCODE='P0001';
    END IF;
    INSERT INTO finder_security.saved_properties(user_id,property_id) VALUES(u,p_property)
        ON CONFLICT(user_id,property_id) DO NOTHING;
    RETURN jsonb_build_object('propertyId',p_property,'saved',true);
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN ('saved_access_denied','customer_access_disabled') THEN
        RAISE EXCEPTION '%',SQLERRM USING ERRCODE='42501';
    END IF;
    IF SQLERRM IN ('saved_rate_limited','saved_limit_reached',
        'saved_listing_unavailable','invalid_listing_id','invalid_saved_request') THEN RAISE; END IF;
    RAISE LOG 'finder_saved_rpc_failure operation=finder_save_property databaseCode=%',SQLSTATE;
    RAISE EXCEPTION 'saved_properties_unavailable' USING ERRCODE='P0001';
END $$;

CREATE FUNCTION public.finder_remove_saved_property(p_property uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE u uuid;
BEGIN
    SELECT user_id INTO STRICT u FROM finder_security.saved_api_identity(true);
    IF p_property IS NULL THEN RAISE EXCEPTION 'invalid_listing_id' USING ERRCODE='22023'; END IF;
    DELETE FROM finder_security.saved_properties WHERE user_id=u AND property_id=p_property;
    RETURN jsonb_build_object('propertyId',p_property,'saved',false);
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN ('saved_access_denied','customer_access_disabled') THEN
        RAISE EXCEPTION '%',SQLERRM USING ERRCODE='42501';
    END IF;
    IF SQLERRM IN ('saved_rate_limited','saved_limit_reached',
        'saved_listing_unavailable','invalid_listing_id','invalid_saved_request') THEN RAISE; END IF;
    RAISE LOG 'finder_saved_rpc_failure operation=finder_remove_saved_property databaseCode=%',SQLSTATE;
    RAISE EXCEPTION 'saved_properties_unavailable' USING ERRCODE='P0001';
END $$;

CREATE FUNCTION public.finder_saved_page(p_cursor text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE u uuid; cursor_at timestamptz; cursor_id uuid; total integer; ids uuid[]; visible jsonb;
    page jsonb; result jsonb; more boolean; next_cursor text;
BEGIN
    SELECT user_id INTO STRICT u FROM finder_security.saved_api_identity(false);
    IF p_cursor IS NOT NULL THEN
        IF length(p_cursor)>61 OR p_cursor!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z\|[0-9a-fA-F-]{36}$' THEN
            RAISE EXCEPTION 'invalid_saved_request' USING ERRCODE='22023';
        END IF;
        BEGIN
            cursor_at:=split_part(p_cursor,'|',1)::timestamptz;
            cursor_id:=split_part(p_cursor,'|',2)::uuid;
        EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
            RAISE EXCEPTION 'invalid_saved_request' USING ERRCODE='22023';
        END;
    END IF;
    SELECT count(*) INTO total FROM finder_security.saved_properties WHERE user_id=u;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('propertyId',s.property_id,
            'savedAt',to_char(s.saved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
            ORDER BY s.saved_at DESC,s.property_id DESC),'[]'::jsonb)
        INTO page FROM (SELECT property_id,saved_at FROM finder_security.saved_properties
            WHERE user_id=u AND (p_cursor IS NULL OR (saved_at,property_id)<(cursor_at,cursor_id))
            ORDER BY saved_at DESC,property_id DESC LIMIT 21) s;
    more:=jsonb_array_length(page)>20;
    IF more THEN page:=page-20; END IF;
    SELECT COALESCE(array_agg((e->>'propertyId')::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements(page) e;
    visible:=finder_security.saved_visible_properties(ids);
    SELECT COALESCE(jsonb_agg(e || jsonb_build_object('property',
        (SELECT p FROM jsonb_array_elements(visible) p WHERE p->>'listing_id'=e->>'propertyId')) ORDER BY ord),'[]'::jsonb)
        INTO result FROM jsonb_array_elements(page) WITH ORDINALITY AS entries(e,ord);
    IF more THEN next_cursor:=(page->-1->>'savedAt')||'|'||(page->-1->>'propertyId'); END IF;
    RETURN jsonb_build_object('items',result,'total',total,'nextCursor',next_cursor);
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN ('saved_access_denied','customer_access_disabled') THEN
        RAISE EXCEPTION '%',SQLERRM USING ERRCODE='42501';
    END IF;
    IF SQLERRM IN ('saved_rate_limited','saved_limit_reached',
        'saved_listing_unavailable','invalid_listing_id','invalid_saved_request') THEN RAISE; END IF;
    RAISE LOG 'finder_saved_rpc_failure operation=finder_saved_page databaseCode=%',SQLSTATE;
    RAISE EXCEPTION 'saved_properties_unavailable' USING ERRCODE='P0001';
END $$;

ALTER FUNCTION public.finder_saved_ids() OWNER TO postgres;
ALTER FUNCTION public.finder_save_property(uuid) OWNER TO postgres;
ALTER FUNCTION public.finder_remove_saved_property(uuid) OWNER TO postgres;
ALTER FUNCTION public.finder_saved_page(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finder_saved_ids(),public.finder_save_property(uuid),
    public.finder_remove_saved_property(uuid),public.finder_saved_page(text)
    FROM PUBLIC,anon,authenticated,service_role,authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader;
GRANT EXECUTE ON FUNCTION public.finder_saved_ids(),public.finder_save_property(uuid),
    public.finder_remove_saved_property(uuid),public.finder_saved_page(text) TO authenticated;
-- Confirm only public RPC exposure in Data API settings. Do NOT expose finder_security,
-- property_api, crawler or auth. PostgREST JWT verification precedes these RPCs.
NOTIFY pgrst,'reload schema';
COMMIT;
