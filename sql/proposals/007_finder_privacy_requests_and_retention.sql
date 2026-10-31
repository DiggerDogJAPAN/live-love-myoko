-- LOCAL/REVIEW ONLY. Finder 007, not crawler migration 007. Apply only after approval.
-- Requires Finder 001-006 and a verified restorable backup. No customer/crawler rows are changed on installation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres'
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls)
 OR to_regprocedure('finder_security.api_account_snapshot()') IS NULL
 OR to_regclass('finder_security.alert_notified') IS NULL
 OR NOT has_table_privilege(current_user,'auth.users','DELETE')
 OR NOT has_table_privilege(current_user,'auth.users','UPDATE')
 OR NOT has_schema_privilege(current_user,'public','USAGE WITH GRANT OPTION')
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='finder_security.alert_notified'::regclass
   AND conname='alert_notified_delivery_id_fkey' AND confrelid='finder_security.alert_deliveries'::regclass AND confdeltype='a')
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.finder_alert_unsubscribe(uuid,uuid)')
   AND proowner='postgres'::regrole AND prosecdef AND proargnames=ARRAY['p_id','p_user']
   AND md5(prosrc)='25860ad4f7072fa9a44f453ad182a0f2')
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='finder_privacy')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='finder_privacy_retention_worker') THEN
  RAISE EXCEPTION 'Expected unchanged Finder 006 and new privacy schema; stop for review';
 END IF;
END $$;

CREATE SCHEMA finder_privacy AUTHORIZATION postgres;
-- No password: cannot authenticate until separately provisioned after approval.
CREATE ROLE finder_privacy_retention_worker LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE TABLE finder_privacy.settings(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 billing_mode text NOT NULL DEFAULT 'not_integrated' CHECK(billing_mode IN ('not_integrated','external_check_required'))
);
INSERT INTO finder_privacy.settings(singleton) VALUES(true);
CREATE TABLE finder_privacy.requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 client_nonce uuid,
 request_type text NOT NULL CHECK(request_type IN ('access','correction','deletion','information')),
 deletion_scope text CHECK(deletion_scope IN ('account','personal_data')),
 details text NOT NULL DEFAULT '' CHECK(length(details)<=2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','rejected')),
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 admin_notes text NOT NULL DEFAULT '' CHECK(length(admin_notes)<=4000),
 response text NOT NULL DEFAULT '' CHECK(length(response)<=2000),
 identity_verified_at timestamptz,
 retention_reviewed_at timestamptz,
 legal_hold boolean NOT NULL DEFAULT false,
 account_deleted_at timestamptz,
 CHECK((request_type='deletion' AND deletion_scope IS NOT NULL) OR (request_type<>'deletion' AND deletion_scope IS NULL)),
 CHECK((status IN ('completed','rejected'))=(completed_at IS NOT NULL)),
 UNIQUE(user_id,client_nonce)
);
CREATE UNIQUE INDEX privacy_one_active_deletion ON finder_privacy.requests(user_id)
 WHERE request_type='deletion' AND status IN ('pending','in_progress');
CREATE INDEX privacy_request_queue ON finder_privacy.requests(status,submitted_at,id);
CREATE INDEX privacy_request_owner ON finder_privacy.requests(user_id,submitted_at DESC);
CREATE TABLE finder_privacy.events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES finder_privacy.requests(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 action text NOT NULL CHECK(action IN ('submitted','reviewed','exported','account_deleted')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Operator-set holds also cover investigations that have no customer request.
CREATE TABLE finder_privacy.holds(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE finder_privacy.alert_unsubscribe_receipts(
 delivery_id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
-- Notification markers survive delivery-history cleanup; they still cascade on account deletion.
ALTER TABLE finder_security.alert_notified ALTER COLUMN delivery_id DROP NOT NULL;
ALTER TABLE finder_security.alert_notified DROP CONSTRAINT alert_notified_delivery_id_fkey;
ALTER TABLE finder_security.alert_notified ADD CONSTRAINT alert_notified_delivery_id_fkey
 FOREIGN KEY(delivery_id) REFERENCES finder_security.alert_deliveries(id) ON DELETE SET NULL;

CREATE FUNCTION finder_privacy.identity(p_admin boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE a jsonb; BEGIN
 PERFORM set_config('response.headers','[{"Cache-Control":"private, no-store, max-age=0"},{"Pragma":"no-cache"}]',true);
 a:=finder_security.api_account_snapshot();
 IF p_admin AND a->>'role' IS DISTINCT FROM 'administrator' THEN
  RAISE EXCEPTION 'privacy_admin_required' USING ERRCODE='42501';
 END IF;
 RETURN (a->>'userId')::uuid;
END $$;
CREATE FUNCTION finder_privacy.customer_row(p finder_privacy.requests) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
 SELECT jsonb_build_object('id',p.id,'type',p.request_type,'scope',p.deletion_scope,'details',p.details,
 'status',p.status,'submittedAt',p.submitted_at,'updatedAt',p.updated_at,'completedAt',p.completed_at,'response',p.response)
$$;
CREATE FUNCTION finder_privacy.event(p_request uuid,p_actor uuid,p_action text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
 INSERT INTO finder_privacy.events(request_id,actor_id,action) VALUES(p_request,p_actor,p_action)
$$;
CREATE FUNCTION public.finder_privacy_requests() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE u uuid; BEGIN
 u:=finder_privacy.identity();
 RETURN jsonb_build_object('requests',COALESCE((SELECT jsonb_agg(finder_privacy.customer_row(r) ORDER BY r.submitted_at DESC,r.id)
 FROM (SELECT * FROM finder_privacy.requests WHERE user_id=u
 ORDER BY (status IN ('pending','in_progress')) DESC,submitted_at DESC,id LIMIT 100) r),'[]'));
END $$;
CREATE FUNCTION public.finder_privacy_submit(p_type text,p_details text,p_scope text,p_nonce uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE u uuid; r finder_privacy.requests%ROWTYPE; BEGIN
 u:=finder_privacy.identity();
 IF p_type IS NULL OR p_type NOT IN ('access','correction','deletion','information') OR p_details IS NULL
 OR length(p_details)>2000 OR p_nonce IS NULL
 OR (p_type='deletion' AND (p_scope IS NULL OR p_scope NOT IN ('account','personal_data')))
 OR (p_type<>'deletion' AND p_scope IS NOT NULL) THEN
  RAISE EXCEPTION 'invalid_privacy_request' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));
 SELECT * INTO r FROM finder_privacy.requests WHERE user_id=u AND client_nonce=p_nonce;
 IF FOUND THEN
  IF r.request_type<>p_type OR r.deletion_scope IS DISTINCT FROM p_scope OR r.details<>trim(p_details) THEN
   RAISE EXCEPTION 'invalid_privacy_request' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('request',finder_privacy.customer_row(r),'created',false);
 END IF;
 IF p_type='deletion' AND EXISTS(SELECT 1 FROM finder_privacy.requests
 WHERE user_id=u AND request_type='deletion' AND status IN ('pending','in_progress')) THEN
  RAISE EXCEPTION 'privacy_deletion_request_active' USING ERRCODE='P0001';
 END IF;
 IF (SELECT count(*) FROM finder_privacy.requests WHERE user_id=u AND submitted_at>clock_timestamp()-interval '1 day')>=5
 OR (SELECT count(*) FROM finder_privacy.requests WHERE user_id=u AND status IN ('pending','in_progress'))>=10 THEN
  RAISE EXCEPTION 'privacy_rate_limited' USING ERRCODE='P0001';
 END IF;
 INSERT INTO finder_privacy.requests(user_id,request_type,deletion_scope,details,client_nonce)
 VALUES(u,p_type,p_scope,trim(p_details),p_nonce) RETURNING * INTO r;
 PERFORM finder_privacy.event(r.id,u,'submitted');
 RETURN jsonb_build_object('request',finder_privacy.customer_row(r),'created',true);
END $$;

CREATE FUNCTION public.finder_privacy_admin_requests(p_status text DEFAULT NULL,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
BEGIN
 PERFORM finder_privacy.identity(true);
 IF p_offset IS NULL OR p_offset<0 OR p_offset>100000 OR (p_status IS NOT NULL AND p_status NOT IN ('pending','in_progress','completed','rejected')) THEN
  RAISE EXCEPTION 'invalid_privacy_request' USING ERRCODE='22023';
 END IF;
 RETURN jsonb_build_object('requests',COALESCE((SELECT jsonb_agg(to_jsonb(r)-'client_nonce' ORDER BY r.submitted_at,r.id)
 FROM (SELECT * FROM finder_privacy.requests WHERE p_status IS NULL OR status=p_status
 ORDER BY submitted_at,id LIMIT 50 OFFSET p_offset) r),'[]'));
END $$;
CREATE FUNCTION public.finder_privacy_admin_update(p_id uuid,p_status text,p_notes text,p_response text,
 p_verified boolean,p_retention_reviewed boolean,p_hold boolean,p_expected_updated_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE a uuid; u uuid; r finder_privacy.requests%ROWTYPE; BEGIN
 a:=finder_privacy.identity(true);
 SELECT user_id INTO u FROM finder_privacy.requests WHERE id=p_id;
 IF u IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0)); END IF;
 SELECT * INTO r FROM finder_privacy.requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'privacy_request_not_found' USING ERRCODE='P0001'; END IF;
 IF r.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'privacy_request_changed' USING ERRCODE='P0001'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('pending','in_progress','completed','rejected')
 OR p_notes IS NULL OR length(p_notes)>4000 OR p_response IS NULL OR length(p_response)>2000
 OR p_verified IS NULL OR p_retention_reviewed IS NULL OR p_hold IS NULL THEN
  RAISE EXCEPTION 'invalid_privacy_request' USING ERRCODE='22023';
 END IF;
 IF r.user_id IS NULL THEN RAISE EXCEPTION 'privacy_case_minimised' USING ERRCODE='P0001'; END IF;
 IF (r.status IN ('completed','rejected') AND p_status<>r.status)
 OR (r.status='in_progress' AND p_status='pending') THEN RAISE EXCEPTION 'privacy_invalid_transition' USING ERRCODE='P0001'; END IF;
 IF p_status='rejected' AND length(trim(p_response))=0 THEN RAISE EXCEPTION 'privacy_reason_required' USING ERRCODE='P0001'; END IF;
 IF p_status='completed' AND (NOT p_verified OR length(trim(p_notes))=0) THEN
  RAISE EXCEPTION 'privacy_review_required' USING ERRCODE='P0001';
 END IF;
 IF p_status='completed' AND r.request_type='deletion' AND r.deletion_scope='account' THEN
  RAISE EXCEPTION 'privacy_use_deletion_procedure' USING ERRCODE='P0001';
 END IF;
 UPDATE finder_privacy.requests SET status=p_status,admin_notes=trim(p_notes),response=trim(p_response),legal_hold=p_hold,
 details=CASE WHEN p_status IN ('completed','rejected') AND NOT p_hold
  AND NOT EXISTS(SELECT 1 FROM finder_privacy.holds WHERE user_id=u)
  AND NOT EXISTS(SELECT 1 FROM finder_privacy.requests x WHERE x.user_id=u AND x.id<>p_id AND x.legal_hold)
  THEN '' ELSE details END,
 identity_verified_at=CASE WHEN p_verified THEN COALESCE(identity_verified_at,clock_timestamp()) END,
 retention_reviewed_at=CASE WHEN p_retention_reviewed THEN COALESCE(retention_reviewed_at,clock_timestamp()) END,
 completed_at=CASE WHEN p_status IN ('completed','rejected') THEN COALESCE(completed_at,clock_timestamp()) END,
 updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO r;
 PERFORM finder_privacy.event(r.id,a,'reviewed');
 RETURN to_jsonb(r)-'client_nonce';
END $$;

CREATE FUNCTION public.finder_privacy_admin_export(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE a uuid; r finder_privacy.requests%ROWTYPE; result jsonb; BEGIN
 a:=finder_privacy.identity(true);
 SELECT * INTO r FROM finder_privacy.requests WHERE id=p_id;
 IF NOT FOUND OR r.user_id IS NULL THEN RAISE EXCEPTION 'privacy_request_not_found' USING ERRCODE='P0001'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.user_id::text,0));
 SELECT * INTO r FROM finder_privacy.requests WHERE id=p_id FOR UPDATE;
 IF r.user_id IS NULL OR r.request_type NOT IN ('access','deletion') OR r.identity_verified_at IS NULL
 OR r.identity_verified_at<clock_timestamp()-interval '7 days' OR r.status<>'in_progress' THEN
  RAISE EXCEPTION 'privacy_review_required' USING ERRCODE='P0001';
 END IF;
 SELECT jsonb_build_object('preparedAt',clock_timestamp(),'requestId',r.id,
 'account',(SELECT jsonb_build_object('id',u.id,'email',u.email,'name',u.raw_user_meta_data->>'full_name',
  'createdAt',u.created_at,'emailVerifiedAt',u.email_confirmed_at,'lastSignInAt',u.last_sign_in_at) FROM auth.users u WHERE u.id=r.user_id),
 'accountRole',(SELECT to_jsonb(ar) FROM finder_security.account_roles ar WHERE ar.user_id=r.user_id),
 'memberships',COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM finder_security.memberships m WHERE m.user_id=r.user_id),'[]'),
 'savedProperties',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM finder_security.saved_properties s WHERE s.user_id=r.user_id),'[]'),
 'savedPropertyUsage',(SELECT to_jsonb(s) FROM finder_security.saved_property_limits s WHERE s.user_id=r.user_id),
 'alertPreferences',(SELECT to_jsonb(p) FROM finder_security.alert_preferences p WHERE p.user_id=r.user_id),
 'alertDeliveries',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'createdAt',d.created_at,'sentAt',d.sent_at,
  'status',d.status,'isTest',d.is_test,'recipient',d.recipient,'properties',d.properties)) FROM finder_security.alert_deliveries d WHERE d.user_id=r.user_id),'[]'),
 'notificationMarkers',COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM finder_security.alert_notified n WHERE n.user_id=r.user_id),'[]'),
 'unsubscribeReceipts',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM finder_privacy.alert_unsubscribe_receipts t WHERE t.user_id=r.user_id),'[]'),
 'privacyRequests',COALESCE((SELECT jsonb_agg(finder_privacy.customer_row(p)) FROM finder_privacy.requests p WHERE p.user_id=r.user_id),'[]'),
 'privacyRequestEvents',COALESCE((SELECT jsonb_agg(jsonb_build_object('requestId',e.request_id,'action',e.action,'occurredAt',e.occurred_at))
 FROM finder_privacy.events e JOIN finder_privacy.requests p ON p.id=e.request_id WHERE p.user_id=r.user_id),'[]'),
 'retentionHold',(SELECT jsonb_build_object('held',true,'updatedAt',h.updated_at) FROM finder_privacy.holds h WHERE h.user_id=r.user_id)) INTO result;
 PERFORM finder_privacy.event(r.id,a,'exported');
 RETURN result;
END $$;

-- Future billing must set billing_mode=external_check_required BEFORE accepting payments.
-- This fails closed until a separately reviewed real subscription resolver replaces this helper.
CREATE FUNCTION finder_privacy.billing_resolved(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
 SELECT EXISTS(SELECT 1 FROM finder_privacy.settings WHERE singleton AND billing_mode='not_integrated')
 AND NOT EXISTS(SELECT 1 FROM finder_security.memberships WHERE user_id=p_user
 AND (account_active OR status='active' OR paid_through>clock_timestamp()))
$$;
CREATE FUNCTION public.finder_privacy_admin_delete_account(p_id uuid,p_confirmation text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE a uuid; u uuid; r finder_privacy.requests%ROWTYPE; owned boolean; BEGIN
 a:=finder_privacy.identity(true);
 SELECT * INTO r FROM finder_privacy.requests WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'privacy_request_not_found' USING ERRCODE='P0001'; END IF;
 IF r.account_deleted_at IS NOT NULL AND r.user_id IS NULL THEN RETURN jsonb_build_object('completed',true,'requestId',r.id); END IF;
 u:=r.user_id;
 IF u IS NULL THEN RAISE EXCEPTION 'privacy_request_not_found' USING ERRCODE='P0001'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));
 -- Same preference->delivery ordering as the notification worker, before locking Auth.
 PERFORM 1 FROM finder_security.alert_preferences WHERE user_id=u FOR UPDATE;
 PERFORM 1 FROM auth.users WHERE id=u FOR UPDATE;
 SELECT * INTO r FROM finder_privacy.requests WHERE id=p_id FOR UPDATE;
 IF r.user_id IS DISTINCT FROM u OR r.request_type<>'deletion' OR r.deletion_scope<>'account'
 OR r.status<>'in_progress' OR r.identity_verified_at IS NULL OR r.retention_reviewed_at IS NULL
 OR r.identity_verified_at<clock_timestamp()-interval '7 days' OR r.retention_reviewed_at<clock_timestamp()-interval '7 days'
 OR length(trim(r.admin_notes))=0 THEN RAISE EXCEPTION 'privacy_review_required' USING ERRCODE='P0001'; END IF;
 IF p_confirmation IS DISTINCT FROM 'DELETE '||u::text||' FOR '||r.id::text THEN
  RAISE EXCEPTION 'privacy_confirmation_required' USING ERRCODE='P0001';
 END IF;
 IF u=a OR EXISTS(SELECT 1 FROM finder_security.account_roles WHERE user_id=u AND account_role='administrator') THEN
  RAISE EXCEPTION 'privacy_admin_account_protected' USING ERRCODE='P0001';
 END IF;
 IF EXISTS(SELECT 1 FROM finder_privacy.holds WHERE user_id=u)
 OR EXISTS(SELECT 1 FROM finder_privacy.requests WHERE user_id=u AND legal_hold) THEN
  RAISE EXCEPTION 'privacy_legal_hold' USING ERRCODE='P0001';
 END IF;
 IF EXISTS(SELECT 1 FROM finder_privacy.requests WHERE user_id=u AND id<>p_id AND status IN ('pending','in_progress')) THEN
  RAISE EXCEPTION 'privacy_other_requests_active' USING ERRCODE='P0001';
 END IF;
 IF NOT finder_privacy.billing_resolved(u) THEN RAISE EXCEPTION 'privacy_billing_unresolved' USING ERRCODE='P0001'; END IF;
 -- A future cascading relationship outside the reviewed private/Auth schemas needs review first.
 IF EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE k.contype='f' AND k.confrelid='auth.users'::regclass
 AND k.confdeltype IN ('c','n','d') AND n.nspname NOT IN ('auth','finder_security','finder_privacy')) THEN
  RAISE EXCEPTION 'privacy_external_records_review' USING ERRCODE='P0001';
 END IF;
 IF EXISTS(SELECT 1 FROM finder_security.alert_deliveries WHERE user_id=u
 AND (status='uncertain' OR (status='pending' AND (first_attempt_at IS NOT NULL OR lease_until>clock_timestamp())))) THEN
  RAISE EXCEPTION 'privacy_delivery_unresolved' USING ERRCODE='P0001';
 END IF;
 IF to_regclass('storage.objects') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM storage.objects WHERE owner_id=$1 OR owner=$2)' INTO owned USING u::text,u;
  IF owned THEN RAISE EXCEPTION 'privacy_external_records_review' USING ERRCODE='P0001'; END IF;
 END IF;
 IF to_regclass('auth.scim_users') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM auth.scim_users WHERE user_id=$1)' INTO owned USING u;
  IF owned THEN RAISE EXCEPTION 'privacy_external_records_review' USING ERRCODE='P0001'; END IF;
 END IF;
 -- Clear customer identifiers/free text from every associated case. Retain only case IDs/types/dates/outcomes.
 UPDATE finder_privacy.requests SET user_id=NULL,client_nonce=NULL,details='',admin_notes='',response='',
 status=CASE WHEN status IN ('pending','in_progress') THEN 'completed' ELSE status END,
 completed_at=COALESCE(completed_at,clock_timestamp()),updated_at=clock_timestamp(),
 account_deleted_at=CASE WHEN id=p_id THEN clock_timestamp() ELSE account_deleted_at END WHERE user_id=u;
 -- Supported direct Auth deletion, in the SAME transaction as minimisation. Existing FK cascades
 -- remove memberships, roles, saves/limits, preferences, deliveries, markers, receipts and Auth sessions.
 DELETE FROM auth.users WHERE id=u;
 IF NOT FOUND THEN RAISE EXCEPTION 'privacy_request_changed' USING ERRCODE='P0001'; END IF;
 PERFORM finder_privacy.event(p_id,a,'account_deleted');
 RETURN jsonb_build_object('completed',true,'requestId',p_id);
END $$;

-- Keep existing 180-day signed unsubscribe links usable after deleting delivery payloads at 90 days.
CREATE OR REPLACE FUNCTION public.finder_alert_unsubscribe(p_id uuid,p_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM finder_security.alert_deliveries WHERE id=p_id AND user_id=p_user)
 AND NOT EXISTS(SELECT 1 FROM finder_privacy.alert_unsubscribe_receipts
 WHERE delivery_id=p_id AND user_id=p_user AND expires_at>clock_timestamp()) THEN RETURN false; END IF;
 UPDATE finder_security.alert_preferences SET enabled=false,updated_at=clock_timestamp() WHERE user_id=p_user;
 RETURN true;
END $$;
CREATE FUNCTION public.finder_privacy_cleanup() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE u uuid; deleted integer:=0; expired integer:=0; n integer; BEGIN
 FOR u IN SELECT user_id FROM (
  SELECT user_id FROM finder_security.alert_deliveries WHERE status IN ('sent','cancelled')
   AND greatest(created_at,COALESCE(sent_at,created_at),COALESCE(last_attempt_at,created_at))<clock_timestamp()-interval '90 days'
  UNION SELECT user_id FROM finder_privacy.alert_unsubscribe_receipts WHERE expires_at<=clock_timestamp()
 ) candidates WHERE NOT EXISTS(SELECT 1 FROM finder_privacy.holds h WHERE h.user_id=candidates.user_id)
 AND NOT EXISTS(SELECT 1 FROM finder_privacy.requests r WHERE r.user_id=candidates.user_id
 AND (r.legal_hold OR r.status IN ('pending','in_progress')))
 ORDER BY user_id LIMIT 100 LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(u::text,0)) THEN CONTINUE; END IF;
  BEGIN
   PERFORM 1 FROM finder_security.alert_preferences WHERE user_id=u FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN CONTINUE; END;
  IF EXISTS(SELECT 1 FROM finder_privacy.holds WHERE user_id=u)
  OR EXISTS(SELECT 1 FROM finder_privacy.requests WHERE user_id=u AND (legal_hold OR status IN ('pending','in_progress'))) THEN CONTINUE; END IF;
  WITH victims AS MATERIALIZED (
   SELECT * FROM finder_security.alert_deliveries WHERE user_id=u AND status IN ('sent','cancelled')
   AND greatest(created_at,COALESCE(sent_at,created_at),COALESCE(last_attempt_at,created_at))<clock_timestamp()-interval '90 days'
   ORDER BY created_at,id LIMIT greatest(0,1000-deleted) FOR UPDATE SKIP LOCKED
  ), receipts AS (
   INSERT INTO finder_privacy.alert_unsubscribe_receipts(delivery_id,user_id,expires_at)
   SELECT id,user_id,created_at+interval '180 days' FROM victims WHERE created_at+interval '180 days'>clock_timestamp()
   ON CONFLICT(delivery_id) DO NOTHING
  ) DELETE FROM finder_security.alert_deliveries d USING victims v WHERE d.id=v.id;
  GET DIAGNOSTICS n=ROW_COUNT; deleted:=deleted+n;
  DELETE FROM finder_privacy.alert_unsubscribe_receipts WHERE delivery_id IN (
   SELECT delivery_id FROM finder_privacy.alert_unsubscribe_receipts WHERE user_id=u AND expires_at<=clock_timestamp()
   ORDER BY expires_at,delivery_id LIMIT greatest(0,1000-expired));
  GET DIAGNOSTICS n=ROW_COUNT; expired:=expired+n;
  EXIT WHEN deleted>=1000 OR expired>=1000;
 END LOOP;
 RETURN jsonb_build_object('deliveryRowsDeleted',deleted,'expiredReceiptsDeleted',expired);
END $$;

-- Explicit ACLs beat any pre-existing permissive postgres default privileges.
DO $$ DECLARE t record; f record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='finder_privacy' LOOP
  EXECUTE format('ALTER TABLE finder_privacy.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  EXECUTE format('ALTER TABLE finder_privacy.%I FORCE ROW LEVEL SECURITY',t.tablename);
 END LOOP;
 REVOKE ALL ON SCHEMA finder_privacy FROM PUBLIC,anon,authenticated,service_role,authenticator,
  crawler_writer,crawler_customer_reader,property_finder_web_reader,finder_privacy_retention_worker;
 REVOKE ALL ON ALL TABLES IN SCHEMA finder_privacy FROM PUBLIC,anon,authenticated,service_role,authenticator,
  crawler_writer,crawler_customer_reader,property_finder_web_reader,finder_privacy_retention_worker;
 REVOKE ALL ON ALL SEQUENCES IN SCHEMA finder_privacy FROM PUBLIC,anon,authenticated,service_role,authenticator,
  crawler_writer,crawler_customer_reader,property_finder_web_reader,finder_privacy_retention_worker;
 FOR f IN SELECT p.oid,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='finder_privacy' OR (n.nspname='public' AND p.proname LIKE 'finder_privacy_%') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role,authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader,finder_privacy_retention_worker',f.oid::regprocedure);
  IF f.nspname='public' AND f.proname<>'finder_privacy_cleanup' THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.oid::regprocedure);
  END IF;
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO finder_privacy_retention_worker;
GRANT EXECUTE ON FUNCTION public.finder_privacy_cleanup() TO finder_privacy_retention_worker;
COMMIT;
