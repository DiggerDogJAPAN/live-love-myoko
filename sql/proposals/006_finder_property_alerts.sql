-- Project fgdoqsepihlzfqlqymet / postgres. Apply ONCE after 005.
-- No crawler/Auth table, role, membership, source eligibility or rollout changes.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres'
    OR to_regprocedure('finder_security.api_account_snapshot()') IS NULL
    OR to_regprocedure('finder_security.saved_visible_properties(uuid[])') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls)
    OR NOT has_column_privilege(current_user,'auth.users','email','SELECT')
    OR NOT has_column_privilege(current_user,'crawler.properties','first_discovered_at','SELECT')
    OR NOT EXISTS(SELECT 1 FROM finder_security.saved_api_settings WHERE singleton AND NOT customer_access_enabled)
    OR to_regclass('finder_security.alert_preferences') IS NOT NULL THEN
  RAISE EXCEPTION 'Expected existing 005 and unapplied 006; stop for review';
 END IF;
END $$;
CREATE TABLE finder_security.alert_preferences(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false, areas text[] NOT NULL DEFAULT '{}',
 area_since jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(area_since)='object'),
 enabled_since timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(areas <@ ARRAY['myoko','joetsu','shinano','iizuna']::text[] AND array_position(areas,NULL) IS NULL),
 CHECK(NOT enabled OR cardinality(areas)>0)
);
CREATE TABLE finder_security.alert_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 japan_day date NOT NULL, is_test boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','uncertain','cancelled')),
 recipient text NOT NULL, properties jsonb NOT NULL CHECK(jsonb_typeof(properties)='array' AND jsonb_array_length(properties)>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), first_attempt_at timestamptz,
 last_attempt_at timestamptz, attempts integer NOT NULL DEFAULT 0,
 lease uuid, lease_until timestamptz, provider_message_id text, accepted_day date, sent_at timestamptz,
 error_code text CHECK(error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$')
);
CREATE UNIQUE INDEX alert_one_daily_job ON finder_security.alert_deliveries(user_id,japan_day) WHERE NOT is_test AND status<>'cancelled';
CREATE UNIQUE INDEX alert_one_daily_acceptance ON finder_security.alert_deliveries(user_id,accepted_day) WHERE NOT is_test AND status='sent';
CREATE INDEX alert_pending ON finder_security.alert_deliveries(status,lease_until,created_at);
CREATE TABLE finder_security.alert_notified(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, listing_id uuid NOT NULL,
 delivery_id uuid NOT NULL REFERENCES finder_security.alert_deliveries(id), notified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,listing_id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['alert_preferences','alert_deliveries','alert_notified'] LOOP
  EXECUTE format('ALTER TABLE finder_security.%I OWNER TO postgres',n);
  EXECUTE format('ALTER TABLE finder_security.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE finder_security.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON finder_security.%I FROM PUBLIC,anon,authenticated,service_role,authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader',n);
 END LOOP;
END $$;
-- Background delivery has no invented Auth session. Recheck the same private
-- roles, verified/not-banned account and real paid Premium entitlement live.
CREATE FUNCTION finder_security.alert_eligible(p_user uuid,p_admin_only boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users u
 LEFT JOIN finder_security.account_roles r ON r.user_id=u.id
 LEFT JOIN finder_security.memberships m ON m.user_id=u.id
 WHERE u.id=p_user AND u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL
 AND u.deleted_at IS NULL AND u.is_anonymous IS FALSE AND (u.banned_until IS NULL OR u.banned_until<=now())
 AND COALESCE(r.is_active,true) AND
 (r.account_role='administrator' OR (NOT p_admin_only AND
 EXISTS(SELECT 1 FROM finder_security.saved_api_settings WHERE singleton AND customer_access_enabled)
 AND m.tier='premium' AND m.account_active AND m.status='active' AND m.payment_status='paid'
 AND m.revoked_at IS NULL AND m.access_starts_at<=now() AND m.paid_through>now())))
$$;
CREATE FUNCTION finder_security.alert_area(p_municipality text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE p_municipality WHEN 'Myoko' THEN 'myoko' WHEN 'Joetsu' THEN 'joetsu'
 WHEN 'Shinano Town' THEN 'shinano' WHEN 'Shinano' THEN 'shinano' WHEN 'Iizuna Town' THEN 'iizuna' END
$$;
CREATE FUNCTION finder_security.alert_identity() RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE a jsonb; BEGIN
 a:=finder_security.api_account_snapshot();
 IF (a->>'savedPropertiesAccess')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'alerts_access_denied' USING ERRCODE='42501'; END IF;
 RETURN (a->>'userId')::uuid;
END $$;
CREATE FUNCTION public.finder_alert_preferences() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE u uuid; p record; BEGIN
 u:=finder_security.alert_identity(); SELECT * INTO p FROM finder_security.alert_preferences WHERE user_id=u;
 RETURN jsonb_build_object('enabled',COALESCE(p.enabled,false),'areas',COALESCE(p.areas,'{}'::text[]),
 'deliveryNeedsReview',EXISTS(SELECT 1 FROM finder_security.alert_deliveries WHERE user_id=u AND status='uncertain'));
END $$;
CREATE FUNCTION public.finder_set_alert_preferences(p_enabled boolean,p_areas text[]) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE u uuid; a text[]; BEGIN
 u:=finder_security.alert_identity();
 IF p_enabled IS NULL OR p_areas IS NULL OR cardinality(p_areas)>4 OR array_position(p_areas,NULL) IS NOT NULL
 OR NOT p_areas <@ ARRAY['myoko','joetsu','shinano','iizuna']::text[] OR (p_enabled AND cardinality(p_areas)=0) THEN
 RAISE EXCEPTION 'invalid_alert_preferences' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg(DISTINCT v ORDER BY v),'{}') INTO a FROM unnest(p_areas) v;
 INSERT INTO finder_security.alert_preferences(user_id,enabled,areas,area_since)
 VALUES(u,p_enabled,a,COALESCE((SELECT jsonb_object_agg(v,to_jsonb(clock_timestamp())) FROM unnest(a) v),'{}'))
 ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,areas=excluded.areas,updated_at=clock_timestamp(),
 -- Keep pending events for continuously selected areas. Newly selected areas
 -- and fresh opt-ins start now; removing/re-adding an area never backfills it.
 area_since=COALESCE((SELECT jsonb_object_agg(v,CASE WHEN finder_security.alert_preferences.enabled
 AND finder_security.alert_preferences.area_since ? v THEN finder_security.alert_preferences.area_since->v ELSE to_jsonb(clock_timestamp()) END) FROM unnest(a) v),'{}'),
 enabled_since=CASE WHEN NOT finder_security.alert_preferences.enabled THEN clock_timestamp() ELSE finder_security.alert_preferences.enabled_since END;
 RETURN public.finder_alert_preferences();
END $$;
-- The eligibility projection keeps existing source restrictions/forced crawler
-- RLS. postgres reads only discovery timestamps for those already-eligible IDs.
CREATE FUNCTION finder_security.alert_candidates(p_user uuid,p_test boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE props jsonb; result jsonb; BEGIN
 props:=finder_security.saved_visible_properties(NULL);
 IF jsonb_array_length(props)>500 THEN RAISE EXCEPTION 'alerts_inventory_limit'; END IF;
 SELECT COALESCE(jsonb_agg(q.item ORDER BY q.discovered,q.listing),'[]') INTO result FROM (
 SELECT item,p.first_discovered_at AS discovered,p.id AS listing FROM jsonb_array_elements(props) item
 JOIN crawler.properties p ON p.id=(item->>'listing_id')::uuid
 LEFT JOIN finder_security.alert_preferences pref ON pref.user_id=p_user
 WHERE finder_security.alert_area(item->>'municipality') IS NOT NULL
 AND (p_test OR (pref.enabled AND finder_security.alert_area(item->>'municipality')=ANY(pref.areas)
 AND p.first_discovered_at>COALESCE((pref.area_since->>finder_security.alert_area(item->>'municipality'))::timestamptz,pref.enabled_since) AND p.first_discovered_at<=clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM finder_security.alert_notified n WHERE n.user_id=p_user AND n.listing_id=p.id)))
 AND item->>'original_pdf_url' ~ '^https://(www\.city\.myoko\.niigata\.jp|shinanomachi-iju\.jp|joetsu-akiyabank\.jp|www\.town\.iizuna\.nagano\.jp|rakuen-akiya\.jp|suumo\.jp|www\.rakusumu\.com)/[^[:space:]<>]+$'
 ORDER BY p.first_discovered_at,p.id LIMIT CASE WHEN p_test THEN 5 ELSE 500 END
 ) q;
 RETURN result;
END $$;
-- Used only by the server's secret-key RPC client. Leases plus a frozen payload
-- make concurrent jobs/retries safe. Ambiguous attempts older than 23h stop for
-- reconciliation, BEFORE Resend's 24h idempotency retention can expire.
CREATE FUNCTION public.finder_alert_claim(p_test_user uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE pref record; j finder_security.alert_deliveries%ROWTYPE; props jsonb; email text;
 t timestamptz:=clock_timestamp(); d date:=(clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
 IF p_test_user IS NOT NULL THEN
  IF NOT finder_security.alert_eligible(p_test_user,true) THEN RAISE EXCEPTION 'alerts_access_denied' USING ERRCODE='42501'; END IF;
  -- The preferences row supplies a shared per-account lock, even for test-only users.
  INSERT INTO finder_security.alert_preferences(user_id) VALUES(p_test_user) ON CONFLICT DO NOTHING;
 END IF;
 FOR pref IN SELECT * FROM finder_security.alert_preferences p
 WHERE (p_test_user IS NOT NULL AND p.user_id=p_test_user) OR (p_test_user IS NULL AND p.enabled)
 ORDER BY p.updated_at FOR UPDATE SKIP LOCKED LOOP
  IF NOT finder_security.alert_eligible(pref.user_id,p_test_user IS NOT NULL) THEN CONTINUE; END IF;
  SELECT u.email INTO email FROM auth.users u WHERE u.id=pref.user_id;
  SELECT * INTO j FROM finder_security.alert_deliveries x WHERE x.user_id=pref.user_id AND x.is_test=(p_test_user IS NOT NULL)
   AND x.status IN ('pending','uncertain') ORDER BY x.created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN
   IF j.status='uncertain' OR j.lease_until>t THEN CONTINUE; END IF;
   IF j.first_attempt_at IS NOT NULL AND j.first_attempt_at<t-interval '23 hours' THEN
    UPDATE finder_security.alert_deliveries SET status='uncertain',error_code='retry_window_expired' WHERE id=j.id; CONTINUE;
   END IF;
  ELSE
   IF p_test_user IS NULL AND EXISTS(SELECT 1 FROM finder_security.alert_deliveries x WHERE x.user_id=pref.user_id AND NOT x.is_test
      AND ((x.japan_day=d AND x.status<>'cancelled') OR (x.accepted_day=d AND x.status='sent'))) THEN CONTINUE; END IF;
   IF p_test_user IS NOT NULL AND EXISTS(SELECT 1 FROM finder_security.alert_deliveries x WHERE x.user_id=pref.user_id AND x.is_test AND x.created_at>t-interval '5 minutes') THEN
    RAISE EXCEPTION 'alerts_test_rate_limited' USING ERRCODE='P0001'; END IF;
   props:=finder_security.alert_candidates(pref.user_id,p_test_user IS NOT NULL);
   IF jsonb_array_length(props)=0 THEN CONTINUE; END IF;
   INSERT INTO finder_security.alert_deliveries(user_id,japan_day,is_test,recipient,properties)
   VALUES(pref.user_id,d,p_test_user IS NOT NULL,email,props) RETURNING * INTO j;
  END IF;
  UPDATE finder_security.alert_deliveries SET lease=gen_random_uuid(),lease_until=t+interval '5 minutes'
   WHERE id=j.id RETURNING * INTO j;
  RETURN jsonb_build_object('id',j.id,'lease',j.lease,'userId',j.user_id,'recipient',j.recipient,
    'createdAt',j.created_at,'isTest',j.is_test,'properties',j.properties);
 END LOOP;
 RETURN NULL;
END $$;
-- Recheck at delivery time. Never reuse a payload for a new recipient or send a
-- listing which is no longer permitted. Do not mutate ambiguous provider payloads.
CREATE FUNCTION public.finder_alert_dispatch(p_id uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE j finder_security.alert_deliveries%ROWTYPE; pref record; current_props jsonb; ok boolean; BEGIN
 SELECT * INTO j FROM finder_security.alert_deliveries WHERE id=p_id;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO pref FROM finder_security.alert_preferences WHERE user_id=j.user_id FOR UPDATE;
 SELECT * INTO j FROM finder_security.alert_deliveries WHERE id=p_id FOR UPDATE;
 IF j.status<>'pending' OR j.lease IS DISTINCT FROM p_lease OR j.lease_until<clock_timestamp() THEN RETURN false; END IF;
 current_props:=finder_security.alert_candidates(j.user_id,j.is_test);
 ok:=finder_security.alert_eligible(j.user_id,j.is_test)
  AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=j.user_id AND u.email=j.recipient)
  AND (j.is_test OR pref.enabled)
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.properties) x WHERE NOT EXISTS(
     SELECT 1 FROM jsonb_array_elements(current_props) y WHERE y->>'listing_id'=x->>'listing_id'));
 IF NOT ok THEN
  UPDATE finder_security.alert_deliveries SET status=CASE WHEN first_attempt_at IS NULL THEN 'cancelled' ELSE 'uncertain' END,
    error_code='eligibility_changed',lease_until=NULL WHERE id=j.id;
  RETURN false;
 END IF;
 IF NOT j.is_test AND EXISTS(SELECT 1 FROM finder_security.alert_deliveries x WHERE x.user_id=j.user_id AND x.status='sent'
     AND NOT x.is_test AND x.accepted_day=(clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date) THEN RETURN false; END IF;
 UPDATE finder_security.alert_deliveries SET first_attempt_at=COALESCE(first_attempt_at,clock_timestamp()),
 last_attempt_at=clock_timestamp(),attempts=attempts+1 WHERE id=j.id;
 RETURN true;
END $$;
CREATE FUNCTION public.finder_alert_complete(p_id uuid,p_lease uuid,p_provider_id text,p_listing_ids uuid[]) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
DECLARE j finder_security.alert_deliveries%ROWTYPE; BEGIN
 IF p_provider_id IS NULL OR length(p_provider_id)>128 OR p_provider_id !~ '^[A-Za-z0-9_-]+$' THEN RAISE EXCEPTION 'invalid_provider_receipt'; END IF;
 SELECT * INTO j FROM finder_security.alert_deliveries WHERE id=p_id;
 PERFORM 1 FROM finder_security.alert_preferences WHERE user_id=j.user_id FOR UPDATE;
 SELECT * INTO j FROM finder_security.alert_deliveries WHERE id=p_id FOR UPDATE;
 IF j.status='sent' AND j.provider_message_id=p_provider_id THEN RETURN true; END IF;
 IF cardinality(p_listing_ids) IS NULL OR cardinality(p_listing_ids)=0 OR EXISTS(SELECT 1 FROM unnest(p_listing_ids) x WHERE x IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.properties) y WHERE y->>'listing_id'=x::text)) THEN RAISE EXCEPTION 'invalid_delivery_listings'; END IF;
 IF j.status<>'pending' OR j.lease IS DISTINCT FROM p_lease OR j.first_attempt_at IS NULL THEN RAISE EXCEPTION 'invalid_delivery_lease'; END IF;
 UPDATE finder_security.alert_deliveries SET status='sent',provider_message_id=p_provider_id,sent_at=clock_timestamp(),
 accepted_day=(clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date,lease_until=NULL,error_code=NULL WHERE id=j.id;
 IF NOT j.is_test THEN
  INSERT INTO finder_security.alert_notified(user_id,listing_id,delivery_id)
  SELECT j.user_id,x,j.id FROM unnest(p_listing_ids) x ON CONFLICT DO NOTHING;
 END IF;
 RETURN true;
END $$;
CREATE FUNCTION public.finder_alert_fail(p_id uuid,p_lease uuid,p_code text,p_uncertain boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
BEGIN
 UPDATE finder_security.alert_deliveries SET error_code=CASE WHEN p_code ~ '^[a-z0-9_]{1,64}$' THEN p_code ELSE 'delivery_failed' END,
 status=CASE WHEN p_uncertain THEN 'uncertain' ELSE status END,
 -- Backoff also prevents one failing recipient monopolizing this invocation.
 lease_until=clock_timestamp()+interval '5 minutes'
 WHERE id=p_id AND lease=p_lease AND status='pending';
END $$;
CREATE FUNCTION public.finder_alert_pending() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
 SELECT EXISTS(SELECT 1 FROM finder_security.alert_deliveries d JOIN finder_security.alert_preferences p USING(user_id)
 WHERE NOT d.is_test AND d.status='pending' AND p.enabled AND finder_security.alert_eligible(d.user_id,false))
$$;
CREATE FUNCTION public.finder_alert_unsubscribe(p_id uuid,p_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM finder_security.alert_deliveries WHERE id=p_id AND user_id=p_user) THEN RETURN false; END IF;
 UPDATE finder_security.alert_preferences SET enabled=false,updated_at=clock_timestamp() WHERE user_id=p_user;
 RETURN true;
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='finder_security' AND p.proname IN ('alert_eligible','alert_area','alert_identity','alert_candidates'))
 OR (n.nspname='public' AND p.proname IN ('finder_alert_preferences','finder_set_alert_preferences','finder_alert_claim','finder_alert_dispatch','finder_alert_complete','finder_alert_fail','finder_alert_pending','finder_alert_unsubscribe')) LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.sig);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role,authenticator,crawler_writer,crawler_customer_reader,property_finder_web_reader',f.sig);
  IF f.proname IN ('finder_alert_preferences','finder_set_alert_preferences') THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);
  ELSIF f.proname LIKE 'finder_alert_%' THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
