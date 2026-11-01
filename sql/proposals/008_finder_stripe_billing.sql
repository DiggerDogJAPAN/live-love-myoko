-- LOCAL PROPOSAL. Finder 008 follows Finder 007, not crawler migrations.
-- Requires separate approval/backup before production application. Never seeds paid users.
-- Sandbox records share this database but are administrator-only and never write memberships.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres'
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls)
 OR to_regclass('finder_security.billing_customers') IS NOT NULL
 OR to_regprocedure('public.finder_billing_lock(uuid,text,boolean,text)') IS NOT NULL
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.finder_privacy_admin_export(uuid)')) IS DISTINCT FROM 'de4979522b30a7d25f3c89b041497745'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('finder_privacy.billing_resolved(uuid)')) IS DISTINCT FROM '73b4f938bc29a3cbb6efb64b92c3dc98' THEN
  RAISE EXCEPTION 'Expected unchanged Finder 007; stop for schema/permission review';
 END IF;
END $$;

-- Minimal provider identifiers/state, no card data, email address or raw webhook payload.
-- SET NULL retains necessary billing references after verified Auth deletion.
CREATE TABLE finder_security.billing_settings(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 mode text NOT NULL DEFAULT 'live' CHECK(mode IN ('live','test'))
);
INSERT INTO finder_security.billing_settings(singleton) VALUES(true);
CREATE TABLE finder_security.billing_customers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 customer_id text CHECK(customer_id ~ '^cus_[A-Za-z0-9]{1,200}$'),
 livemode boolean NOT NULL,
 state jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(state)='object' AND octet_length(state::text)<=8192),
 synced_at timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 CHECK((lease_token IS NULL)=(lease_until IS NULL)),
 UNIQUE(user_id,livemode),
 UNIQUE(customer_id,livemode),
 UNIQUE(id,livemode)
);
CREATE UNIQUE INDEX billing_one_subscription ON finder_security.billing_customers(livemode,(state->>'subscriptionId')) WHERE state->>'subscriptionId' IS NOT NULL;
CREATE TABLE finder_security.billing_events(
 id text NOT NULL CHECK(id ~ '^evt_[A-Za-z0-9]{1,200}$'),
 livemode boolean NOT NULL,
 billing_id uuid NOT NULL,
 event_type text NOT NULL CHECK(length(event_type) BETWEEN 1 AND 100),
 stripe_created_at timestamptz NOT NULL,
 processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(id,livemode),
 FOREIGN KEY(billing_id,livemode) REFERENCES finder_security.billing_customers(id,livemode) ON DELETE CASCADE
);
ALTER TABLE finder_security.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE finder_security.billing_customers FORCE ROW LEVEL SECURITY;
ALTER TABLE finder_security.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE finder_security.billing_events FORCE ROW LEVEL SECURITY;
ALTER TABLE finder_security.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finder_security.billing_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON finder_security.billing_settings,finder_security.billing_customers,finder_security.billing_events FROM PUBLIC,anon,authenticated,service_role,authenticator,
 crawler_writer,crawler_customer_reader,property_finder_web_reader,finder_privacy_retention_worker;

CREATE FUNCTION public.finder_billing_lock(p_user uuid,p_customer text,p_livemode boolean,p_event text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE b finder_security.billing_customers%ROWTYPE; u uuid; BEGIN
 IF p_livemode IS NULL OR NOT EXISTS(SELECT 1 FROM finder_security.billing_settings WHERE singleton AND (mode='live')=p_livemode)
 OR (p_user IS NULL)=(p_customer IS NULL)
 OR (p_customer IS NOT NULL AND p_customer !~ '^cus_[A-Za-z0-9]{1,200}$')
 OR (p_event IS NOT NULL AND p_event !~ '^evt_[A-Za-z0-9]{1,200}$') THEN RAISE EXCEPTION 'invalid_billing_request'; END IF;
 IF p_customer IS NOT NULL THEN
  SELECT user_id INTO u FROM finder_security.billing_customers WHERE customer_id=p_customer AND livemode=p_livemode;
  IF u IS NULL THEN RETURN NULL; END IF;
 ELSE u:=p_user; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND deleted_at IS NULL AND NOT is_anonymous
  AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
 OR EXISTS(SELECT 1 FROM finder_security.account_roles WHERE user_id=u AND NOT is_active)
 OR (p_livemode AND EXISTS(SELECT 1 FROM finder_security.account_roles WHERE user_id=u AND account_role='administrator'))
 OR (NOT p_livemode AND NOT EXISTS(SELECT 1 FROM finder_security.account_roles WHERE user_id=u AND account_role='administrator' AND is_active)) THEN
  IF p_customer IS NOT NULL THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'billing_account_unavailable';
 END IF;
 SELECT * INTO b FROM finder_security.billing_customers WHERE user_id=u AND livemode=p_livemode FOR UPDATE;
 IF NOT FOUND THEN
  IF p_customer IS NOT NULL THEN RETURN NULL; END IF;
  -- Don't silently replace a manually assigned/pre-existing membership ledger.
  IF p_livemode AND EXISTS(SELECT 1 FROM finder_security.memberships WHERE user_id=u) THEN RAISE EXCEPTION 'billing_existing_membership_review'; END IF;
  INSERT INTO finder_security.billing_customers(user_id,livemode) VALUES(u,p_livemode) RETURNING * INTO b;
 END IF;
 IF b.livemode<>p_livemode OR (p_customer IS NOT NULL AND b.customer_id IS DISTINCT FROM p_customer) THEN RAISE EXCEPTION 'billing_mode_mismatch'; END IF;
 IF p_event IS NOT NULL AND EXISTS(SELECT 1 FROM finder_security.billing_events WHERE id=p_event AND livemode=b.livemode AND billing_id=b.id) THEN RETURN '{"duplicate":true}'; END IF;
 IF b.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'billing_busy'; END IF;
 UPDATE finder_security.billing_customers SET lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes'
 WHERE id=b.id RETURNING * INTO b;
 RETURN to_jsonb(b);
END $$;

CREATE FUNCTION public.finder_billing_customer(p_id uuid,p_lease uuid,p_customer text,p_checkout_pending boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE b finder_security.billing_customers%ROWTYPE; BEGIN
 SELECT * INTO b FROM finder_security.billing_customers WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR b.user_id IS NULL OR b.lease_token IS DISTINCT FROM p_lease OR b.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'billing_lease_expired'; END IF;
 IF p_customer IS NULL OR p_customer !~ '^cus_[A-Za-z0-9]{1,200}$' OR (b.customer_id IS NOT NULL AND b.customer_id<>p_customer) THEN RAISE EXCEPTION 'invalid_billing_request'; END IF;
 UPDATE finder_security.billing_customers SET customer_id=p_customer,
 state=CASE WHEN p_checkout_pending THEN jsonb_set(state,'{checkoutUntil}',to_jsonb(clock_timestamp()+interval '25 hours')) ELSE state END WHERE id=p_id;
 RETURN true;
END $$;

CREATE FUNCTION public.finder_billing_apply(p_id uuid,p_lease uuid,p_state jsonb,p_event text,p_event_type text,p_event_created timestamptz) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE b finder_security.billing_customers%ROWTYPE; u uuid; starts timestamptz; ends timestamptz; active boolean; tier text; BEGIN
 SELECT user_id INTO u FROM finder_security.billing_customers WHERE id=p_id;
 IF u IS NULL THEN RAISE EXCEPTION 'billing_account_unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));
 SELECT * INTO b FROM finder_security.billing_customers WHERE id=p_id FOR UPDATE;
 IF b.user_id IS DISTINCT FROM u OR b.lease_token IS DISTINCT FROM p_lease OR b.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'billing_lease_expired'; END IF;
 IF p_state IS NULL OR jsonb_typeof(p_state)<>'object' OR octet_length(p_state::text)>8192
 OR NOT p_state ?& ARRAY['subscriptionId','status','currentPlan','periodStart','periodEnd','cancelAtPeriodEnd','paidPlan','paidStart','paidEnd','paidInvoiceId','scheduleId','scheduledPlan','scheduledAt','entitledPlan','active','checkoutUntil']
 OR p_state-ARRAY['subscriptionId','status','currentPlan','periodStart','periodEnd','cancelAtPeriodEnd','paidPlan','paidStart','paidEnd','paidInvoiceId','scheduleId','scheduledPlan','scheduledAt','entitledPlan','active','checkoutUntil']<>'{}'
 OR p_state->>'status' NOT IN ('none','active','past_due','unpaid','canceled','incomplete','incomplete_expired','trialing','paused')
 OR jsonb_typeof(p_state->'active')<>'boolean' OR jsonb_typeof(p_state->'cancelAtPeriodEnd')<>'boolean'
 OR (p_state->>'currentPlan' IS NOT NULL AND p_state->>'currentPlan' NOT IN ('basic','premium'))
 OR (p_state->>'paidPlan' IS NOT NULL AND p_state->>'paidPlan' NOT IN ('basic','premium'))
 OR (p_state->>'entitledPlan' IS NOT NULL AND p_state->>'entitledPlan' NOT IN ('basic','premium'))
 OR (p_state->>'scheduledPlan' IS NOT NULL AND p_state->>'scheduledPlan'<>'basic')
 OR (p_state->>'scheduledPlan' IS NULL)<>(p_state->>'scheduledAt' IS NULL)
 OR (p_state->>'subscriptionId' IS NOT NULL AND (p_state->>'subscriptionId' !~ '^sub_[A-Za-z0-9]{1,200}$' OR b.customer_id IS NULL))
 OR (p_event IS NULL)<>(p_event_type IS NULL) OR (p_event IS NULL)<>(p_event_created IS NULL)
 OR (p_event IS NOT NULL AND (p_event !~ '^evt_[A-Za-z0-9]{1,200}$' OR length(p_event_type)>100)) THEN RAISE EXCEPTION 'invalid_billing_state'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finder_security.billing_settings WHERE singleton AND (mode='live')=b.livemode) THEN RAISE EXCEPTION 'billing_mode_mismatch'; END IF;
 IF b.livemode AND EXISTS(SELECT 1 FROM finder_security.account_roles WHERE user_id=u AND account_role='administrator') THEN RAISE EXCEPTION 'billing_admin_account_protected'; END IF;
 IF NOT b.livemode AND NOT EXISTS(SELECT 1 FROM finder_security.account_roles WHERE user_id=u AND account_role='administrator' AND is_active) THEN RAISE EXCEPTION 'billing_account_unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND deleted_at IS NULL) THEN RAISE EXCEPTION 'billing_account_unavailable'; END IF;
 active:=(p_state->>'active')::boolean; tier:=p_state->>'entitledPlan';
 starts:=(p_state->>'paidStart')::timestamptz; ends:=(p_state->>'paidEnd')::timestamptz;
 IF active AND (tier IS NULL OR starts IS NULL OR ends IS NULL OR starts>clock_timestamp() OR ends<=clock_timestamp() OR ends<=starts
 OR p_state->>'paidPlan' IS NULL OR p_state->>'currentPlan' IS NULL
 OR p_state->>'paidInvoiceId' IS NULL OR p_state->>'paidInvoiceId' !~ '^in_[A-Za-z0-9]{1,200}$'
 OR p_state->>'status' NOT IN ('active','past_due') OR p_state->>'subscriptionId' IS NULL
 OR (tier='premium' AND (p_state->>'paidPlan'<>'premium' OR p_state->>'currentPlan'<>'premium'))
 OR (tier='basic' AND p_state->>'paidPlan' NOT IN ('basic','premium'))) THEN RAISE EXCEPTION 'invalid_billing_entitlement'; END IF;
 IF p_event IS NOT NULL AND EXISTS(SELECT 1 FROM finder_security.billing_events WHERE id=p_event AND livemode=b.livemode) THEN
  IF EXISTS(SELECT 1 FROM finder_security.billing_events WHERE id=p_event AND livemode=b.livemode AND billing_id=b.id) THEN RETURN '{"applied":true}'; END IF;
  RAISE EXCEPTION 'billing_event_owner_mismatch';
 END IF;
 UPDATE finder_security.billing_customers SET state=p_state,synced_at=clock_timestamp() WHERE id=b.id;
 IF b.livemode AND active THEN
  INSERT INTO finder_security.memberships(user_id,tier,account_active,status,payment_status,access_starts_at,paid_through,revoked_at)
  VALUES(u,tier,true,'active','paid',starts,ends,NULL)
  ON CONFLICT(user_id) DO UPDATE SET tier=EXCLUDED.tier,account_active=true,status='active',payment_status='paid',
   access_starts_at=EXCLUDED.access_starts_at,paid_through=EXCLUDED.paid_through,revoked_at=NULL,updated_at=clock_timestamp();
 ELSIF b.livemode THEN
  UPDATE finder_security.memberships SET account_active=false,status=CASE WHEN p_state->>'status'='canceled' THEN 'canceled'
   WHEN p_state->>'status'='past_due' THEN 'past_due' WHEN p_state->>'status'='unpaid' THEN 'unpaid' ELSE 'inactive' END,
   payment_status='unpaid',revoked_at=COALESCE(revoked_at,clock_timestamp()),updated_at=clock_timestamp() WHERE user_id=u;
 END IF;
 IF p_event IS NOT NULL THEN INSERT INTO finder_security.billing_events(id,livemode,billing_id,event_type,stripe_created_at) VALUES(p_event,b.livemode,b.id,p_event_type,p_event_created); END IF;
 RETURN '{"applied":true}';
END $$;

CREATE FUNCTION public.finder_billing_release(p_id uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
BEGIN
 UPDATE finder_security.billing_customers SET lease_token=NULL,lease_until=NULL WHERE id=p_id AND lease_token=p_lease;
 RETURN FOUND;
END $$;

-- Keep unpaid/non-billing account deletion available, while linked Stripe accounts
-- need a fresh canonical no-subscription/terminal check, no open Checkout and no lease.
UPDATE finder_privacy.settings SET billing_mode='external_check_required' WHERE singleton;
CREATE OR REPLACE FUNCTION finder_privacy.billing_resolved(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
 SELECT EXISTS(SELECT 1 FROM finder_privacy.settings WHERE singleton AND billing_mode='external_check_required')
 AND NOT EXISTS(SELECT 1 FROM finder_security.memberships WHERE user_id=p_user
 AND (account_active OR status='active' OR (payment_status='paid' AND paid_through>clock_timestamp())))
 AND NOT EXISTS(SELECT 1 FROM finder_security.billing_customers WHERE user_id=p_user AND livemode AND
  (lease_until>clock_timestamp() OR (customer_id IS NOT NULL AND
   (synced_at IS NULL OR synced_at<clock_timestamp()-interval '15 minutes' OR COALESCE(state->>'status','unknown') NOT IN ('none','canceled','incomplete_expired')
    OR (state->>'checkoutUntil')::timestamptz>clock_timestamp()))))
$$;

-- Retain the verified-case/administrator checks from 007 and add only own billing data.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.finder_privacy_admin_export(uuid)'::regprocedure);
 definition:=replace(definition,'''accountRole'',',
  '''billing'',COALESCE((SELECT jsonb_agg(jsonb_build_object(''customerId'',b.customer_id,''livemode'',b.livemode,''state'',b.state,''lastVerifiedAt'',b.synced_at)) FROM finder_security.billing_customers b WHERE b.user_id=r.user_id),''[]''),
 ''billingEvents'',COALESCE((SELECT jsonb_agg(jsonb_build_object(''eventId'',e.id,''livemode'',e.livemode,''type'',e.event_type,''createdAt'',e.stripe_created_at,''processedAt'',e.processed_at)) FROM finder_security.billing_events e JOIN finder_security.billing_customers b ON b.id=e.billing_id WHERE b.user_id=r.user_id),''[]''),
 ''accountRole'',');
 EXECUTE definition;
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'finder_billing_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role,authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader,finder_privacy_retention_worker',f.oid::regprocedure);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.oid::regprocedure);
 END LOOP;
END $$;
COMMIT;
