-- Approved Iizuna activation: apply once after 005 with backup/checksum tracking.
-- No UPDATE/DELETE to existing properties or new role grants. Municipal card photos only.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE crawler.properties ADD CONSTRAINT iizuna_source_integrity CHECK (
    source_key <> 'iizuna_akiya_bank' OR COALESCE(
        source_property_id ~ '^(reg-[0-9]{3,}|rakuen-[0-9]+)$'
        AND original_listing_url ~ '^https://(www[.]town[.]iizuna[.]nagano[.]jp/ijuportal/live/sale/[0-9]+[.]html|rakuen-akiya[.]jp/bukken/[0-9]+/)$'
        AND source_facts->>'inventory_complete'='true'
        AND (main_image_url IS NULL OR COALESCE(image_permission='permitted'
            AND original_listing_url ~ '^https://www[.]town[.]iizuna[.]nagano[.]jp/ijuportal/live/sale/[0-9]+[.]html$'
            AND main_image_url ~* '^https://www[.]town[.]iizuna[.]nagano[.]jp/fs/[^?#[:space:]]+[.](jpg|jpeg|png|webp)$'
            AND source_facts->>'provider'='municipal'
            AND source_facts->>'image_candidate_url'=main_image_url
            AND source_facts->>'image_verification'='municipal_primary_card_v1',false))
        AND description_ja IS NULL AND description_en IS NULL,false));
CREATE OR REPLACE FUNCTION crawler.source_customer_eligible(source text,publication text,availability text,
    status_label text,transaction text,kind text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path=pg_catalog
RETURN COALESCE(crawler.customer_eligible(publication,availability,status_label)
    AND (source='myoko_akiya_bank' OR (source IN ('shinano_akiya_bank','joetsu_akiya_bank')
        AND transaction='sale' AND kind IN ('house','apartment','lodge','commercial'))
        OR (source='iizuna_akiya_bank' AND transaction='sale' AND kind='house')),false);
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
    robots_review_url,robots_reviewed_at,terms_review_url,terms_reviewed_at,access_notes,
    content_rights_basis,permissions,crawl_config)
VALUES ('iizuna_akiya_bank','Iizuna Town Akiya Bank',
    'https://www.town.iizuna.nagano.jp/ijuportal/live/sale/search/',false,false,
    'https://www.town.iizuna.nagano.jp/robots.txt','2026-10-28'::date,
    'https://www.town.iizuna.nagano.jp/docs/292.html','2026-10-28'::date,
    'Disabled pending review. One municipality source combines both feeds atomically. Rakuen robots: https://rakuen-akiya.jp/robots.txt ; Iizuna-only public HTML, no images/PDFs.',
    'User confirmed permission for municipal factual collection and display on 2026-10-28. Municipal photograph display/hotlinking also confirmed on 2026-10-29; Rakuen photos and protected prose republication remain unapproved.',
    '{"municipal_factual_collection":true,"photograph_display":true,"photograph_scope":"municipal_only","municipal_direct_hotlink":true,"rakuen_photograph_display":false,"description_display":false}'::jsonb,
    '{"allow_initial_empty":true,"feeds":["municipal","rakuen"],"require_both_feeds":true,"rakuen_jiscode":"20590","house_sales_only":true}'::jsonb)
ON CONFLICT (source_key) DO NOTHING;
COMMIT;
