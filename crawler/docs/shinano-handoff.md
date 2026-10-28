# Shinano Town source — crawler implementation and website handoff

**Migration update:** Production migration 003 has now been approved, applied and
verified, with 34 Myoko records / 19 visible rows unchanged and no Shinano import.
See [production migration results](migration-003-results.md). Implementation-stage
“no migration applied” notes below are historical; deployment remains pending.

28 October 2026. **Local review only: no migration applied, database connection,
commit, push, workflow dispatch or deployment performed for this implementation.**
The canonical code is `LiveLove/crawler`; the original standalone checkout is unchanged.
Frontend, Pages Functions, static export, Directus, Access and Hyperdrive are unchanged.

## Crawler and inventory

Source `shinano_akiya_bank`; attribution **Source: Shinano Town Akiya Bank**.
Source website: https://shinanomachi-iju.jp/akiya/?property_type=used

All 187 Python crawler tests pass (175 existing plus 12 focused Shinano tests).
Migration 003 parses as 17 SQL statements; prepared read-only checks parse as
3 statements plus one procedural body. No database SQL was executed.

The bounded read-only HTML investigation found 15 sale-building records:
8 unrestricted, 5 negotiating and 2 contracted; all 15 have card thumbnail references.
Two listings are pensions. These are observation counts, not hardcoded expectations.
Index pagination/category counts, unique IDs, management numbers, detail categories,
prices and HTML completeness are validated before reconciliation. Every detail is required.
No PDFs, image assets, REST endpoints, authentication or anti-bot bypasses are used.

`status-progress` maps to active publication / under_negotiation / 交渉中.
`status-closed` maps to sold publication / sold availability / 成約済.
No badge maps to active / active. Unknown/conflicting status classes stop the source.
Rentals and land-only categories are rejected; pensions are `lodge`, apartments are
`apartment`, explicit mixed-use shops are `commercial`, other sale residences are `house`.
These labels do not assert licensing or permitted commercial use.
A complete removal becomes `not_found`, not sold; existing explicit terminal states stay intact.
An empty inventory or more than 25% disappearance needs review and applies no updates.

Each source has its own checkpoint, advisory lock, source-row lock, transaction,
run history, errors and idempotency keys. SQL reads/updates/history are source-scoped.
New Shinano bootstrap is allowed only for the explicitly provisioned source with
an empty inventory AND no prior checkpoint; Myoko's existing nonempty baseline rule remains.
The existing workflow adds a two-source matrix with fail-fast disabled; cron remains
`17 21 * * *` (06:17 JST). Existing three Actions secrets and restricted writer are reused.
No secrets/settings have been changed in GitHub.

## Proposed migration 003

Apply only after approval, against the already installed 001 + 002 schema.
Do not rerun either historical installation script.

| Field/change | Purpose |
|---|---|
| Existing `municipality` | `Myoko` or `Shinano Town`; no municipality constraint changes |
| Existing `area` / `area_en` | Original Japanese / verified English neighbourhood |
| Existing `region_ja` / `region_en` | Source's district tags, including overlapping districts |
| New nullable `transaction_type` | `sale` or `rent`; no Myoko backfill |
| New nullable `construction_details` | Original construction text; normalized date remains optional |
| New nullable private `source_facts` JSONB | Allowlisted original factual labels/values; excludes descriptions/remarks |
| Expanded `property_type` check | Adds `lodge` without rewriting existing types |
| Customer view appended columns | `municipality`, `property_type`, `transaction_type` |

Existing UUIDs, source IDs, Japanese data, prices, URLs, permissions, histories and
observation timestamps are not updated by the migration. There is no property-row
UPDATE/DELETE, table recreation or destructive data migration. Multiple-parcel areas
without an explicit unambiguous total remain null; their original text is in private
`source_facts`. No total, year, address or reading is invented.

The source-aware eligibility function preserves the existing Myoko predicate.
Shinano additionally requires sale classification and a recognized building type.
Both the customer view and its base-table RLS policy use this predicate. The view
keeps security-invoker/security-barrier options, its existing columns/order and ACL.
`original_pdf_url` is a legacy alias for `original_listing_url`; it now may hold HTML.
Only two extra input-column SELECT grants and EXECUTE on the immutable invoker
predicate are added to the restricted reader. No private-schema USAGE, writes,
privileged source facts, internal IDs, raw statuses or credentials are exposed.

SQL validation here is syntax/contract validation only. PostgreSQL execution and
runtime RLS for migration 003 remain unverified. `sql/tests/003_shinano_checks.sql`
is a prepared read-only post-approval check, not an executed test.

## Website team's required API and display changes (not implemented here)

1. Select appended municipality/type/transaction columns through the existing protected view.
   Remove source-name-based Myoko municipality inference. Preserve Access and the dedicated reader.
2. Extend the source-specific thumbnail allowlist: Shinano uses HTTPS host
   `shinanomachi-iju.jp`, path `/shinanomachi/wordpress/wp-content/uploads/`,
   JPEG/PNG/WebP files. Myoko's existing source/host mapping remains intact.
   View `thumbnail_url` is permission-gated; show the original URL directly,
   retain missing/failed-image placeholders, and never rehost/download media.
   User explicitly confirmed Shinano photo use AND direct hotlink permission.
3. Use ONE website formatter for cards, headings, filters, alt labels and enquiries:
   `Municipality (Neighbourhood)`. Shorten `Shinano Town` to `Shinano` and retain
   `Myoko`. Prefer verified `location_en`; unknown readings use `location_ja`
   and `location_needs_review=true`. Missing/duplicate neighbourhood -> municipality only.
   The crawler does not generate this combined label or change database originals.
4. Municipality filters: Myoko / Shinano. Location options and matching must use
   the same combined label, for example `Myoko (Taguchi)` / `Shinano (Nojiri)`.
   Preserve Japanese keyword search, price filters, sorting, attribution and links.
5. Map `lodge` to Pension/Lodge rather than House. Respect explicit building type;
   do not imply that a former pension is approved for commercial operation.
6. Shinano notice: “Enquiries and viewings are subject to the original programme’s
   eligibility and registration requirements. Investment or commercial use is not assured.”
   Original conditions: https://www.town.shinano.lg.jp/docs/369.html

Verified readings: 野尻 Nojiri, 柏原 Kashiwabara, 古間 Furuma, 古海 Furumi,
富濃 Tomino, 穂波 Honami. Source-verified district 富士里 is Fujisato;
黒姫 is Kurohime, within Shinano Town. District tags do not override the actual
Japanese locality. Other readings remain Japanese and are flagged for review.
References: Japan Post https://www.post.japanpost.jp/cgi-zip/zipcode.php?city=1205830&cmp=1&pref=20
and town English guide https://www.town.shinano.lg.jp/docs/209.html .

## Approval and deployment dependencies

Review 003 and the unchanged-Myoko guarantees first. After approval, capture a
private baseline of existing Myoko columns/UUIDs/history and verify unchanged values
after the transaction (exclude the three newly added null columns when comparing).
Run prepared read-only SQL checks and verify real reader/writer login isolation.
No local PostgreSQL server/client is available here; none was installed or started.

Migration must precede new crawler code and website queries. Coordinate the website
API update BEFORE enabling the first Shinano import: the old API would receive
Shinano rows but lacks its municipality/image support. Do not publish this workflow
until that dependency is resolved. Then dispatch the existing workflow and compare
source-separated outcomes; counts may differ from this investigation's baseline.

Rollback: return workflow to Myoko-only and restrict customer view results to Myoko
while the website returns to its old contract. Retain new nullable columns, widened
type check, Shinano rows and history. Dropping them after ingestion would lose data
and is not a safe routine rollback. A failed migration rolls back its whole transaction.
