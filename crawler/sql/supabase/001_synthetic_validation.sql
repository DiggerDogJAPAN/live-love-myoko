-- SUPABASE SYNTHETIC VALIDATION PLAN ONLY. NOT EXECUTED IN PHASE 4B-3.
-- Run only after explicit approval and a successful target/TLS/empty-schema preflight.
-- Managed postgres is NOT a full superuser. PostgreSQL 17 creator membership
-- grants ADMIN but not SET by default. Two temporary, admin-only SET grants below
-- exist solely in this rollback transaction; no customer/backend login is created.
-- Do not run local bootstrap or SET SESSION AUTHORIZATION here.
-- Do not add broad memberships/grants to make this pass; stop and review instead.
-- All source/property/price records below are fictional and roll back.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Fail before any fixture insert if this is not the empty post-migration schema.
DO $$
BEGIN
    IF current_database() <> 'postgres' OR current_user <> 'postgres'
       OR current_setting('server_version_num')::integer < 170000 THEN
        RAISE EXCEPTION 'Expected PostgreSQL 17+ managed postgres test actor';
    END IF;
    IF NOT pg_has_role(current_user, 'anon', 'SET')
       OR NOT pg_has_role(current_user, 'authenticated', 'SET')
       OR NOT pg_has_role(current_user, 'service_role', 'SET') THEN
        RAISE EXCEPTION 'Required platform role-switch capability missing; stop without adding grants';
    END IF;
    IF (SELECT count(DISTINCT r.rolname) FROM pg_auth_members m
        JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member
        WHERE r.rolname IN ('crawler_customer_reader','crawler_writer')
          AND u.rolname=current_user AND m.admin_option) <> 2 THEN
        RAISE EXCEPTION 'Expected creator ADMIN memberships missing; no test grants will be made';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('crawler_customer_reader','crawler_writer')
        AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreaterole OR rolcreatedb OR rolreplication)) THEN
        RAISE EXCEPTION 'Application role attributes exceed the reviewed design';
    END IF;
    IF EXISTS (SELECT 1 FROM crawler.sources) OR EXISTS (SELECT 1 FROM crawler.properties)
       OR EXISTS (SELECT 1 FROM crawler.crawl_runs) OR EXISTS (SELECT 1 FROM crawler.price_changes)
       OR EXISTS (SELECT 1 FROM crawler.status_changes) OR EXISTS (SELECT 1 FROM crawler.translations) THEN
        RAISE EXCEPTION 'Synthetic validation requires empty application tables; no existing rows will be changed';
    END IF;
END;
$$;
-- Explicit review/approval covers these two narrowly scoped, transactional grants.
-- They do not modify the bootstrap-superuser's automatic ADMIN memberships.
GRANT crawler_customer_reader, crawler_writer TO postgres WITH INHERIT FALSE, SET TRUE;
DO $$
BEGIN
    IF NOT pg_has_role(current_user, 'crawler_customer_reader', 'SET')
       OR NOT pg_has_role(current_user, 'crawler_writer', 'SET') THEN
        RAISE EXCEPTION 'Temporary test role-switch grants did not take effect';
    END IF;
END;
$$;
SELECT set_config('schema_test.properties_oid', 'crawler.properties'::regclass::oid::text, true);

INSERT INTO crawler.sources (source_key, agency_name, website)
VALUES ('schema_test_a', 'Myoko Akiya Bank', 'https://example.invalid'),
       ('schema_test_b', 'Another Test Agency', 'https://example.invalid');
INSERT INTO crawler.sources (source_key, agency_name, website, synthetic)
VALUES ('schema_test_hidden', 'Fictional hidden source', 'https://example.invalid', true);
INSERT INTO crawler.properties (source_key, source_property_id, original_listing_url,
    title_ja, area_en, first_discovered_at, last_checked_at, listing_status, availability_status)
VALUES ('schema_test_hidden', 'active', 'https://example.invalid/synthetic.pdf',
    '架空の非公開物件', 'schema-check-synthetic', now(), now(), 'active', 'active');

INSERT INTO crawler.crawl_runs (
    source_key, idempotency_key, started_at, checked_at, finished_at, status,
    records_extracted, records_processed
) VALUES ('schema_test_a', 'one-acquisition', now(), now(), now(), 'complete', 9, 9);

INSERT INTO crawler.properties (
    source_key, source_property_id, original_listing_url, title_ja, municipality,
    area, area_en, first_discovered_at, last_checked_at, last_seen_at,
    listing_status, availability_status, source_status_ja
)
SELECT 'schema_test_a', x.number, 'https://example.invalid/' || x.number || '.pdf',
       '架空の契約テスト', 'Shinano Town', '黒姫', x.area_en, now(), now(), now(),
       x.publication, x.availability, x.label
FROM (VALUES
    ('active', 'schema-check-active', 'active', 'active', NULL::text),
    ('negotiation', 'schema-check-negotiation', 'active', 'under_negotiation', '商談中'),
    ('closed', 'schema-check-closed', 'active', 'viewings_closed', '内覧受付終了'),
    ('sold', 'schema-check-sold', 'sold', 'sold', '成約済'),
    ('withdrawn', 'schema-check-withdrawn', 'withdrawn', 'withdrawn', '登録取消'),
    ('missing', 'schema-check-missing', 'not_found', 'unknown', NULL),
    ('unknown', 'schema-check-unknown', 'active', 'unknown', NULL),
    ('ambiguous', 'schema-check-ambiguous', 'active', 'active', '要確認'),
    ('stale-label', 'schema-check-stale-label', 'active', 'active', '商談中')
) AS x(number, area_en, publication, availability, label);

-- Same ID AND URL are valid for a separate source; never auto-merge agencies.
INSERT INTO crawler.properties (
    source_key, source_property_id, original_listing_url, title_ja, municipality,
    area, area_en, first_discovered_at, last_checked_at, listing_status, availability_status
) VALUES ('schema_test_b', 'active', 'https://example.invalid/active.pdf', '別の架空物件',
          'Iizuna Town', '架空地区', 'schema-check-second-agency', now(), now(), 'active', 'active');

DO $$
DECLARE eligible_count integer;
BEGIN
    SELECT count(*) INTO eligible_count FROM property_api.customer_properties
        WHERE location_en LIKE 'schema-check-%';
    IF eligible_count <> 2 THEN RAISE EXCEPTION 'Expected two eligible fixture rows, got %', eligible_count; END IF;
    IF (SELECT missing_verification_state FROM crawler.properties
        WHERE source_key = 'schema_test_a' AND source_property_id = 'missing') <> 'pending_verification'
    THEN RAISE EXCEPTION 'Missing must remain pending verification'; END IF;
    BEGIN
        INSERT INTO crawler.properties (source_key, source_property_id, original_listing_url,
            title_ja, first_discovered_at, last_checked_at)
        VALUES ('schema_test_a', 'active', 'https://example.invalid/duplicate.pdf', '重複', now(), now());
        RAISE EXCEPTION 'Duplicate source ID should fail';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END;
$$;

INSERT INTO crawler.price_changes (property_id, source_key, crawl_run_id, original_listing_url,
                                  old_price_jpy, new_price_jpy, detected_at)
SELECT p.id, p.source_key, r.id, p.original_listing_url, 12500000, 11000000, now()
FROM crawler.properties p JOIN crawler.crawl_runs r USING (source_key)
WHERE p.source_key = 'schema_test_a' AND p.source_property_id = 'active';

DO $$
BEGIN
    BEGIN
        INSERT INTO crawler.price_changes (property_id, source_key, crawl_run_id, original_listing_url,
                                          old_price_jpy, new_price_jpy, detected_at)
        SELECT property_id, source_key, crawl_run_id, original_listing_url,
               old_price_jpy, new_price_jpy, detected_at FROM crawler.price_changes
        WHERE source_key = 'schema_test_a';
        RAISE EXCEPTION 'Repeated property/run price event should fail';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END;
$$;

SET LOCAL ROLE crawler_customer_reader;
DO $$
DECLARE eligible_count integer;
        private_column text;
BEGIN
    SELECT count(*) INTO eligible_count FROM property_api.customer_properties
        WHERE location_en LIKE 'schema-check-%';
    IF eligible_count <> 2 THEN RAISE EXCEPTION 'Reader leaked unavailable rows or could not read eligible rows'; END IF;
    IF (SELECT source_attribution FROM property_api.customer_properties
        WHERE location_en = 'schema-check-active') <> 'Source: Myoko Akiya Bank'
    THEN RAISE EXCEPTION 'Attribution changed'; END IF;
    BEGIN
        EXECUTE 'SELECT source_status_ja FROM crawler.properties';
        RAISE EXCEPTION 'Reader should not resolve private base schema';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        EXECUTE 'SELECT source_status_ja FROM property_api.customer_properties';
        RAISE EXCEPTION 'Raw source labels should not be a customer column';
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
    FOREACH private_column IN ARRAY ARRAY['id','source_key','source_property_id','identity_token',
        'source_status_ja','title_ja','title_en','description_ja','last_seen_at'] LOOP
        BEGIN
            EXECUTE format('SELECT %I FROM property_api.customer_properties', private_column);
            RAISE EXCEPTION 'Private customer column unexpectedly exists: %', private_column;
        EXCEPTION WHEN undefined_column THEN NULL; END;
    END LOOP;
    IF has_schema_privilege(current_user, 'crawler', 'USAGE')
       OR has_schema_privilege(current_user, 'property_api', 'CREATE')
       OR has_table_privilege(current_user, 'property_api.customer_properties', 'INSERT') THEN
        RAISE EXCEPTION 'Reader schema/write privileges exceed the intended boundary';
    END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
    BEGIN
        PERFORM * FROM property_api.customer_properties;
        RAISE EXCEPTION 'Anonymous access must be denied';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
    BEGIN
        PERFORM * FROM property_api.customer_properties;
        RAISE EXCEPTION 'Login alone must not grant subscription access';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    -- Client-supplied subscription/JWT claims are never an authorization input
    -- to this schema. Even a real subscriber has no direct database-role grant.
    PERFORM set_config('request.jwt.claims',
      '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001","is_subscribed":true}', true);
    BEGIN
        PERFORM * FROM property_api.customer_properties;
        RAISE EXCEPTION 'Claimed subscription bypassed backend-only access';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        PERFORM * FROM crawler.properties;
        RAISE EXCEPTION 'Authenticated customer accessed private crawler records';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$
BEGIN
    BEGIN
        PERFORM * FROM property_api.customer_properties;
        RAISE EXCEPTION 'Service role unexpectedly received application grants';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;


SET LOCAL ROLE crawler_writer;
DO $$
BEGIN
    IF current_user <> 'crawler_writer' THEN RAISE EXCEPTION 'Writer role switch failed'; END IF;
    IF (SELECT count(*) FROM crawler.properties WHERE source_key IN ('schema_test_a', 'schema_test_b')) <> 10 THEN
        RAISE EXCEPTION 'Writer cannot read retained internal statuses';
    END IF;
    BEGIN
        DELETE FROM crawler.properties WHERE source_key = 'schema_test_a';
        RAISE EXCEPTION 'Writer unexpectedly has delete privileges';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        UPDATE crawler.sources SET enabled = true WHERE source_key = 'schema_test_a';
        RAISE EXCEPTION 'Writer unexpectedly changed source approval';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
UPDATE crawler.properties SET availability_status = 'under_negotiation', source_status_ja = '商談中'
WHERE source_key = 'schema_test_a' AND source_property_id = 'active';
RESET ROLE;
SET LOCAL ROLE crawler_customer_reader;
DO $$
BEGIN
    IF NOT pg_catalog.row_security_active(current_setting('schema_test.properties_oid')::oid) THEN
        RAISE EXCEPTION 'Reader bypasses RLS';
    END IF;
    IF EXISTS (SELECT 1 FROM property_api.customer_properties WHERE location_en = 'schema-check-active') THEN
        RAISE EXCEPTION 'Negotiation was not hidden';
    END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE crawler_writer;
UPDATE crawler.properties SET availability_status = 'active', source_status_ja = NULL
WHERE source_key = 'schema_test_a' AND source_property_id = 'active';
RESET ROLE;
SET LOCAL ROLE crawler_customer_reader;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM property_api.customer_properties WHERE location_en = 'schema-check-active') THEN
        RAISE EXCEPTION 'Confirmed active reactivation did not restore visibility';
    END IF;
END;
$$;
RESET ROLE;
ROLLBACK;
