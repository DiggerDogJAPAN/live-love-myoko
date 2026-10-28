-- Approved Joetsu direct hotlinks only; no record deletion or eligibility changes.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE crawler.properties DROP CONSTRAINT joetsu_private_media;
ALTER TABLE crawler.properties ADD CONSTRAINT joetsu_private_media CHECK (
    source_key <> 'joetsu_akiya_bank' OR (description_ja IS NULL AND description_en IS NULL
    AND (main_image_url IS NULL OR COALESCE(image_permission='permitted'
        AND main_image_url ~* '^https://joetsu-akiyabank[.]jp/wp-content/uploads/[^?#[:space:]]+[.](jpg|jpeg|png|webp)$'
        AND source_facts->>'photo_selected_url'=main_image_url
        AND source_facts->>'photo_verification'='source_figure_caption_v1',false))));
CREATE OR REPLACE VIEW property_api.customer_properties
WITH (security_invoker=true,security_barrier=true) AS
SELECT
    'Property in ' || COALESCE(NULLIF(p.area_en,''),NULLIF(p.area,''),NULLIF(p.region_en,''),p.municipality,'Unknown location') AS title,
    p.asking_price_jpy,p.area AS location_ja,p.area_en AS location_en,
    COALESCE(p.area_en,p.area) AS location_display,p.region_ja,p.region_en,
    cardinality(p.unmapped_locations)>0 AS location_needs_review,
    CASE WHEN p.image_permission='permitted' THEN p.main_image_url ELSE NULL END AS thumbnail_url,
    p.original_listing_url AS original_pdf_url,p.listing_status AS publication_status,
    p.availability_status,'Active'::text AS status,'Source: ' || s.agency_name AS source_attribution,
    p.last_checked_at,p.municipality,p.property_type,p.transaction_type,
    p.purchase_conditions_ja
FROM crawler.properties p JOIN crawler.sources s USING(source_key)
WHERE NOT s.synthetic AND crawler.source_customer_eligible(p.source_key,p.listing_status,
    p.availability_status,p.source_status_ja,p.transaction_type,p.property_type);
COMMIT;
