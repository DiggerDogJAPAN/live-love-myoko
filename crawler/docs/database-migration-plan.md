# Proposed migration and rollback plan

**Phase 5 status:** the user authorized permanent installation and real import; both are complete. [Current receipt, sync command and essential checks](phase5-database.md) supersede the historical approval gates below. Do not rerun the initial schema/rehearsal. Future changes must use explicit upgrade migrations and preserve the imported records.

Current Phase 4B-3 procedure: use the [reviewed rollback rehearsal plan](phase4b3-security-review.md) before approving persistent installation. This combines the proposal and remote synthetic checks under one BEGIN/ROLLBACK and accounts for PostgreSQL 17 creator ADMIN membership without default SET rights. Rehearsal execution itself requires approval; none has run. The standalone schema still commits and is a separate approval step. Earlier phase-specific instructions below are historical where superseded by that report.

No migration has been applied. These are review steps for a later authorized phase, not instructions to connect to a database now.

Phase 4B-2 subsequently authorized only read-only Supabase connectivity. The verified Session Pooler inventory and separate remote validation/approval sequence are recorded in [the readiness report](phase4b2-supabase-readiness.md). The existing local bootstrap/order below remains local-only; no Supabase migration is approved or applied.

## 1. Validate in a disposable local environment

Phase 4B-1 repeated discovery and found no PostgreSQL/container runtime. Execution remains stopped; see [the current report](phase4b1-validation.md). `sql/validation-order.json` now pins the order and hashes: local-only `000_test_roles.sql`, the schema proposal, then contract and hardening checks. The manifest is validated as data, never automatically executed.

1. Review `001_proposed_schema.sql`, which creates two schemas and two NOLOGIN roles. It is a fresh-install definition, not idempotent and not an upgrade from an already-applied older proposal. Do not use `IF NOT EXISTS` to hide incompatible existing objects.
2. Confirm PostgreSQL 15+, UTF8, Supabase role prerequisites and permission to create the proposed roles. A plain local test database needs stand-in `anon`, `authenticated` and `service_role` roles; their creation is test-environment setup, not application access.
3. Use a new **disposable cluster**, not just another database on a shared cluster: application roles are cluster-wide. The guarded local bootstrap requires a `myoko_schema_test_<suffix>` database, PostgreSQL 15+/UTF8, a local endpoint, an isolated superuser and no pre-existing application roles/schemas. It is not a production/Supabase migration. Apply only the reviewed file order with an explicit local target, `psql -X` and `ON_ERROR_STOP=1`; never rely on ambient remote connection settings. Both test scripts roll back their synthetic fixture writes. New hardening tests replace session identity as well as current role and cover reader/writer boundaries, restrictions, reactivation and integrity. Nothing has been executed in Phase 4B-1.
4. Add database integration tests for source locking, concurrent retries, failed/partial runs, temporal checks, legacy imports, status events and cache invalidation when the Phase 4B writer exists. Static AST tests cannot replace these.

## 2. Implement an importer separately

The current JSON runtime remains the source of truth throughout Phase 4A. A later importer should default to read-only planning, report proposed counts/conflicts, use a separate database writer identity, and require the reviewed migration to exist before writing.

| Current JSON data | Proposed import handling |
| --- | --- |
| Repeated source agency/website fields | Normalize to one consistent `sources` row per source key; fail on contradictory attribution. Record reviewed source permissions/configuration without putting API credentials into JSONB. |
| Source ID / canonical URL | Resolve existing `(source_key, identity_token)` first; allocate a UUID only on first insertion. Do not regenerate UUIDs on retries. Preserve source URL collision checks. |
| Current factual/status/location fields | Preserve values/nulls exactly; no PDF extraction, geocoding, translation or availability guessing. Current enum spelling is `viewings_closed`. |
| First discovery and last check | Copy the known timestamps; never replace discovery with migration time. |
| Last successful sighting | For this current engine, non-missing observed rows can use their known last check. For historical `not_found` rows where the last sighting cannot be proved, use null and document the backfill gap. Do not use import time as a sighting. |
| Missing verification | Derived from publication status: `not_found` becomes pending verification. Do not infer sold/withdrawn. |
| `source_checked_at` | Map to last successful applied source check. Last complete check is unknown unless supported by retained run evidence; leave null rather than guess completeness. |
| Existing price changes | Resolve the property by source identity, preserve prices/detection time/original URL, and compute a deterministic legacy key from these original fields. Leave unknown database run reference null; do not invent old acquisitions. |
| Status change history | JSON contains current statuses and summary counts, not a complete historical event stream. Import the current state; do not invent earlier transitions. Future database observations create new events. |
| English text / translations | Preserve current strings. Do not invent provider/model/prompt provenance for old translations; cache only entries with actual provenance. |

The current saved Myoko snapshot should map to **34 internal rows and the same 20 eligible rows**. Compare the view's common display fields with the customer export; raw Japanese source labels are intentionally omitted by the database view. Keep ID/URL mappings internal. Phase 4B-1 updated Python normalization/model validation for `飯綱町` / `Iizuna Town` alongside the existing municipalities. Additional towns still need an explicit Python configuration review, while no database town-constraint migration is needed.

Import transactions must be bounded and retry-safe, with reconciliation blocked during the cutover. Keep immutable copies and hashes of the input JSON and the proposed UUID mapping for audit/rollback. Do not import fictional fixture properties into production sources.

## 3. Future daily database reconciliation

1. Assign an acquisition key once and preserve it across retries. Check for an already-finished matching source/run and return its existing result. Do not use a content hash alone as the run identity.
2. Fetch/validate using the current source code. Log failed runs separately; do not change property observations or successful source watermarks on failure.
3. In an apply transaction, lock the source row, recheck run identity and chronological watermark, validate/deduplicate the whole batch, then upsert source listings while preserving UUID and discovery date.
4. Update `last_seen_at` only for actually observed listings. Insert price/status events only for actual transitions and use unique property/run keys. Never convert unknown price to zero.
5. Only a validated complete snapshot may infer absence. The current large-drop safeguard produces a partial snapshot; partial/failed runs must not mark absent records missing or advance the last-complete watermark. Explicit observed terminal labels may still be recorded in a valid partial observation.
6. Finalize run counts/warnings/summary, source watermarks and property/history updates atomically. A rollback must leave the old property state intact. Log an apply failure in a separate failed-run transaction if needed; do not leave a complete status after an aborted apply.

These are writer responsibilities for Phase 4B. The schema stores the evidence and enforces identities/status constraints but does not independently know whether the city's HTML is complete.

## 4. Customer cutover

Deploy no customer access until a server endpoint verifies both the session and authoritative subscription entitlement. Provision separate reader/writer principals without BYPASSRLS; do not put a service-role secret into the browser or grant database access to all signed-in users. Query only the restricted view from the customer endpoint.

Validate 34/20 against the saved snapshot first, then independently validate denial paths, reactivation, expiry/cancellation, cached responses and logs. Existing Cloudflare Pages static output must not contain paid inventory or database credentials. Entitlement persistence, webhook authenticity/idempotency and private cache policy remain design decisions; no Stripe/GitHub Actions/deployment work occurs here.

## 5. Rollback

The bootstrap/schema files contain their own COMMIT. A later test ROLLBACK does **not** undo those commits; wrapping all files in `psql --single-transaction` does not neutralize embedded commits. Failure after an earlier file commits may leave roles/schemas in the isolated test cluster. Dropping only a test database does not remove cluster-wide roles. Keep an applied migration's reviewed hash unchanged and create subsequent versioned migrations rather than editing it in place.

- **Before the DDL transaction commits:** any error or explicit ROLLBACK must undo schema/role changes. Test this on the disposable database first.
- **After a future commit but before customer cutover:** stop database writes and leave customer grants disabled; continue using preserved JSON locally. Preserve partial import data and its manifest for diagnosis rather than dropping anything automatically.
- **After a future customer cutover:** disable the API's customer reader membership/access first and invalidate paid-data caches. Stop the database writer, retain database rows/events, and restore a previously verified data source through the server's authorization gate. Do not publicly upload the old JSON as a fallback.
- Restore the cutover database backup or reverse a separately reviewed versioned migration where necessary. Never reuse a destructive rollback that drops populated schemas as routine recovery. Source/internal/history rows must not be deleted merely because a property is unavailable.
- Dropping/truncating populated tables, removing historical columns, lossy type conversions and rewriting source/UUID mappings cannot be reversed without a suitable data backup. An older JSON snapshot may lack newer database-only price/status history. Assess those losses explicitly before any future destructive change.
- If abandoning an empty test installation, review its object/role dependencies before manual cleanup. Do not change unrelated schemas, application tables, Directus or the Love Live Myoko repository. No cleanup script is executed by this project.
