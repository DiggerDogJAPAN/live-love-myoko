-- FUTURE DISPOSABLE-LOCAL-DATABASE TEST ONLY. NOT EXECUTED IN PHASE 4A.
-- Requires 001_proposed_schema.sql already installed in an empty PostgreSQL 15+
-- test database and a test operator able to SET ROLE (e.g. local superuser).
-- Never run against production/Supabase. Fixtures and all writes roll back.
BEGIN;

INSERT INTO crawler.sources (source_key, agency_name, website)
VALUES ('schema_test_a', 'Myoko Akiya Bank', 'https://example.invalid'),
       ('schema_test_b', 'Another Test Agency', 'https://example.invalid');

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
END;
$$;
RESET ROLE;

ROLLBACK;
