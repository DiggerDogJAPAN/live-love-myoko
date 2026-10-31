BEGIN READ ONLY;
DO $$
DECLARE signature text; helper text;
BEGIN
    IF current_database()<>'postgres' OR current_user<>'postgres' THEN RAISE EXCEPTION 'Wrong verification connection'; END IF;
    FOREACH signature IN ARRAY ARRAY['public.finder_account()','public.finder_properties()',
        'public.finder_saved_ids()','public.finder_saved_page(text)','public.finder_save_property(uuid)','public.finder_remove_saved_property(uuid)'] LOOP
        IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(signature) AND proowner='postgres'::regrole
            AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog','row_security=on'])
            OR NOT has_function_privilege('authenticated',signature,'EXECUTE')
            OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','service_role','authenticator','crawler_writer',
                'crawler_customer_reader','property_finder_web_reader']) r WHERE has_function_privilege(r,signature,'EXECUTE')) THEN
            RAISE EXCEPTION 'Unexpected public RPC permission: %',signature;
        END IF;
    END LOOP;
    FOREACH helper IN ARRAY ARRAY['finder_security.api_account_snapshot()','finder_security.saved_api_identity(boolean)',
        'finder_security.saved_visible_properties(uuid[])'] LOOP
        IF has_function_privilege('anon',helper,'EXECUTE') OR has_function_privilege('authenticated',helper,'EXECUTE') THEN
            RAISE EXCEPTION 'Private helper exposed';
        END IF;
    END LOOP;
    IF NOT EXISTS(SELECT 1 FROM finder_security.saved_api_settings WHERE singleton AND NOT customer_access_enabled)
        OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid='crawler_customer_reader'::regrole
            AND member='postgres'::regrole AND (set_option OR inherit_option OR grantor='postgres'::regrole))
        OR has_schema_privilege('crawler_customer_reader','finder_security','USAGE,CREATE') THEN
        RAISE EXCEPTION 'Customer rollout or temporary role privileges changed';
    END IF;
    IF EXISTS(SELECT 1 FROM unnest(ARRAY['saved_properties','saved_property_limits','memberships','account_roles','saved_api_settings']) t
        WHERE NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('finder_security.'||t) AND c.relrowsecurity AND c.relforcerowsecurity)
        OR has_table_privilege('authenticated','finder_security.'||t,'SELECT,INSERT,UPDATE,DELETE')) THEN
        RAISE EXCEPTION 'Private table RLS/grants changed';
    END IF;
END $$;
SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef,p.proowner::regrole AS owner,p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('finder_account','finder_properties','finder_saved_ids','finder_saved_page','finder_save_property','finder_remove_saved_property') ORDER BY p.proname;
SELECT customer_access_enabled FROM finder_security.saved_api_settings WHERE singleton;
COMMIT;
