-- Read-only. Never creates a subscription, changes an entitlement or deletes an account.
BEGIN READ ONLY;
DO $$ DECLARE name text; r text; f record; BEGIN
 FOREACH name IN ARRAY ARRAY['billing_settings','billing_customers','billing_events'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='finder_security' AND c.relname=name AND c.relowner='postgres'::regrole AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'Billing table/RLS mismatch'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','crawler_writer','crawler_customer_reader','property_finder_web_reader','finder_privacy_retention_worker'] LOOP
   IF has_table_privilege(r,'finder_security.'||name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege(r,'finder_security.'||name,'SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Direct billing table access'; END IF;
  END LOOP;
 END LOOP;
 IF to_regprocedure('public.finder_billing_lock(uuid,text,boolean,text)') IS NULL
 OR to_regprocedure('public.finder_billing_customer(uuid,uuid,text,boolean)') IS NULL
 OR to_regprocedure('public.finder_billing_apply(uuid,uuid,jsonb,text,text,timestamptz)') IS NULL
 OR to_regprocedure('public.finder_billing_release(uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'Billing RPC missing'; END IF;
 FOR f IN SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'finder_billing_%' LOOP
  IF NOT f.prosecdef OR f.proowner<>'postgres'::regrole OR NOT f.proconfig @> ARRAY['search_path=pg_catalog','row_security=on'] OR NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Unsafe billing RPC'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','authenticator','crawler_writer','crawler_customer_reader','property_finder_web_reader','finder_privacy_retention_worker'] LOOP
   IF has_function_privilege(r,f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected billing RPC grant'; END IF;
  END LOOP;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM finder_privacy.settings WHERE singleton AND billing_mode='external_check_required') THEN RAISE EXCEPTION 'Billing deletion guard absent'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finder_security.billing_settings WHERE singleton AND mode IN ('live','test')) THEN RAISE EXCEPTION 'Billing mode guard absent'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='finder_security.billing_customers'::regclass AND confrelid='auth.users'::regclass AND confdeltype='n') THEN RAISE EXCEPTION 'Billing references would cascade away'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='finder_security.billing_customers'::regclass AND pg_get_constraintdef(oid)='UNIQUE (user_id, livemode)')
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='finder_security.billing_customers'::regclass AND pg_get_constraintdef(oid)='UNIQUE (customer_id, livemode)')
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='finder_security.billing_events'::regclass AND pg_get_constraintdef(oid)='PRIMARY KEY (id, livemode)')
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='finder_security.billing_events'::regclass AND confrelid='finder_security.billing_customers'::regclass AND array_length(conkey,1)=2)
 THEN RAISE EXCEPTION 'Sandbox/live isolation constraint missing'; END IF;
 IF pg_get_functiondef('public.finder_billing_apply(uuid,uuid,jsonb,text,text,timestamptz)'::regprocedure) NOT LIKE '%IF b.livemode AND active THEN%'
 OR pg_get_functiondef('public.finder_billing_apply(uuid,uuid,jsonb,text,text,timestamptz)'::regprocedure) NOT LIKE '%ELSIF b.livemode THEN%'
 THEN RAISE EXCEPTION 'Sandbox membership-write guard missing'; END IF;
END $$;
COMMIT;
