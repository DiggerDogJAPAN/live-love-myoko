-- LOCAL PROPOSAL. After backup and approval, apply after 001, 002 and 003.
-- Rerunnable DDL; no updates/deletes to existing properties or histories.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE crawler.properties ADD COLUMN IF NOT EXISTS purchase_conditions_ja text;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crawler.properties'::regclass AND conname='joetsu_property_number') THEN
        ALTER TABLE crawler.properties ADD CONSTRAINT joetsu_property_number CHECK (
            source_key <> 'joetsu_akiya_bank' OR (source_property_id IS NOT NULL
            AND source_property_id ~ '^([1-9]|1[0-9]|2[0-8])-[0-9]+$'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crawler.properties'::regclass AND conname='joetsu_conflicting_listing') THEN
        ALTER TABLE crawler.properties ADD CONSTRAINT joetsu_conflicting_listing CHECK (
            source_key <> 'joetsu_akiya_bank' OR source_property_id <> '5-34' OR availability_status <> 'active');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crawler.properties'::regclass AND conname='joetsu_private_media') THEN
        ALTER TABLE crawler.properties ADD CONSTRAINT joetsu_private_media CHECK (
            source_key <> 'joetsu_akiya_bank' OR (main_image_url IS NULL AND image_permission='unknown'
                AND description_ja IS NULL AND description_en IS NULL));
    END IF;
END $$;
CREATE OR REPLACE FUNCTION crawler.source_customer_eligible(source text,publication text,availability text,
    status_label text,transaction text,kind text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path=pg_catalog
RETURN COALESCE(crawler.customer_eligible(publication,availability,status_label)
    AND (source='myoko_akiya_bank' OR (source IN ('shinano_akiya_bank','joetsu_akiya_bank')
        AND transaction='sale' AND kind IN ('house','apartment','lodge','commercial'))),false);
REVOKE ALL ON FUNCTION crawler.source_customer_eligible(text,text,text,text,text,text)
    FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION crawler.source_customer_eligible(text,text,text,text,text,text)
    TO crawler_customer_reader,crawler_writer;
GRANT SELECT(purchase_conditions_ja) ON crawler.properties TO crawler_customer_reader;
-- Existing RLS policy already invokes this same function/signature. No new roles,
-- memberships, private-schema usage, service-role credentials or API exposure.
CREATE OR REPLACE VIEW property_api.customer_properties
WITH (security_invoker=true,security_barrier=true) AS
SELECT
    'Property in ' || COALESCE(NULLIF(p.area_en,''),NULLIF(p.area,''),NULLIF(p.region_en,''),p.municipality,'Unknown location') AS title,
    p.asking_price_jpy,p.area AS location_ja,p.area_en AS location_en,
    COALESCE(p.area_en,p.area) AS location_display,p.region_ja,p.region_en,
    cardinality(p.unmapped_locations)>0 AS location_needs_review,
    CASE WHEN p.source_key <> 'joetsu_akiya_bank' AND p.image_permission='permitted' THEN p.main_image_url ELSE NULL END AS thumbnail_url,
    p.original_listing_url AS original_pdf_url,p.listing_status AS publication_status,
    p.availability_status,'Active'::text AS status,'Source: ' || s.agency_name AS source_attribution,
    p.last_checked_at,p.municipality,p.property_type,p.transaction_type,
    p.purchase_conditions_ja
FROM crawler.properties p JOIN crawler.sources s USING(source_key)
WHERE NOT s.synthetic AND crawler.source_customer_eligible(p.source_key,p.listing_status,
    p.availability_status,p.source_status_ja,p.transaction_type,p.property_type);
INSERT INTO crawler.sources(source_key,agency_name,website,enabled,synthetic,
    robots_review_url,robots_reviewed_at,access_notes,permissions,crawl_config)
VALUES ('joetsu_akiya_bank','Joetsu City Akiya Bank',
    'https://joetsu-akiyabank.jp/archives/bukken_type/baibai/',false,false,
    'https://joetsu-akiyabank.jp/robots.txt','2026-10-28'::date,
    'Disabled pending database/website deployment approval. Public sale HTML only; no PDFs or image requests. Photograph republication unapproved.',
    '{"photograph_display":false,"direct_hotlink":false,"description_display":false}'::jsonb,
    '{"allow_initial_empty":true,"sale_buildings_only":true,"max_pages":25,"minimum_interval_seconds":1}'::jsonb)
ON CONFLICT (source_key) DO NOTHING;
COMMIT;
