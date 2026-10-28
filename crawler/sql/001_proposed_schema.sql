-- Initial schema, reviewed in Phase 4B-3; installation authorized in Phase 5.
-- Fresh-install proposal for Supabase PostgreSQL 15+ (UTF8).
-- Not an upgrade script for an existing installation. See docs/database-design.md.
-- No role memberships, login credentials, subscriptions or API exposure are configured.
BEGIN;
-- Bind built-ins deterministically and bound administrative lock/wait times.
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE ROLE crawler_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE crawler_customer_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOINHERIT NOREPLICATION NOBYPASSRLS;

CREATE SCHEMA crawler;
CREATE SCHEMA property_api;
REVOKE ALL ON SCHEMA crawler, property_api FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA crawler
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
-- Global function defaults can grant EXECUTE despite per-schema revocations.
-- Do not change unrelated schemas' defaults: revoke each helper explicitly below.
ALTER DEFAULT PRIVILEGES IN SCHEMA property_api
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

-- One reusable policy, shared by base-table RLS and the safe customer view.
-- Matches the current unrestricted Myoko badge vocabulary. Unknown labels deny.
-- Source adapters must normalize Japanese text; normalize() also applies NFKC.
CREATE FUNCTION crawler.customer_eligible(publication text, availability text, status_label text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = pg_catalog
RETURN COALESCE(
    publication = 'active'
    AND availability = 'active'
    AND normalize(COALESCE(status_label, ''), NFKC)
        ~* '^[[:space:]]*((募集中|値下げ|新着|NEW|Price Reduced)[[:space:]]*)*$',
    false
);
REVOKE ALL ON FUNCTION crawler.customer_eligible(text, text, text)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE crawler.sources (
    source_key text PRIMARY KEY CHECK (source_key ~ '^[a-z0-9][a-z0-9_-]*$'),
    agency_name text NOT NULL CHECK (btrim(agency_name) <> ''),
    -- Source attribution is constructed as 'Source: ' || agency_name.
    website text NOT NULL CHECK (website ~ '^https?://[^[:space:]]+$'),
    enabled boolean NOT NULL DEFAULT false,
    synthetic boolean NOT NULL DEFAULT false,
    robots_review_url text,
    robots_reviewed_at timestamptz,
    terms_review_url text,
    terms_reviewed_at timestamptz,
    access_notes text,
    content_rights_basis text,
    live_access_approved_at timestamptz,
    permissions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(permissions) = 'object'),
    crawl_config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(crawl_config) = 'object'),
    -- A valid applied partial snapshot advances the first watermark, never the second.
    last_successful_check_at timestamptz CHECK (isfinite(last_successful_check_at)),
    last_complete_check_at timestamptz CHECK (isfinite(last_complete_check_at)),
    CHECK (last_complete_check_at IS NULL OR
           (last_successful_check_at IS NOT NULL AND last_complete_check_at <= last_successful_check_at)),
    CHECK (NOT enabled OR synthetic OR (
        robots_review_url IS NOT NULL AND robots_reviewed_at IS NOT NULL
        AND terms_review_url IS NOT NULL AND terms_reviewed_at IS NOT NULL
        AND access_notes IS NOT NULL AND live_access_approved_at IS NOT NULL
    ))
);

CREATE TABLE crawler.crawl_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_key text NOT NULL REFERENCES crawler.sources(source_key),
    -- Reused for a retry of ONE acquisition; a new day's acquisition gets a new key.
    idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
    snapshot_sha256 text CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
    started_at timestamptz NOT NULL CHECK (isfinite(started_at)),
    checked_at timestamptz CHECK (isfinite(checked_at)),
    finished_at timestamptz CHECK (isfinite(finished_at)),
    status text NOT NULL CHECK (status IN ('running', 'complete', 'partial', 'failed')),
    records_extracted integer CHECK (records_extracted >= 0),
    records_processed integer NOT NULL DEFAULT 0 CHECK (records_processed >= 0),
    warnings text[] NOT NULL DEFAULT '{}'::text[] CHECK (array_position(warnings, NULL) IS NULL),
    error_summary text,
    summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary) = 'object'),
    UNIQUE (source_key, idempotency_key),
    UNIQUE (id, source_key),
    CHECK ((status = 'running') = (finished_at IS NULL)),
    CHECK (finished_at IS NULL OR finished_at >= started_at),
    CHECK (checked_at IS NULL OR (checked_at >= started_at AND
           (finished_at IS NULL OR checked_at <= finished_at))),
    CHECK (status NOT IN ('complete', 'partial') OR
           (checked_at IS NOT NULL AND records_extracted IS NOT NULL))
);

CREATE TABLE crawler.properties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_key text NOT NULL REFERENCES crawler.sources(source_key),
    original_listing_url text NOT NULL CHECK (original_listing_url ~ '^https?://[^[:space:]]+$'),
    source_property_id text CHECK (btrim(source_property_id) <> ''),
    -- Canonicalize URLs before writes. IDs are opaque and case-sensitive.
    identity_token text GENERATED ALWAYS AS (
        CASE WHEN source_property_id IS NOT NULL THEN 'id:' || source_property_id
             ELSE 'url:' || original_listing_url END
    ) STORED,
    title_ja text NOT NULL CHECK (btrim(title_ja) <> ''),
    title_en text,
    description_ja text,
    description_en text,
    asking_price_jpy bigint CHECK (asking_price_jpy >= 0),
    address text,
    -- Deliberately extensible text, not a fixed town enum/check list.
    -- Current labels: Myoko, Joetsu, Shinano Town; also supports Iizuna Town.
    municipality text CHECK (btrim(municipality) <> ''),
    -- Japanese neighbourhood and optional reviewed English equivalent.
    -- Kurohime: municipality='Shinano Town', area='黒姫', area_en='Kurohime'.
    area text,
    area_en text,
    region_ja text,
    region_en text,
    unmapped_locations text[] NOT NULL DEFAULT '{}'::text[]
        CHECK (array_position(unmapped_locations, NULL) IS NULL),
    land_area_sqm numeric CHECK (land_area_sqm > 0 AND land_area_sqm < 'Infinity'::numeric),
    building_area_sqm numeric CHECK (building_area_sqm > 0 AND building_area_sqm < 'Infinity'::numeric),
    -- Preserve YYYY / YYYY-MM / YYYY-MM-DD precision and reject invalid dates.
    construction_date text CHECK (
        CASE WHEN construction_date IS NULL THEN true
             WHEN construction_date ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$' THEN
                 make_date(split_part(construction_date, '-', 1)::integer,
                           COALESCE(NULLIF(split_part(construction_date, '-', 2), ''), '1')::integer,
                           COALESCE(NULLIF(split_part(construction_date, '-', 3), ''), '1')::integer) IS NOT NULL
             ELSE false END
    ),
    building_age_years integer CHECK (building_age_years >= 0),
    floor_plan text,
    property_type text NOT NULL DEFAULT 'unknown'
        CHECK (property_type IN ('house', 'land', 'apartment', 'commercial', 'other', 'unknown')),
    parking text,
    main_image_url text CHECK (main_image_url ~ '^https?://[^[:space:]]+$'),
    description_permission text NOT NULL DEFAULT 'unknown'
        CHECK (description_permission IN ('unknown', 'permitted', 'synthetic')),
    image_permission text NOT NULL DEFAULT 'unknown'
        CHECK (image_permission IN ('unknown', 'permitted', 'synthetic')),
    content_rights_basis text,
    first_discovered_at timestamptz NOT NULL CHECK (isfinite(first_discovered_at)),
    last_checked_at timestamptz NOT NULL CHECK (isfinite(last_checked_at)),
    -- Nullable for legacy JSON where last successful sighting cannot be recovered.
    last_seen_at timestamptz CHECK (isfinite(last_seen_at)),
    listing_status text NOT NULL DEFAULT 'active'
        CHECK (listing_status IN ('active', 'not_found', 'withdrawn', 'sold')),
    availability_status text NOT NULL DEFAULT 'unknown'
        CHECK (availability_status IN ('active', 'under_negotiation', 'viewings_closed', 'sold', 'withdrawn', 'unknown')),
    source_status_ja text,
    missing_verification_state text GENERATED ALWAYS AS (
        CASE WHEN listing_status = 'not_found' THEN 'pending_verification' ELSE 'not_missing' END
    ) STORED,
    UNIQUE (source_key, identity_token),
    UNIQUE (source_key, original_listing_url),
    UNIQUE (id, source_key),
    CHECK (first_discovered_at <= last_checked_at),
    CHECK (last_seen_at IS NULL OR
           (first_discovered_at <= last_seen_at AND last_seen_at <= last_checked_at)),
    CHECK (listing_status <> 'not_found' OR availability_status = 'unknown'),
    CHECK ((description_ja IS NULL AND description_en IS NULL) OR
           (description_permission <> 'unknown' AND btrim(content_rights_basis) <> '' AND content_rights_basis IS NOT NULL)),
    CHECK (main_image_url IS NULL OR
           (image_permission <> 'unknown' AND btrim(content_rights_basis) <> '' AND content_rights_basis IS NOT NULL))
);

CREATE TABLE crawler.price_changes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid NOT NULL,
    source_key text NOT NULL,
    -- JSON price events predate database run IDs. Never fabricate a past run.
    crawl_run_id uuid,
    legacy_event_key text CHECK (legacy_event_key ~ '^[0-9a-f]{64}$'),
    -- Preserve the URL observed at detection, even if the listing later moves.
    original_listing_url text NOT NULL CHECK (original_listing_url ~ '^https?://[^[:space:]]+$'),
    old_price_jpy bigint NOT NULL CHECK (old_price_jpy >= 0),
    new_price_jpy bigint NOT NULL CHECK (new_price_jpy >= 0),
    detected_at timestamptz NOT NULL CHECK (isfinite(detected_at)),
    CHECK ((crawl_run_id IS NOT NULL AND legacy_event_key IS NULL) OR
           (crawl_run_id IS NULL AND legacy_event_key IS NOT NULL)),
    CHECK (old_price_jpy <> new_price_jpy),
    FOREIGN KEY (property_id, source_key) REFERENCES crawler.properties(id, source_key),
    FOREIGN KEY (crawl_run_id, source_key) REFERENCES crawler.crawl_runs(id, source_key),
    UNIQUE (property_id, crawl_run_id),
    UNIQUE (property_id, legacy_event_key)
);

CREATE TABLE crawler.status_changes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid NOT NULL,
    source_key text NOT NULL,
    crawl_run_id uuid NOT NULL,
    old_listing_status text NOT NULL CHECK (old_listing_status IN ('active', 'not_found', 'withdrawn', 'sold')),
    new_listing_status text NOT NULL CHECK (new_listing_status IN ('active', 'not_found', 'withdrawn', 'sold')),
    old_availability_status text NOT NULL
        CHECK (old_availability_status IN ('active', 'under_negotiation', 'viewings_closed', 'sold', 'withdrawn', 'unknown')),
    new_availability_status text NOT NULL
        CHECK (new_availability_status IN ('active', 'under_negotiation', 'viewings_closed', 'sold', 'withdrawn', 'unknown')),
    old_source_status_ja text,
    new_source_status_ja text,
    detected_at timestamptz NOT NULL CHECK (isfinite(detected_at)),
    CHECK (ROW(old_listing_status, old_availability_status, old_source_status_ja)
        IS DISTINCT FROM ROW(new_listing_status, new_availability_status, new_source_status_ja)),
    FOREIGN KEY (property_id, source_key) REFERENCES crawler.properties(id, source_key),
    FOREIGN KEY (crawl_run_id, source_key) REFERENCES crawler.crawl_runs(id, source_key),
    UNIQUE (property_id, crawl_run_id)
);

-- Retained existing cache design; no provider connection or regeneration job.
CREATE TABLE crawler.translations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid NOT NULL REFERENCES crawler.properties(id),
    field_name text NOT NULL CHECK (field_name IN ('title_ja', 'description_ja')),
    source_text_sha256 text NOT NULL CHECK (source_text_sha256 ~ '^[0-9a-f]{64}$'),
    source_language text NOT NULL DEFAULT 'ja',
    target_language text NOT NULL DEFAULT 'en',
    provider text NOT NULL,
    model text NOT NULL,
    prompt_version text NOT NULL,
    translated_text text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
    UNIQUE (property_id, field_name, source_text_sha256, source_language, target_language, provider, model, prompt_version)
);

CREATE INDEX properties_municipality_availability_idx
    ON crawler.properties(municipality, listing_status, availability_status);
CREATE INDEX properties_customer_active_idx ON crawler.properties(municipality, area_en)
    WHERE listing_status = 'active' AND availability_status = 'active';
CREATE INDEX price_changes_property_time_idx ON crawler.price_changes(property_id, detected_at DESC);
CREATE INDEX status_changes_property_time_idx ON crawler.status_changes(property_id, detected_at DESC);
CREATE INDEX crawl_runs_source_time_idx ON crawler.crawl_runs(source_key, started_at DESC);

ALTER TABLE crawler.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawler.sources FORCE ROW LEVEL SECURITY;
ALTER TABLE crawler.crawl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawler.crawl_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE crawler.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawler.properties FORCE ROW LEVEL SECURITY;
ALTER TABLE crawler.price_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawler.price_changes FORCE ROW LEVEL SECURITY;
ALTER TABLE crawler.status_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawler.status_changes FORCE ROW LEVEL SECURITY;
ALTER TABLE crawler.translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawler.translations FORCE ROW LEVEL SECURITY;

CREATE POLICY sources_writer_read ON crawler.sources FOR SELECT TO crawler_writer USING (true);
CREATE POLICY sources_writer_watermark ON crawler.sources FOR UPDATE TO crawler_writer USING (true) WITH CHECK (true);
CREATE POLICY sources_customer_read ON crawler.sources FOR SELECT TO crawler_customer_reader USING (NOT synthetic);
CREATE POLICY runs_writer_read ON crawler.crawl_runs FOR SELECT TO crawler_writer USING (true);
CREATE POLICY runs_writer_insert ON crawler.crawl_runs FOR INSERT TO crawler_writer WITH CHECK (true);
CREATE POLICY runs_writer_update ON crawler.crawl_runs FOR UPDATE TO crawler_writer USING (true) WITH CHECK (true);
CREATE POLICY properties_writer_read ON crawler.properties FOR SELECT TO crawler_writer USING (true);
CREATE POLICY properties_writer_insert ON crawler.properties FOR INSERT TO crawler_writer WITH CHECK (true);
CREATE POLICY properties_writer_update ON crawler.properties FOR UPDATE TO crawler_writer USING (true) WITH CHECK (true);
CREATE POLICY properties_customer_read ON crawler.properties FOR SELECT TO crawler_customer_reader
    USING (crawler.customer_eligible(listing_status, availability_status, source_status_ja));
CREATE POLICY prices_writer_read ON crawler.price_changes FOR SELECT TO crawler_writer USING (true);
CREATE POLICY prices_writer_insert ON crawler.price_changes FOR INSERT TO crawler_writer WITH CHECK (true);
CREATE POLICY statuses_writer_read ON crawler.status_changes FOR SELECT TO crawler_writer USING (true);
CREATE POLICY statuses_writer_insert ON crawler.status_changes FOR INSERT TO crawler_writer WITH CHECK (true);
CREATE POLICY translations_writer_read ON crawler.translations FOR SELECT TO crawler_writer USING (true);
CREATE POLICY translations_writer_insert ON crawler.translations FOR INSERT TO crawler_writer WITH CHECK (true);
-- Cache entries are immutable; a changed original/model/prompt inserts a new key.

CREATE VIEW property_api.customer_properties
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
    p.main_image_url AS thumbnail_url,
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

REVOKE ALL ON ALL TABLES IN SCHEMA crawler, property_api FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA crawler TO crawler_writer;
GRANT SELECT ON crawler.sources TO crawler_writer;
GRANT UPDATE (last_successful_check_at, last_complete_check_at) ON crawler.sources TO crawler_writer;
GRANT SELECT, INSERT, UPDATE ON crawler.crawl_runs, crawler.properties TO crawler_writer;
GRANT SELECT, INSERT ON crawler.price_changes, crawler.status_changes, crawler.translations TO crawler_writer;
-- No DELETE/TRUNCATE grants. Missing/terminal records and histories remain internal.

GRANT USAGE ON SCHEMA property_api TO crawler_customer_reader;
GRANT SELECT ON property_api.customer_properties TO crawler_customer_reader;
GRANT EXECUTE ON FUNCTION crawler.customer_eligible(text, text, text) TO crawler_customer_reader;
GRANT SELECT (source_key, agency_name, synthetic) ON crawler.sources TO crawler_customer_reader;
GRANT SELECT (
    source_key, asking_price_jpy, municipality, area, area_en, region_ja, region_en,
    unmapped_locations, main_image_url, original_listing_url,
    listing_status, availability_status, source_status_ja, last_checked_at
) ON crawler.properties TO crawler_customer_reader;
-- Intentional: reader gets NO USAGE on crawler. An invoker view can use bound
-- relations/functions without exposing their schema for direct name lookup.
-- Raw labels are used internally by the view/policy, never projected to customers.
-- No role memberships or anon/authenticated grants: an eventual server API must
-- verify the session + authoritative subscription before using the reader role.
COMMIT;
