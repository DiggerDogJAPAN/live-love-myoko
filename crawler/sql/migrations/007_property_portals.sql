-- Portal permission confirmed by the user 2026-10-29. Apply once after 006,
-- with backup/checksum ledger. No updates/deletes of existing property records.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE crawler.properties ADD COLUMN portal_duplicate_review_pending boolean
    GENERATED ALWAYS AS (source_key IN ('suumo','rakusumu') AND COALESCE(source_facts->>'duplicate_review_pending','false') <> 'false') STORED;
ALTER TABLE crawler.properties ADD CONSTRAINT portal_source_integrity CHECK (
    source_key NOT IN ('suumo','rakusumu') OR COALESCE(
        source_facts->>'portal_inventory_complete'='true'
        AND source_facts->>'duplicate_review_pending' IN ('true','false')
        AND jsonb_typeof((source_facts->>'duplicate_candidates')::jsonb)='array'
        AND municipality IN ('Myoko','Joetsu','Shinano Town','Iizuna Town')
        AND transaction_type='sale' AND property_type='house'
        AND (availability_status<>'active' OR source_facts->>'residential_building_verified'='true')
        AND description_ja IS NULL AND description_en IS NULL
        AND (source_key='suumo' AND source_property_id ~ '^[0-9]{8}$'
            AND original_listing_url ~ ('^https://suumo[.]jp/(chukoikkodate|ikkodate)/(niigata/sc_(myoko|joetsu)|nagano/sc_kamiminochigun)/nc_' || source_property_id || '/$')
            AND (main_image_url IS NULL OR image_permission='permitted' AND main_image_url ~* ('^https://img01[.]suumo[.]com/jj/resizeImage[?]src=gazo%2Fbukken%2F[A-Za-z0-9%_/-]+%2F' || source_property_id || '%2F' || source_property_id || '_[0-9]+[.](jpg|jpeg|png)&w=[0-9]{1,4}&h=[0-9]{1,4}$'))
         OR source_key='rakusumu' AND source_property_id ~ '^[0-9]{5}-[0-9]{6}$'
            AND original_listing_url = 'https://www.rakusumu.com/sale/detail/' || source_property_id
            AND (main_image_url IS NULL OR image_permission='permitted' AND main_image_url ~* ('^https://www[.]rakusumu[.]com/images/[0-9]{5}/' || source_property_id || '/img_' || source_property_id || '_G_[0-9]+_[A-Za-z0-9]+[.](jpg|jpeg|png)([?]u=[0-9]+)?$'))),false));
-- RLS evaluates the private review flag without granting column access.
CREATE POLICY portal_duplicate_review_gate ON crawler.properties AS RESTRICTIVE
    FOR SELECT TO crawler_customer_reader USING (NOT portal_duplicate_review_pending);
CREATE OR REPLACE FUNCTION crawler.source_customer_eligible(source text,publication text,availability text,
    status_label text,transaction text,kind text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path=pg_catalog
RETURN COALESCE(crawler.customer_eligible(publication,availability,
    CASE WHEN source IN ('suumo','rakusumu') AND status_label IN ('販売中','公開中') THEN NULL ELSE status_label END)
    AND (source='myoko_akiya_bank' OR (source IN ('shinano_akiya_bank','joetsu_akiya_bank')
        AND transaction='sale' AND kind IN ('house','apartment','lodge','commercial'))
        OR (source IN ('iizuna_akiya_bank','suumo','rakusumu') AND transaction='sale' AND kind='house')),false);
CREATE OR REPLACE VIEW property_api.customer_properties
WITH (security_invoker=true,security_barrier=true) AS
SELECT
    'Property in ' || COALESCE(NULLIF(p.area_en,''),NULLIF(p.area,''),NULLIF(p.region_en,''),p.municipality,'Unknown location') AS title,
    p.asking_price_jpy,p.area AS location_ja,p.area_en AS location_en,
    COALESCE(p.area_en,p.area) AS location_display,p.region_ja,p.region_en,
    cardinality(p.unmapped_locations)>0 AS location_needs_review,
    CASE WHEN p.image_permission='permitted' THEN p.main_image_url ELSE NULL END AS thumbnail_url,
    p.original_listing_url AS original_pdf_url,p.listing_status AS publication_status,
    p.availability_status,'Active'::text AS status,CASE WHEN p.source_key='iizuna_akiya_bank' AND p.original_listing_url LIKE 'https://rakuen-akiya.jp/bukken/%' THEN 'Source: Rakuen Shinshu Akiya Bank (Iizuna)' ELSE 'Source: ' || s.agency_name END AS source_attribution,
    p.last_checked_at,p.municipality,p.property_type,p.transaction_type,
    p.purchase_conditions_ja
FROM crawler.properties p JOIN crawler.sources s USING(source_key)
WHERE NOT s.synthetic AND crawler.source_customer_eligible(p.source_key,p.listing_status,
    p.availability_status,p.source_status_ja,p.transaction_type,p.property_type);
INSERT INTO crawler.sources(source_key,agency_name,website,enabled,synthetic,
    robots_review_url,robots_reviewed_at,terms_review_url,terms_reviewed_at,access_notes,content_rights_basis,permissions,crawl_config)
VALUES
('suumo','SUUMO','https://suumo.jp/',false,false,'https://suumo.jp/robots.txt','2026-10-29'::date,
 'https://cdn.p.recruit.co.jp/terms/suu-t-1003/index.html','2026-10-29'::date,
 'Permitted city HTML paths only; JJ010FJ001 remains robots-disallowed. No authentication/CAPTCHA bypass or media downloads.',
 'User confirmed automated collection, commercial listing display and direct thumbnail hotlink permission on 2026-10-29.',
 '{"factual_collection":true,"commercial_display":true,"photograph_display":true,"direct_hotlink":true,"description_display":false}'::jsonb,
 '{"allow_initial_empty":true,"house_sales_only":true,"minimum_interval_seconds":1,"max_pages":50,"max_details":600}'::jsonb),
('rakusumu','Rakusumu','https://www.rakusumu.com/',false,false,'https://www.rakusumu.com/robots.txt','2026-10-29'::date,
 'https://www.rakusumu.com/page/kiyaku','2026-10-29'::date,
 'Prior permission confirmed by user. Robots returned 404; recheck every crawl. Scope city GET filters on every page, new-listings sort. No media downloads.',
 'User confirmed automated collection, commercial listing display and direct thumbnail hotlink permission on 2026-10-29.',
 '{"factual_collection":true,"commercial_display":true,"photograph_display":true,"direct_hotlink":true,"description_display":false}'::jsonb,
 '{"allow_initial_empty":true,"house_sales_only":true,"minimum_interval_seconds":1,"max_pages":50,"max_details":600}'::jsonb)
ON CONFLICT(source_key) DO NOTHING;
COMMIT;
