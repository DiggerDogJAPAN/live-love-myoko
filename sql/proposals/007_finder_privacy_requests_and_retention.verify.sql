-- Read-only post-install verification. No requests/accounts are created or removed.
BEGIN READ ONLY;
DO $$ DECLARE r text; t record; f record; BEGIN
 IF (SELECT count(*) FROM pg_tables WHERE schemaname='finder_privacy')<>5 THEN RAISE EXCEPTION 'Expected five privacy tables'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES
  ('public.finder_privacy_requests()'),('public.finder_privacy_submit(text,text,text,uuid)'),
  ('public.finder_privacy_admin_requests(text,integer)'),
  ('public.finder_privacy_admin_update(uuid,text,text,text,boolean,boolean,boolean,timestamptz)'),
  ('public.finder_privacy_admin_export(uuid)'),('public.finder_privacy_admin_delete_account(uuid,text)'),
  ('public.finder_privacy_cleanup()')) required(sig) WHERE to_regprocedure(sig) IS NULL) THEN
  RAISE EXCEPTION 'Missing privacy RPC';
 END IF;
 FOR t IN SELECT c.oid,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='finder_privacy' AND c.relkind='r' LOOP
  IF NOT t.relrowsecurity OR NOT t.relforcerowsecurity OR t.owner<>'postgres' THEN RAISE EXCEPTION 'Privacy RLS/owner mismatch'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','crawler_writer','crawler_customer_reader','property_finder_web_reader','finder_privacy_retention_worker'] LOOP
   IF has_table_privilege(r,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege(r,t.oid,'SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'Unexpected direct privacy table privilege';
   END IF;
  END LOOP;
 END LOOP;
 FOR f IN SELECT p.oid,p.prosecdef,p.proconfig,p.proname,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'finder_privacy_%' LOOP
  IF NOT f.prosecdef OR f.proowner<>'postgres'::regrole OR NOT f.proconfig @> ARRAY['search_path=pg_catalog','row_security=on'] THEN RAISE EXCEPTION 'Unsafe privacy function configuration'; END IF;
  IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected anonymous/service privacy RPC access'; END IF;
  IF has_function_privilege('authenticated',f.oid,'EXECUTE') IS DISTINCT FROM (f.proname<>'finder_privacy_cleanup')
  OR has_function_privilege('finder_privacy_retention_worker',f.oid,'EXECUTE') IS DISTINCT FROM (f.proname='finder_privacy_cleanup') THEN
   RAISE EXCEPTION 'Unexpected privacy RPC grant';
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='finder_security.alert_notified'::regclass
 AND conname='alert_notified_delivery_id_fkey' AND confdeltype='n') THEN RAISE EXCEPTION 'Notification markers would not survive cleanup'; END IF;
 IF NOT has_function_privilege('service_role','public.finder_alert_unsubscribe(uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.finder_alert_unsubscribe(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Unsubscribe grant drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='finder_privacy_retention_worker' AND rolcanlogin
 AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member='finder_privacy_retention_worker'::regrole) THEN RAISE EXCEPTION 'Unsafe retention role'; END IF;
END $$;
COMMIT;
