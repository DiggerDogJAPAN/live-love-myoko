-- PREPARED LOCAL-ONLY INTEGRATION TESTS: NOT EXECUTED IN PHASE 4B-1.
-- Apply after local/000_test_roles.sql and 001_proposed_schema.sql in a fresh
-- disposable local cluster. Run as its superuser with ON_ERROR_STOP enabled.
-- SESSION AUTHORIZATION removes the administrator's session identity as well
-- as its current role. No broad grants or role memberships are added by tests.
BEGIN;
DO $$
BEGIN
    IF current_database() !~ '^myoko_schema_test_[a-z0-9_]+$' THEN
        RAISE EXCEPTION 'Refusing tests outside a named disposable database';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN
               ('crawler_writer', 'crawler_customer_reader', 'anon', 'authenticated')
               AND (rolsuper OR rolbypassrls)) THEN
        RAISE EXCEPTION 'An unprivileged test role unexpectedly bypasses RLS';
    END IF;
    IF (SELECT count(*) FROM pg_catalog.pg_indexes WHERE schemaname = 'crawler'
        AND indexname IN ('properties_municipality_availability_idx', 'properties_customer_active_idx',
                          'price_changes_property_time_idx', 'status_changes_property_time_idx',
                          'crawl_runs_source_time_idx')) <> 5 THEN
        RAISE EXCEPTION 'Expected application indexes are missing';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'crawler' AND c.relkind = 'r' AND
               (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) THEN
        RAISE EXCEPTION 'Private base table lacks enabled/forced RLS';
    END IF;
END;
$$;
SELECT set_config('schema_test.properties_oid', 'crawler.properties'::regclass::oid::text, true);

INSERT INTO crawler.sources (source_key, agency_name, website, permissions, crawl_config)
VALUES ('hardening_test_a', 'Myoko Akiya Bank', 'https://example.invalid', '{"test_only":true}', '{"test_only":true}'),
       ('hardening_test_b', 'Other Test Agency', 'https://example.invalid', '{}', '{}');
INSERT INTO crawler.crawl_runs (source_key, idempotency_key, started_at, checked_at, finished_at,
                               status, records_extracted, records_processed, warnings)
VALUES ('hardening_test_a', 'same-acquisition', now(), now(), now(), 'complete', 9, 9, ARRAY['Synthetic fixture']),
       ('hardening_test_b', 'other-acquisition', now(), now(), now(), 'complete', 1, 1, '{}');
INSERT INTO crawler.properties (source_key, source_property_id, original_listing_url, title_ja,
    municipality, area, area_en, first_discovered_at, last_checked_at, last_seen_at,
    listing_status, availability_status, source_status_ja)
SELECT 'hardening_test_a', x.number, 'https://example.invalid/' || x.number || '.pdf', '架空のテスト',
       'Shinano Town', '黒姫', 'hardening-' || x.number, now(), now(), now(), x.publication, x.availability, x.label
FROM (VALUES
    ('active', 'active', 'active', NULL::text),
    ('negotiation', 'active', 'under_negotiation', '商談中'),
    ('closed', 'active', 'viewings_closed', '内覧受付終了'),
    ('sold', 'sold', 'sold', '成約済'),
    ('withdrawn', 'withdrawn', 'withdrawn', '登録取消'),
    ('missing', 'not_found', 'unknown', NULL),
    ('unknown', 'active', 'unknown', NULL),
    ('ambiguous', 'active', 'active', '要確認'),
    ('stale-label', 'active', 'active', '商談中')
) AS x(number, publication, availability, label);
INSERT INTO crawler.properties (source_key, source_property_id, original_listing_url, title_ja,
    municipality, area_en, first_discovered_at, last_checked_at, listing_status, availability_status)
VALUES ('hardening_test_b', 'active', 'https://example.invalid/active.pdf', '別の架空物件',
        'Iizuna Town', 'hardening-other', now(), now(), 'active', 'active');

DO $$
BEGIN
    BEGIN
        UPDATE crawler.properties SET asking_price_jpy = -1 WHERE source_key = 'hardening_test_a';
        RAISE EXCEPTION 'Negative asking price should fail';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE crawler.properties SET land_area_sqm = 'Infinity'::numeric WHERE source_key = 'hardening_test_a';
        RAISE EXCEPTION 'Infinite area should fail';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE crawler.properties SET construction_date = '2025-02-30' WHERE source_key = 'hardening_test_a';
        RAISE EXCEPTION 'Invalid calendar date should fail';
    EXCEPTION WHEN datetime_field_overflow THEN NULL; END;
    BEGIN
        UPDATE crawler.properties SET last_seen_at = last_checked_at + interval '1 day'
        WHERE source_key = 'hardening_test_a';
        RAISE EXCEPTION 'A sighting after its check should fail';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO crawler.crawl_runs (source_key, idempotency_key, started_at, status)
        VALUES ('hardening_test_a', 'same-acquisition', now(), 'running');
        RAISE EXCEPTION 'Repeated acquisition should fail';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
        INSERT INTO crawler.price_changes (property_id, source_key, crawl_run_id, original_listing_url,
                                          old_price_jpy, new_price_jpy, detected_at)
        SELECT p.id, p.source_key, r.id, p.original_listing_url, 20, 10, now()
        FROM crawler.properties p CROSS JOIN crawler.crawl_runs r
        WHERE p.source_key = 'hardening_test_a' AND p.source_property_id = 'active'
          AND r.source_key = 'hardening_test_b';
        RAISE EXCEPTION 'Cross-source history reference should fail';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END;
$$;

SET SESSION AUTHORIZATION crawler_writer;
DO $$
BEGIN
    IF current_user <> 'crawler_writer' OR session_user <> 'crawler_writer' THEN
        RAISE EXCEPTION 'Writer test retained an administrator identity';
    END IF;
    IF (SELECT count(*) FROM crawler.properties WHERE source_key IN ('hardening_test_a', 'hardening_test_b')) <> 10 THEN
        RAISE EXCEPTION 'Writer should retain/read all internal statuses';
    END IF;
    BEGIN
        DELETE FROM crawler.properties WHERE source_key = 'hardening_test_a';
        RAISE EXCEPTION 'Writer must not delete unavailable properties';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        UPDATE crawler.sources SET enabled = true WHERE source_key = 'hardening_test_a';
        RAISE EXCEPTION 'Writer must not edit source approval/configuration';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
INSERT INTO crawler.price_changes (property_id, source_key, crawl_run_id, original_listing_url,
                                  old_price_jpy, new_price_jpy, detected_at)
SELECT p.id, p.source_key, r.id, p.original_listing_url, 20, 10, now()
FROM crawler.properties p JOIN crawler.crawl_runs r USING (source_key)
WHERE p.source_key = 'hardening_test_a' AND p.source_property_id = 'active';
DO $$
BEGIN
    BEGIN
        INSERT INTO crawler.price_changes (property_id, source_key, crawl_run_id, original_listing_url,
                                          old_price_jpy, new_price_jpy, detected_at)
        SELECT property_id, source_key, crawl_run_id, original_listing_url, old_price_jpy, new_price_jpy, detected_at
        FROM crawler.price_changes WHERE source_key = 'hardening_test_a';
        RAISE EXCEPTION 'Writer retry must not duplicate a price event';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    IF (SELECT count(*) FROM crawler.price_changes WHERE source_key = 'hardening_test_a') <> 1 THEN
        RAISE EXCEPTION 'Price event was duplicated';
    END IF;
    BEGIN
        UPDATE crawler.price_changes SET new_price_jpy = 5 WHERE source_key = 'hardening_test_a';
        RAISE EXCEPTION 'Writer must not rewrite immutable history';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET SESSION AUTHORIZATION;

SET SESSION AUTHORIZATION crawler_customer_reader;
DO $$
DECLARE actual text[];
BEGIN
    IF current_user <> 'crawler_customer_reader' OR session_user <> 'crawler_customer_reader' THEN
        RAISE EXCEPTION 'Reader test retained an administrator identity';
    END IF;
    IF NOT pg_catalog.row_security_active(current_setting('schema_test.properties_oid')::oid) THEN
        RAISE EXCEPTION 'Reader is bypassing RLS';
    END IF;
    SELECT array_agg(location_en ORDER BY location_en) INTO actual FROM property_api.customer_properties
    WHERE location_en LIKE 'hardening-%';
    IF actual IS DISTINCT FROM ARRAY['hardening-active', 'hardening-other']::text[] THEN
        RAISE EXCEPTION 'Unavailable records leaked or available records disappeared: %', actual;
    END IF;
    BEGIN
        PERFORM source_status_ja FROM crawler.properties;
        RAISE EXCEPTION 'Reader accessed private base table';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        PERFORM * FROM crawler.crawl_runs;
        RAISE EXCEPTION 'Reader accessed crawler metadata';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        EXECUTE 'SELECT id FROM property_api.customer_properties';
        RAISE EXCEPTION 'Customer view exposed internal UUID';
    EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN
        EXECUTE 'SELECT source_property_id, source_status_ja FROM property_api.customer_properties';
        RAISE EXCEPTION 'Customer view exposed private source fields';
    EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN
        EXECUTE 'SET ROLE crawler_writer';
        RAISE EXCEPTION 'Reader escalated to writer';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        PERFORM set_config('row_security', 'off', true);
        PERFORM * FROM property_api.customer_properties;
        RAISE EXCEPTION 'Disabling row_security bypassed the reader policy';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET SESSION AUTHORIZATION;

SET SESSION AUTHORIZATION anon;
DO $$ BEGIN
    BEGIN PERFORM * FROM property_api.customer_properties; RAISE EXCEPTION 'Anonymous view access';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM * FROM crawler.properties; RAISE EXCEPTION 'Anonymous internal access';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION authenticated;
DO $$ BEGIN
    BEGIN PERFORM * FROM property_api.customer_properties; RAISE EXCEPTION 'Login alone granted paid access';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM * FROM crawler.crawl_runs; RAISE EXCEPTION 'Customer accessed crawler logs';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION service_role;
DO $$ BEGIN
    BEGIN PERFORM * FROM crawler.properties; RAISE EXCEPTION 'BYPASSRLS also bypassed object grants';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET SESSION AUTHORIZATION;

SET SESSION AUTHORIZATION crawler_writer;
UPDATE crawler.properties SET availability_status = 'under_negotiation', source_status_ja = '商談中'
WHERE source_key = 'hardening_test_a' AND source_property_id = 'active';
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION crawler_customer_reader;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM property_api.customer_properties WHERE location_en = 'hardening-active') THEN
        RAISE EXCEPTION 'Negotiation transition did not remove a public row';
    END IF;
END; $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION crawler_writer;
UPDATE crawler.properties SET availability_status = 'active', source_status_ja = NULL
WHERE source_key = 'hardening_test_a' AND source_property_id = 'active';
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION crawler_customer_reader;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM property_api.customer_properties WHERE location_en = 'hardening-active') THEN
        RAISE EXCEPTION 'Observed reactivation did not restore a public row';
    END IF;
END; $$;
RESET SESSION AUTHORIZATION;

SET SESSION AUTHORIZATION crawler_writer;
UPDATE crawler.properties SET listing_status = 'active', availability_status = 'active',
    source_status_ja = NULL, last_seen_at = now(), last_checked_at = now()
WHERE source_key = 'hardening_test_a' AND source_property_id = 'missing';
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION crawler_customer_reader;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM property_api.customer_properties WHERE location_en = 'hardening-missing') THEN
        RAISE EXCEPTION 'A successfully observed missing listing did not return to the public view';
    END IF;
END; $$;
RESET SESSION AUTHORIZATION;

ROLLBACK;
