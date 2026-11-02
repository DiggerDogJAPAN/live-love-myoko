-- Operator-only customer launch, authorized separately from the Live mode switch.
-- Changes one rollout setting only. Never seeds a membership or creates billing.
-- Keep the runtime customer flag closed until the matching release is deployed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE finder_security.billing_settings,finder_security.saved_api_settings,
 finder_security.billing_customers IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres'
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls)
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.finder_billing_apply(uuid,uuid,jsonb,text,text,timestamptz)'))
  IS DISTINCT FROM 'e0ae4a00ecd2a51afc1bff08b97d509a'
 THEN RAISE EXCEPTION 'Expected approved Finder 009 and database operator'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finder_security.billing_settings WHERE singleton AND mode='live')
 THEN RAISE EXCEPTION 'Expected Live billing mode'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finder_security.saved_api_settings WHERE singleton AND NOT customer_access_enabled)
 THEN RAISE EXCEPTION 'Expected closed customer gate; stop rather than replay'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='finder_security.saved_api_settings'::regclass
  AND relowner='postgres'::regrole AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'Customer setting security drift'; END IF;
 IF EXISTS(SELECT 1 FROM finder_security.billing_customers WHERE lease_until>clock_timestamp())
 THEN RAISE EXCEPTION 'Active billing leases; stop for operator review'; END IF;
END $$;
UPDATE finder_security.saved_api_settings SET customer_access_enabled=true
 WHERE singleton AND NOT customer_access_enabled;
SELECT b.mode,s.customer_access_enabled FROM finder_security.billing_settings b
 CROSS JOIN finder_security.saved_api_settings s WHERE b.singleton AND s.singleton;
COMMIT;
