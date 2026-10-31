-- Read-only verification after 006, as postgres, project fgdoqsepihlzfqlqymet.
BEGIN READ ONLY;
DO $$ DECLARE n text; f record; BEGIN
 FOREACH n IN ARRAY ARRAY['alert_preferences','alert_deliveries','alert_notified'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('finder_security.'||n)
     AND relowner='postgres'::regrole AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'Missing private forced-RLS alerts table'; END IF;
  IF has_table_privilege('anon','finder_security.'||n,'SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('authenticated','finder_security.'||n,'SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('service_role','finder_security.'||n,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Unexpected alerts table grant'; END IF;
 END LOOP;
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND (p.proname LIKE 'finder_alert_%' OR p.proname='finder_set_alert_preferences') LOOP
  IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('crawler_writer',f.oid,'EXECUTE')
   OR has_function_privilege('crawler_customer_reader',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected public/reader/writer alerts execution'; END IF;
  IF f.proname IN ('finder_alert_preferences','finder_set_alert_preferences') THEN
   IF NOT has_function_privilege('authenticated',f.oid,'EXECUTE') OR has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Incorrect preferences ACL'; END IF;
  ELSE
   IF has_function_privilege('authenticated',f.oid,'EXECUTE') OR NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Incorrect worker ACL'; END IF;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM finder_security.saved_api_settings WHERE singleton AND NOT customer_access_enabled) THEN RAISE EXCEPTION 'Customer rollout must remain disabled'; END IF;
END $$;
SELECT 'Property Alerts private tables, RLS and RPC ACL verification passed' AS result;
COMMIT;
