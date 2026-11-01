-- Executed once with owner approval on 1 November 2026; database is now test mode.
-- Historical operator procedure: its live-mode guard intentionally rejects replay.
-- Do not run until the Sandbox credentials and all six Stripe IDs
-- are configured and verified. SQL cannot verify Cloudflare or Stripe settings.
-- This switches database mode only; it does not deploy or enable runtime billing.
-- Migration 008 is already applied. Do not replay that migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE finder_security.billing_settings,
 finder_security.billing_customers,
 finder_security.saved_api_settings IN SHARE ROW EXCLUSIVE MODE;

DO $$ BEGIN
 IF current_user<>'postgres' OR NOT EXISTS(
  SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls
 ) THEN RAISE EXCEPTION 'Expected the existing database operator'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finder_security.saved_api_settings
  WHERE singleton AND customer_access_enabled=false)
 THEN RAISE EXCEPTION 'Keep customer access disabled before Sandbox setup'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finder_security.billing_settings
  WHERE singleton AND mode='live')
 THEN RAISE EXCEPTION 'Expected live mode; stop and review current state'; END IF;
 IF EXISTS(SELECT 1 FROM finder_security.billing_customers
  WHERE livemode OR lease_until>clock_timestamp())
 THEN RAISE EXCEPTION 'Existing live billing or in-flight work requires review'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finder_security.account_roles r
  JOIN auth.users u ON u.id=r.user_id
  WHERE r.account_role='administrator' AND r.is_active
  AND u.deleted_at IS NULL AND NOT u.is_anonymous
  AND u.email_confirmed_at IS NOT NULL
  AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()))
 THEN RAISE EXCEPTION 'An active verified administrator is required'; END IF;
END $$;

UPDATE finder_security.billing_settings SET mode='test' WHERE singleton AND mode='live';

SELECT b.mode, s.customer_access_enabled
FROM finder_security.billing_settings b
CROSS JOIN finder_security.saved_api_settings s
WHERE b.singleton AND s.singleton;
COMMIT;
