-- READ ONLY. After approved application, using the intended project connection.
BEGIN READ ONLY;
DO $$
DECLARE signature text; table_name text; helper text;
BEGIN
    IF current_database()<>'postgres' OR current_user<>'postgres' THEN RAISE EXCEPTION 'Wrong verification connection'; END IF;
    FOREACH signature IN ARRAY ARRAY['public.finder_saved_ids()','public.finder_save_property(uuid)',
        'public.finder_remove_saved_property(uuid)','public.finder_saved_page(text)'] LOOP
        IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(signature) AND proowner='postgres'::regrole
            AND prosecdef AND provolatile='v' AND proconfig @> ARRAY['search_path=pg_catalog','row_security=on'])
            OR NOT has_function_privilege('authenticated',signature,'EXECUTE')
            OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','service_role','authenticator','crawler_writer',
                'crawler_customer_reader','property_finder_web_reader']) r WHERE has_function_privilege(r,signature,'EXECUTE')) THEN
            RAISE EXCEPTION 'Unexpected public RPC security: %',signature;
        END IF;
    END LOOP;
    FOREACH table_name IN ARRAY ARRAY['saved_properties','saved_property_limits','account_roles','memberships','saved_api_settings'] LOOP
        IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('finder_security.'||table_name)
            AND relowner='postgres'::regrole AND relrowsecurity AND relforcerowsecurity)
            OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role','authenticator','crawler_writer',
                'crawler_customer_reader','property_finder_web_reader']) r
                WHERE has_table_privilege(r,'finder_security.'||table_name,'SELECT,INSERT,UPDATE,DELETE')) THEN
            RAISE EXCEPTION 'Unexpected private table security: %',table_name;
        END IF;
    END LOOP;
    FOREACH helper IN ARRAY ARRAY['finder_security.saved_api_identity(boolean)','finder_security.saved_visible_properties(uuid[])'] LOOP
        IF has_function_privilege('anon',helper,'EXECUTE') OR has_function_privilege('authenticated',helper,'EXECUTE') THEN
            RAISE EXCEPTION 'Internal helper exposed';
        END IF;
    END LOOP;
    IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('finder_security.saved_visible_properties(uuid[])')
        AND proowner='crawler_customer_reader'::regrole AND prosecdef
        AND proconfig @> ARRAY['search_path=pg_catalog','row_security=on'])
        OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='crawler_customer_reader' AND (rolsuper OR rolbypassrls OR rolcanlogin))
        OR has_schema_privilege('crawler_customer_reader','finder_security','USAGE,CREATE')
        OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid='crawler_customer_reader'::regrole
            AND member='postgres'::regrole AND (set_option OR inherit_option OR grantor='postgres'::regrole)) THEN
        RAISE EXCEPTION 'Eligibility role or temporary ownership grants changed';
    END IF;
    IF (SELECT count(*) FROM finder_security.saved_api_settings)<>1
        OR NOT EXISTS(SELECT 1 FROM finder_security.saved_api_settings WHERE singleton AND NOT customer_access_enabled) THEN
        RAISE EXCEPTION 'Customer access must remain disabled';
    END IF;
END $$;
SELECT n.nspname AS schema,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
    p.proowner::regrole AS owner,p.prosecdef,p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN ('finder_saved_ids','finder_saved_page','finder_save_property','finder_remove_saved_property'))
    OR (n.nspname='finder_security' AND p.proname IN ('saved_api_identity','saved_visible_properties'))
ORDER BY schema,proname;
SELECT singleton,customer_access_enabled FROM finder_security.saved_api_settings;
COMMIT;
