-- PREPARED ONLY. No production operation is authorized by this file.
-- Run only after the owner approves live activation, backup is verified, 009 and
-- its verification pass, matching Live credentials/catalog are configured, and
-- the Sandbox webhook destination is disabled. SQL cannot verify Stripe keys.
-- This changes only database mode. Both customer launch gates remain disabled.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE finder_security.billing_settings,finder_security.billing_customers,
 finder_security.saved_api_settings IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres'
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls)
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.finder_billing_apply(uuid,uuid,jsonb,text,text,timestamptz)'))
  IS DISTINCT FROM 'e0ae4a00ecd2a51afc1bff08b97d509a'
 THEN RAISE EXCEPTION 'Expected approved Finder 009 and database operator'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finder_security.billing_settings WHERE singleton AND mode='test')
 THEN RAISE EXCEPTION 'Expected test mode; stop rather than replay'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finder_security.saved_api_settings WHERE singleton AND NOT customer_access_enabled)
 THEN RAISE EXCEPTION 'Customer access must remain disabled during activation'; END IF;
 IF EXISTS(SELECT 1 FROM finder_security.billing_customers WHERE lease_until>clock_timestamp() OR livemode)
 THEN RAISE EXCEPTION 'Active leases or existing live billing require operator review'; END IF;
END $$;
UPDATE finder_security.billing_settings SET mode='live' WHERE singleton AND mode='test';
SELECT b.mode,s.customer_access_enabled FROM finder_security.billing_settings b
 CROSS JOIN finder_security.saved_api_settings s WHERE b.singleton AND s.singleton;
COMMIT;
