-- SYNTHETIC RUNTIME TEST: disposable PostgreSQL/Supabase clone only, after 004.
-- Not run by ordinary Python tests; no production execution authorized.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $$
DECLARE availability text; publication text; denied boolean; i integer := 0;
BEGIN
    IF NOT crawler.source_customer_eligible('myoko_akiya_bank','active','active',NULL,NULL,'unknown')
        OR NOT crawler.source_customer_eligible('shinano_akiya_bank','active','active',NULL,'sale','lodge')
        OR NOT crawler.source_customer_eligible('joetsu_akiya_bank','active','active',NULL,'sale','house') THEN
        RAISE EXCEPTION 'Existing or new source eligibility changed';
    END IF;
    FOREACH availability IN ARRAY ARRAY['active','under_negotiation','viewings_closed','sold','withdrawn','unknown','not_found'] LOOP
        i := i+1;
        publication := CASE WHEN availability IN ('sold','withdrawn','not_found') THEN availability ELSE 'active' END;
        INSERT INTO crawler.properties(source_key,source_property_id,original_listing_url,title_ja,
            asking_price_jpy,municipality,property_type,transaction_type,purchase_conditions_ja,source_facts,
            listing_status,availability_status,first_discovered_at,last_checked_at)
        VALUES ('joetsu_akiya_bank','14-99000'||i,
            'https://joetsu-akiyabank.jp/archives/realestate/14-99000'||i||'-sql-probe/',
            'Synthetic verification only',1000000,'Joetsu','house','sale','Source condition',
            '{"agent":"PRIVATE","thumbnail_candidate_url":"PRIVATE"}'::jsonb,publication,
            CASE WHEN availability='not_found' THEN 'unknown' ELSE availability END,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    END LOOP;
    IF crawler.source_customer_eligible('joetsu_akiya_bank','active','active',NULL,'rent','house')
        OR crawler.source_customer_eligible('joetsu_akiya_bank','active','active',NULL,'sale','land')
        OR crawler.source_customer_eligible('joetsu_akiya_bank','active','active','unknown','sale','house') THEN
        RAISE EXCEPTION 'Unsafe classification eligible';
    END IF;
    FOREACH availability IN ARRAY ARRAY['anon','authenticated','crawler_customer_reader'] LOOP
        IF has_schema_privilege(availability,'crawler','USAGE')
            OR has_table_privilege(availability,'crawler.properties','INSERT,UPDATE,DELETE,TRUNCATE') THEN
            RAISE EXCEPTION 'Public/reader role gained private/write access';
        END IF;
    END LOOP;
    IF has_column_privilege('crawler_customer_reader','crawler.properties','source_facts','SELECT')
        OR has_column_privilege('crawler_customer_reader','crawler.properties','source_property_id','SELECT') THEN
        RAISE EXCEPTION 'Private metadata readable';
    END IF;
END $$;
SET LOCAL ROLE crawler_customer_reader;
DO $$ DECLARE n integer; BEGIN
    SELECT count(*) INTO n FROM property_api.customer_properties
        WHERE original_pdf_url LIKE '%-sql-probe/';
    IF n<>1 THEN RAISE EXCEPTION 'Reader view exposed restricted fixtures'; END IF;
    IF EXISTS(SELECT 1 FROM property_api.customer_properties WHERE original_pdf_url LIKE '%-sql-probe/'
        AND (thumbnail_url IS NOT NULL OR purchase_conditions_ja <> 'Source condition')) THEN
        RAISE EXCEPTION 'Image gate or notice projection failed';
    END IF;
    BEGIN
        PERFORM source_facts FROM crawler.properties LIMIT 0;
        RAISE EXCEPTION 'Private metadata unexpectedly readable';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        UPDATE crawler.properties SET asking_price_jpy=asking_price_jpy WHERE false;
        RAISE EXCEPTION 'Reader unexpectedly writable';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Reactivation is visible without deleting/recreating its internal identity.
UPDATE crawler.properties SET availability_status='active'
WHERE source_key='joetsu_akiya_bank' AND source_property_id='14-990002'
    AND original_listing_url LIKE '%-sql-probe/';
SET LOCAL ROLE crawler_customer_reader;
DO $$ BEGIN
    IF (SELECT count(*) FROM property_api.customer_properties WHERE original_pdf_url LIKE '%-sql-probe/')<>2 THEN
        RAISE EXCEPTION 'Reactivation failed';
    END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
    BEGIN PERFORM * FROM property_api.customer_properties LIMIT 0;
        RAISE EXCEPTION 'Anonymous reader unexpectedly authorized';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
    BEGIN PERFORM * FROM property_api.customer_properties LIMIT 0;
        RAISE EXCEPTION 'Unsubscribed authenticated reader unexpectedly authorized';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE crawler_writer;
UPDATE crawler.properties SET purchase_conditions_ja=purchase_conditions_ja
WHERE source_key='joetsu_akiya_bank' AND original_listing_url LIKE '%-sql-probe/';
DO $$ BEGIN
    BEGIN DELETE FROM crawler.properties WHERE false;
        RAISE EXCEPTION 'Writer unexpectedly obtained DELETE';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
