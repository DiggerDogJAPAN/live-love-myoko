-- LOCAL FORWARD PROPOSAL. Not applied to production during readiness review.
-- Requires approved backup and separate migration application after Finder 008.
-- No data is seeded, removed or reactivated; existing revocations are preserved.
-- Billing expiry/nonpayment uses status/account_active/payment_status. revoked_at
-- is reserved for operator revocation and is never automatically cleared.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres'
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls)
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.finder_billing_apply(uuid,uuid,jsonb,text,text,timestamptz)'))
  IS DISTINCT FROM '8edf18e2781295409a35ff429787295b'
 THEN RAISE EXCEPTION 'Expected unchanged Finder 008; stop for drift or replay review'; END IF;
 -- Older billing versions used revoked_at for automatic nonpayment too. Do not
 -- guess which existing revocations an operator intended to keep or clear.
 IF EXISTS(SELECT 1 FROM finder_security.memberships m
  JOIN finder_security.billing_customers b ON b.user_id=m.user_id AND b.livemode
  WHERE m.revoked_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Review existing live billing revocations before migration 009'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.finder_billing_apply(p_id uuid,p_lease uuid,p_state jsonb,p_event text,p_event_type text,p_event_created timestamptz) RETURNS jsonb
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
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND deleted_at IS NULL AND NOT is_anonymous
  AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
 OR EXISTS(SELECT 1 FROM finder_security.account_roles WHERE user_id=u AND NOT is_active)
 THEN RAISE EXCEPTION 'billing_account_unavailable'; END IF;
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
   access_starts_at=EXCLUDED.access_starts_at,paid_through=EXCLUDED.paid_through,updated_at=clock_timestamp()
   -- Revocation is an operator decision, never undone by provider reconciliation.
   WHERE finder_security.memberships.revoked_at IS NULL;
 ELSIF b.livemode THEN
  UPDATE finder_security.memberships SET account_active=false,status=CASE WHEN p_state->>'status'='canceled' THEN 'canceled'
   WHEN p_state->>'status'='past_due' THEN 'past_due' WHEN p_state->>'status'='unpaid' THEN 'unpaid' ELSE 'inactive' END,
   payment_status='unpaid',updated_at=clock_timestamp() WHERE user_id=u;
 END IF;
 IF p_event IS NOT NULL THEN INSERT INTO finder_security.billing_events(id,livemode,billing_id,event_type,stripe_created_at) VALUES(p_event,b.livemode,b.id,p_event_type,p_event_created); END IF;
 RETURN '{"applied":true}';
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
