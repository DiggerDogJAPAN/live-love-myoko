-- Approved portal-only geographic reduction, after migration 007.
-- No property/history changes; no new grants or public fields.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER POLICY portal_duplicate_review_gate ON crawler.properties USING (
    NOT portal_duplicate_review_pending AND (
        source_key NOT IN ('suumo','rakusumu') OR (
            municipality='Myoko' AND address ~ '^(〒?[0-9]{3}-[0-9]{4}[[:space:]]*)?(新潟県)?妙高市'
        ) OR (
            municipality='Shinano Town' AND address ~ '^(〒?[0-9]{3}-[0-9]{4}[[:space:]]*)?(長野県)?(上水内郡)?信濃町'
        )
    )
);
UPDATE crawler.sources SET crawl_config=crawl_config ||
    '{"municipalities":["Myoko","Shinano Town"],"scope_version":"2026-10-29-myoko-shinano","preserve_out_of_scope_history":true}'::jsonb
WHERE source_key IN ('suumo','rakusumu');
COMMIT;
