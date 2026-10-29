-- Operational hold requested 2026-10-29 after the initial portal import.
-- Historical hold, subsequently replaced by approved migration 008.
-- Reapply only as an intentional emergency hold; 007/008 remain checksum-valid.
-- Repeatable: no property/history updates or deletes, no changes to municipal sources.
BEGIN;
UPDATE crawler.sources SET enabled=false WHERE source_key IN ('suumo','rakusumu');
ALTER POLICY portal_duplicate_review_gate ON crawler.properties
    USING (NOT portal_duplicate_review_pending AND source_key NOT IN ('suumo','rakusumu'));
COMMIT;
-- Do not restore portal customer access or enable the jobs without review approval.
