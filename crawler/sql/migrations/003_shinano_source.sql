-- REVIEW ONLY. Apply once AFTER approval, before publishing the new workflow/API.
-- No UPDATE/DELETE of property rows; historical initial schema remains immutable.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE crawler.properties ADD COLUMN transaction_type text
    CHECK (transaction_type IN ('sale','rent'));
ALTER TABLE crawler.properties ADD COLUMN construction_details text;
ALTER TABLE crawler.properties ADD COLUMN source_facts jsonb
    CHECK (source_facts IS NULL OR jsonb_typeof(source_facts)='object');
ALTER TABLE crawler.properties DROP CONSTRAINT properties_property_type_check;
ALTER TABLE crawler.properties ADD CONSTRAINT properties_property_type_check
    CHECK (property_type IN ('house','land','apartment','commercial','other','unknown','lodge'));

CREATE FUNCTION crawler.source_customer_eligible(source text,publication text,availability text,
    status_label text,transaction text,kind text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path=pg_catalog
RETURN COALESCE(crawler.customer_eligible(publication,availability,status_label)
    AND (source='myoko_akiya_bank' OR (source='shinano_akiya_bank'
        AND transaction='sale' AND kind IN ('house','apartment','lodge','commercial'))),false);
REVOKE ALL ON FUNCTION crawler.source_customer_eligible(text,text,text,text,text,text)
    FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION crawler.source_customer_eligible(text,text,text,text,text,text)
    TO crawler_customer_reader,crawler_writer;
GRANT SELECT(transaction_type,property_type) ON crawler.properties TO crawler_customer_reader;
ALTER POLICY properties_customer_read ON crawler.properties TO crawler_customer_reader
    USING (crawler.source_customer_eligible(source_key,listing_status,availability_status,
        source_status_ja,transaction_type,property_type));

-- Preserve all existing view column names/order/types; append structured fields.
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
    p.last_checked_at,p.municipality,p.property_type,p.transaction_type
FROM crawler.properties p JOIN crawler.sources s USING(source_key)
WHERE NOT s.synthetic AND crawler.source_customer_eligible(p.source_key,p.listing_status,
    p.availability_status,p.source_status_ja,p.transaction_type,p.property_type);

INSERT INTO crawler.sources(source_key,agency_name,website,enabled,synthetic,
    robots_review_url,robots_reviewed_at,terms_review_url,terms_reviewed_at,
    access_notes,content_rights_basis,live_access_approved_at,permissions,crawl_config)
VALUES ('shinano_akiya_bank','Shinano Town Akiya Bank',
    'https://shinanomachi-iju.jp/akiya/?property_type=used',true,false,
    'https://shinanomachi-iju.jp/robots.txt','2026-10-28'::date,
    'https://www.town.shinano.lg.jp/docs/967.html','2026-10-28'::date,
    'User authorized integration. Bounded public sale-building HTML only; obey robots on each run, no REST API or PDFs.',
    'User explicitly confirmed property photograph use and direct hotlink permission for this project.',
    CURRENT_TIMESTAMP,'{"photograph_display":true,"direct_hotlink":true}'::jsonb,
    '{"allow_initial_empty":true,"sale_buildings_only":true}'::jsonb)
ON CONFLICT (source_key) DO NOTHING;
COMMIT;
