# Joetsu implementation and website handoff

Prepared 28 October 2026. The original investigation and migration proposal below are historical.
The user subsequently confirmed migration 004 is installed and verified in production:
Myoko 34 internal / 19 visible; Shinano 15 internal / 8 visible; Joetsu registered,
disabled and empty. Existing records/history, permissions and RLS were verified.
The website and crawler implementation are approved for the combined GitHub/Pages
release. Joetsu activation and first import remain outside this release; keep
Joetsu out of the active workflow matrix. No Joetsu crawler was run for website preparation.

## Source and operation

- Key: `joetsu_akiya_bank`; attribution: **Source: Joetsu City Akiya Bank**.
- Sale archive: https://joetsu-akiyabank.jp/archives/bukken_type/baibai/ . Public HTML only.
- Investigated baseline: 13 pages, 156 distinct listings; 73 unrestricted building-sale candidates, 82 explicitly contracted, one sale/rental conflict (`5-34`). These counts are test baselines, not runtime constants.
- IDs are published strings, including `13-05`. Redacted closed pages retain their heading ID; disagreement between heading and published number fails the whole snapshot. Two verified slug typos (`4-23` → published `14-23`, `6-6` → published `16-6`) are handled by retaining the published ID and recording a private warning; URL numbers never determine the area. Duplicate published IDs across different URLs fail validation.
- Maximum 25 pages / 300 archive records. All intermediate pages require 12 cards; last page may have fewer. Every detail must succeed. Duplicate IDs/URLs, changed pagination, unrecognized statuses, missing components, price conflicts and source drops over 25% abort before database apply. A final first-page comparison detects common inventory movement; the source supplies no atomic snapshot or independent total, so concurrent changes cannot be ruled out completely.
- Each run fetches robots.txt, then sequential HTML requests at least one second apart (or slower per robots). No API bypasses, redirects, photograph/PDF requests or paid translation.
- Existing per-source advisory lock, transaction, source-row lock, checkpoint, idempotency, price/status history and failed-run reporting are reused. Unknown/partial snapshots never commit property changes. A valid complete absence becomes `not_found`, not sold. Other source keys are untouched.
- The shared workflow still runs **Myoko and Shinano only**, daily at `17 21 * * *` (06:17 JST), plus manual dispatch. The proposed three-source matrix is commented. No new secrets/services/dependencies.

## Fields and eligibility

Existing fields carry municipality `Joetsu`, Japanese district `area`, English district `area_en`, region, Japanese address from the card, price, land area, **total floor area** (never substitute footprint), structure/layout/construction facts and original HTML URL. Construction precision is retained; missing optional facts stay null. Tsubo-only/multi-part uncertain sizes are not invented.

All published details, occupancy, agent contact, original paragraph prose and raw conditions are retained in private `source_facts`. Normalized description columns stay null because prose republication is unapproved. Raw original paragraphs are private, not a public English description.

Only explicit sale classification plus building evidence and unrestricted availability qualifies. `5-34` is unconditionally quarantined until a reviewed correction removes the Python block and database constraint. Occupied properties can qualify. Contracted pages remain internal; redaction retains previously observed prices/facts without generating false reductions. First-seen redacted facts remain null. Unknown status messages/classes stop the whole run; known transaction/building uncertainties remain internal and generate warnings.

The 28-area dictionary is based on the source's numbered district links; all observed IDs are covered, with 20 areas among the 73 candidates. No detailed address romanizations are guessed. Missing dictionary entries retain Japanese and set `unmapped_locations`. The combined 谷浜・桑取 district remains `Tanihama / Kuwadori` unless separately verified.

## Migration 004

`sql/migrations/004_joetsu_source.sql` follows 001, 002 and 003. It:

1. Adds nullable `crawler.properties.purchase_conditions_ja` and appends it to `property_api.customer_properties`; all previous view columns retain name/order/type.
2. Adds source-specific ID, `5-34` quarantine and private-media constraints, conditional on Joetsu only.
3. Extends the existing eligibility function to Joetsu sale buildings. The existing RLS policy invokes that same function/signature; legacy Myoko/Shinano conditions stay intact.
4. Registers Joetsu with `enabled=false` and photograph/description display permissions false.
5. Grants the existing reader SELECT on the condition-notice column only. No new schema USAGE, role membership, public/API exposure or privileged credentials.

Notices are derived only from source conditions, disclosed unregistered ancillary buildings and material occupancy. Contact-like text is kept privately and replaced with a review notice. Agent metadata/raw `source_facts` is never projected. Notices remain Japanese source text; do not invent an explanation of sensitive disclosures such as 心理的瑕疵.

Rerun: ADD COLUMN IF NOT EXISTS, named constraint guards, CREATE OR REPLACE and source ON CONFLICT DO NOTHING permit safe repeat application. Preserve reviewed checksums; use the existing private migration ledger when applying under a future approved procedure. A failure rolls back the transaction. Do not alter old migration files or rerun the initial schema on the live project.

Before applying: back up private schema, affected tables and view/function/policy definitions; confirm project/TLS verify-full; take source counts and Myoko/Shinano row/history/view fingerprints. Apply 004 in one transaction under the existing administrator, record its SHA-256 in the private ledger, and confirm pre-existing fingerprints and role grants remain unchanged. Source stays disabled. This document does not authorize execution.

Rollback before import: restore function/view definitions from 003 (including reader grants), then remove only 004's constraints/column after reviewing dependencies. After Joetsu import, prefer disabling its source and restoring the prior customer eligibility function; preserve internal rows/history and the notice column. Dropping the column or deleting source records after import loses data or violates history references. Never undo this by deleting Myoko/Shinano records.

## Website/API handoff — separate website task

- Preserve Cloudflare Access, subscription checks, Hyperdrive and the restricted read-only database connection.
- Add Joetsu to source validation and municipality filters. Return `municipality`, `location_ja`, `location_en`, `location_needs_review` and nullable `purchase_conditions_ja` from the same protected view.
- Use the existing **shared frontend formatter**, not a new combined database string: `Joetsu (Takada)`, `Joetsu (Naoetsu)`, `Joetsu (Nakago)`, etc. Japanese fallback must remain visible when flagged. There is no new cross-language formatter in the crawler.
- Preserve attribution and `original_pdf_url` (legacy name; Joetsu URLs are **HTML**, not PDFs). Label it “Original listing”, not “Download PDF”. Never show property numbers/internal IDs as customer labels.
- Show material conditions prominently on cards/details before enquiry. Render source Japanese as plain escaped text under a clear source-conditions label until reviewed translations are supplied. Do not show private agent metadata/prose or imply investment/commercial suitability.
- `thumbnail_url` is always **null for Joetsu**, independently of an accidental permission flag. Show the existing placeholder. Candidate URLs exist only in private `source_facts.thumbnail_candidate_url`; never return them from the API. Photograph permission and per-image content verification remain outstanding.
- Existing prices, sorting, Myoko/Shinano labels/images/eligibility must remain unchanged. No frontend/Pages Functions files were modified in this crawler task.

## Validation and deployment sequence

Offline Python tests use original synthetic HTML generators with the 13-page baseline. No city HTML/photos are committed. `sql/tests/004_joetsu_checks.sql` provides rollback-only synthetic RLS/role/reactivation tests for a **disposable local or approved test database**, not production. SQL parsing is not PostgreSQL execution; no local PostgreSQL/Docker is installed in this environment, so runtime SQL/RLS checks remain pending.

1. Review code, migration and website handoff. Validate migration order/SQL/RLS against an approved disposable database.
2. Obtain approval; back up production and apply/verify 004, including effective reader/writer checks and unchanged Myoko/Shinano fingerprints. Keep Joetsu disabled.
3. Separately implement, test and approve the API/frontend conditions/municipality/placeholder changes, then deploy through the existing workflow.
4. Obtain first-import/activation approval; set the provisioned Joetsu source enabled and record the access decision, then uncomment the third matrix source in the existing workflow. No credential changes should be required.
5. Dispatch the existing workflow; verify per-source counts and logs, expected candidate exclusions/conditions, placeholders, protected API, source isolation and daily schedule. Fresh counts may differ from the investigation baseline.

## Local verification result

All **209 Python tests pass** (187 existing plus 22 Joetsu tests). Offline SQL validation parsed 86 prepared test statements and 23 PL/pgSQL test bodies; migration 004 also parses. Workflow YAML parses, keeps `fail-fast: false`, both existing sources and the original schedule. `git diff --check` is clean.

A separate offline projection of the prior audit facts through representative HTML produces **156 retained / 73 eligible / 82 sold / 1 unknown**, 20 eligible areas and zero public images. This is not an original-HTML replay or a new live full crawl. Expected warnings identify `5-34` and the two URL-number discrepancies. Production records and effective production privileges were not touched or re-tested.

Reviewed migration 004 SHA-256: `c540c85eb7c168da582322f648dbe84426b221c129ff0fe10ae98ad6ee01c0db`.
