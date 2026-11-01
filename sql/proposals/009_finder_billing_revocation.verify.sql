-- Read-only verification after approved Finder 009 application.
BEGIN READ ONLY;
DO $$ DECLARE p record; r text; BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid='public.finder_billing_apply(uuid,uuid,jsonb,text,text,timestamptz)'::regprocedure;
 IF md5(p.prosrc)<>'e0ae4a00ecd2a51afc1bff08b97d509a'
 OR p.proowner<>'postgres'::regrole OR NOT p.prosecdef
 OR NOT p.proconfig @> ARRAY['search_path=pg_catalog','row_security=on']
 OR NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 THEN RAISE EXCEPTION 'Billing revocation correction or RPC security mismatch'; END IF;
 FOREACH r IN ARRAY ARRAY['anon','authenticated','authenticator','crawler_writer','crawler_customer_reader','property_finder_web_reader','finder_privacy_retention_worker'] LOOP
  IF has_function_privilege(r,p.oid,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected billing RPC grant'; END IF;
 END LOOP;
END $$;
COMMIT;
