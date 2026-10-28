-- Upgrade 002: execute inside the atomic migration runner transaction.
-- English backfill uses the shared reviewed dictionary in locations.py.
-- Keep the original view columns, eligibility, invoker/barrier options and ACL.
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Only the additional input column needed by the invoker CASE expression.
-- No schema usage, writes, login/membership or API-role access is granted.
GRANT SELECT (image_permission) ON crawler.properties TO crawler_customer_reader;

CREATE OR REPLACE VIEW property_api.customer_properties
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    'Property in ' || COALESCE(NULLIF(p.area_en, ''), NULLIF(p.area, ''), NULLIF(p.region_en, ''), p.municipality, 'Unknown location') AS title,
    p.asking_price_jpy,
    p.area AS location_ja,
    p.area_en AS location_en,
    COALESCE(p.area_en, p.area) AS location_display,
    p.region_ja,
    p.region_en,
    cardinality(p.unmapped_locations) > 0 AS location_needs_review,
    CASE WHEN p.image_permission = 'permitted' THEN p.main_image_url ELSE NULL END AS thumbnail_url,
    p.original_listing_url AS original_pdf_url,
    p.listing_status AS publication_status,
    p.availability_status,
    'Active'::text AS status,
    'Source: ' || s.agency_name AS source_attribution,
    p.last_checked_at
FROM crawler.properties AS p
JOIN crawler.sources AS s ON s.source_key = p.source_key
WHERE crawler.customer_eligible(p.listing_status, p.availability_status, p.source_status_ja)
    AND NOT s.synthetic;
