# Phase 4A database architecture — proposal only

Historical design document. **Phase 5 installed this schema in the dedicated development project and imported the real saved inventory.** See [current implementation and operations](phase5-database.md) for counts, verification, repeatable sync and remaining website access work. Earlier statements here about no SQL execution describe Phase 4A only.

`sql/001_proposed_schema.sql` is a revised **fresh-install proposal**, not a migration already applied to a database. No Supabase connection, SQL execution, database service, crawl, billing integration or deployment occurred. PostgreSQL 15+ with UTF8 is the proposed target. The static parser uses PostgreSQL 17.7 grammar; runtime compatibility still needs a disposable database test.

## Tables and current model mapping

All base tables live in the private `crawler` schema. The database keeps one row per **source listing**, not one row per guessed physical building.

| Table | Purpose |
| --- | --- |
| `sources` | Stable source key, agency attribution, website, permission/review evidence, crawl configuration, last successful and last complete applied checks. |
| `properties` | Internal UUID, source-scoped listing ID/URL identity, current factual data, locations, image permissions, publication, availability, original Japanese label and observation timestamps. |
| `crawl_runs` | Running/complete/partial/failed acquisitions, per-source idempotency key, optional normalized snapshot hash, times, extracted/processed counts, warnings, errors and existing reconciliation summary. |
| `price_changes` | Adjacent known old/new JPY prices, source, property, acquisition and detection time, including the URL as observed at that time. Legacy events can be imported without inventing acquisition metadata. |
| `status_changes` | Old/new publication, availability and Japanese status evidence, source/property/run and detection time. Private audit history; never a customer feed. |
| `translations` | The retained translation cache keyed by original text hash, field, languages, provider, model and prompt version. No API client/job is added. |

`source_agency_name` and `source_website` from Python normalize into `sources.agency_name` and `sources.website`. All other current `Property` fields have corresponding property columns. The source row for `myoko_akiya_bank` must use agency name **Myoko Akiya Bank**; the view constructs exactly **Source: Myoko Akiya Bank**. Attribution for another agency uses its own stored name.

UUIDs, source listing numbers and identity tokens remain internal. The identity token follows existing Python semantics: `id:<source_property_id>` or fallback `url:<canonical_url>`, unique within its source. Source ID and URL uniqueness are source-scoped, so agencies may reuse an identifier or reference the same URL without colliding across sources. The database does not fetch URLs or require PDF extraction.

Asking prices are nullable nonnegative `bigint` JPY. Source areas use exact nullable `numeric`, rejecting nonfinite values; optional construction dates preserve year/month/day precision and validate real calendar dates. Exact address, land/building area, age, floor plan, parking, titles in English and descriptions remain nullable. Rights constraints preserve the current image/description permission rules. A future writer must also enforce Python bounds before binding very large numeric values.

## Geography

`municipality` is nullable nonblank text, not an enum or fixed town allowlist. `area`/`area_en` preserve Japanese neighbourhood and reviewed English name; `region_ja`/`region_en` preserve the source's grouping. `unmapped_locations` remains a private review list, with a customer-facing boolean.

| Place | Municipality value | Area example |
| --- | --- | --- |
| Myoko City | `Myoko` | Source neighbourhood such as `田口` / `Taguchi` |
| Joetsu City | `Joetsu` | Source neighbourhood |
| Shinano Town | `Shinano Town` | `黒姫` / `Kurohime` |
| Iizuna Town | `Iizuna Town` | Source neighbourhood |

Kurohime is an area of Shinano Town, not a separate municipality. New nearby towns require data/adapter work, not a database constraint migration. Phase 4B-1 adds `飯綱町` / `Iizuna Town` to the shared Python validation vocabulary and preserves the original Myoko, Joetsu and Shinano Town values. No property extraction/filtering or saved live data is changed. See the [current validation report](phase4b1-validation.md).

## Seen, checked and missing

`first_discovered_at` never moves after initial insertion. `last_checked_at` is the applied observation/check timestamp. `last_seen_at` advances only when a successful source observation actually contains the listing, including a valid partial run; a complete-snapshot absence must not advance it. Legacy JSON has no distinct sighting timestamp, so this new field is nullable rather than fabricated for historical missing rows. Timestamp ordering is constrained.

`listing_status` and `availability_status` use the current Python values, including `viewings_closed`. Negotiation and viewing closure do not imply sale or withdrawal. An absence in a verified complete snapshot changes an eligible internal publication to `not_found` and availability to `unknown`; generated `missing_verification_state` becomes `pending_verification`. Other publication states generate `not_missing`. Explicit sold/withdrawn evidence and later observed reactivation follow existing reconciliation. No disappearance deletes a row.

`sources.last_successful_check_at` corresponds to the JSON `source_checked_at` watermark for valid applied complete **or partial** snapshots. `last_complete_check_at` advances only for a validated complete run. Failed attempts update only their private run record. Repeated missing checks may advance `last_checked_at`, while last-seen time and original Japanese label remain historical evidence until reappearance.

## Price, status history and idempotency

Use a stable `(source_key, idempotency_key)` for retries of **one acquisition**. A new daily acquisition gets a new key even when its contents are identical. Snapshot hashes are integrity metadata, deliberately not unique: content may remain unchanged for days or return to an older price later.

Real price/status events have a unique `(property_id, crawl_run_id)` key. Composite foreign keys enforce the same source for each property/run/event. A future writer must reuse an existing finished run rather than process a retry again, lock the source row while applying a snapshot, reject old observations, and commit property updates, events, run completion and source watermarks together. Constraints do not independently prove source coverage or perform reconciliation: Phase 4B must preserve the existing parser/large-drop/partial-run checks.

Price events occur only when the previous and incoming prices are both known and different, matching `changes.py`. A null price is not zero. A later known price following an unknown observation is a new comparison baseline, not a claimed change across unknown data. Status history records changes in publication, availability or raw source evidence; the current JSON does not contain historical status events to backfill.

Existing JSON price events have no database run UUID. Their `crawl_run_id` may therefore be null only with a deterministic `legacy_event_key` hash of the original event fields; a second unique key prevents duplicate imports. Normal events instead require a real run reference and no legacy key. Preserve original detection time and URL. Do not manufacture historical started/finished times.

## Translation cache

Keep Japanese originals in `title_ja`/`description_ja` and current English values in their existing optional fields. Cache keys include the exact original text's SHA-256, field name, source/target languages, provider, model and prompt version. A changed original/model/prompt misses the old cache; an unchanged key is reused. Inserts are immutable to the writer role. Old cache entries can remain private; no regeneration, paid provider or translation call is configured. English should not become current merely because an unrelated old cache entry exists.

## Conservative cross-source deduplication

Keep each agency's row, prices, source rights and status independent. Similar address, location, area or asking price may nominate a candidate for later review but never auto-merge. Before linking listings, require stronger corroboration and human review; preserve both source identities and provenance. A future reviewed grouping table may link confirmed matches without deleting/rewriting the original rows. It is not introduced in this proposal. A source switching IDs or URL fallback identity needs explicit migration, as the current engine already requires.

## Customer access and subscriptions

`crawler.customer_eligible(...)` centrally requires publication **and** availability active, plus the existing fail-closed source-label rule. The private properties RLS SELECT policy and `property_api.customer_properties` view both call it. The view is `security_invoker=true` and `security_barrier=true`, with an explicit display field list. Missing, negotiating, viewing-closed, sold, withdrawn and ambiguous records remain private; successful reactivation can make the row visible again without recreating it.

The database view intentionally omits UUIDs, listing IDs, source keys, raw Japanese status labels, titles stored internally, crawl data, price history and permissions. It otherwise preserves the current display projection, price, thumbnail/PDF references and attribution. **The existing local Python export still includes `source_status_ja`; it is unchanged by this design phase.** Phase 4B must use the database projection/allowlist for its API, not blindly serve the legacy JSON shape. On the saved snapshot, the eligibility contract still selects the same 20 of 34 records.

The writer and customer reader are separate NOLOGIN/NOBYPASSRLS roles, with no memberships provisioned. Base tables have enabled and forced RLS. The writer gets no DELETE/TRUNCATE, cannot change source permissions/configuration, and cannot alter immutable event/cache rows. The customer reader gets only SELECT on the safe view plus the exact underlying column privileges required by an invoker view. It gets **no USAGE on the private schema**, so those internal names cannot be queried directly. Raw labels are bound inputs to the private policy, not customer output. Synthetic sources are denied by their source-row policy.

PostgreSQL documents that invoker views use the caller's grants and RLS policies and that callers do not need USAGE on the schemas of already-bound underlying relations. This arrangement must still be tested on the target server before release. [PostgreSQL CREATE VIEW](https://www.postgresql.org/docs/15/sql-createview.html).

**Recommendation: a server-side API over the restricted view**, not direct browser database access or a privileged SECURITY DEFINER RPC. No `anon`, `authenticated` or `service_role` access/membership is granted here, and neither custom schema is to be added to the Data API in Phase 4A. Supabase distinguishes object grants from row policies; both matter. [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

The existing static Next.js export on Cloudflare Pages cannot securely decide paid access in downloaded JavaScript. A future Pages Function/Worker (or another server backend) must validate the user session, then consult authoritative server-held Stripe entitlement state before using a separate least-privilege database reader identity. It must parameterize search inputs and expose only the safe response shape. Do not grant the reader role to every authenticated user; login is not proof of payment. A future crawler identity gets only the writer role. Neither identity is a service-role key sent to a browser. No Stripe connection, authentication system, entitlement table, API route or cache policy is installed by this proposal.

## Validation and next review

Files changed in Phase 4A:

- Updated `sql/001_proposed_schema.sql`; added `sql/README.md` and `sql/tests/001_contract_checks.sql`.
- Added `tools/__init__.py`, `tools/schema_checks.py`, `tools/validate_schema.py` and `tests/test_schema.py` for parsing/static validation.
- Added development-only `requirements-schema.txt` and updated `MANIFEST.in` to include the design tools in source distributions.
- Added this document, `docs/database-migration-plan.md` and `docs/database-access-review.md`; updated the root README and existing architecture document.
- No crawler runtime modules, saved JSON, existing tests, website files or Directus files were changed.

Install the optional **development-only** PostgreSQL parser with `python -m pip install -r requirements-schema.txt`. The crawler and original general tests have no added runtime dependencies. From the project root:

```sh
PYTHONPATH=src .venv/bin/python -m tools.validate_schema
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -t . -v
```

Phase 4B-1 validation parses **62 proposal statements**, **6 guarded local-setup statements**, **62 prepared SQL test statements** and **17 PL/pgSQL test bodies** across setup/tests, without execution. Twenty-five schema/plan tests inspect compatibility, privacy, role declarations, manifest integrity and eligibility across 384 status/label combinations. The small Python evaluator is **not PostgreSQL execution** and does not prove database regex/collation/privilege behaviour.

Current results: **122 tests pass** (97 runtime/regression + 25 static schema/plan tests), 34 saved internal records, 20 eligible records, unchanged state file. No PostgreSQL/container runtime was found. No service was installed or started. **SQL execution, catalog binding, target-version privileges, RLS enforcement and query plans remain unverified.** Prepared local tests await an appropriate isolated environment; they must not run against Supabase.

See [migration/rollback plan](database-migration-plan.md), [access review checklist](database-access-review.md) and [Phase 4B-1 report](phase4b1-validation.md). Before connecting Supabase, provide the isolated PostgreSQL environment and verify the schema/security behaviour, then review role provisioning, permissions, import/backfill rules, subscription authority and backend connection approach. Database writing and server authorization remain future work.
