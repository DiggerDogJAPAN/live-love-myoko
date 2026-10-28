# Iizuna Town integration

Production activation on 29 October 2026 supersedes the historical local-review notes below. See [the production handoff](iizuna-production-handoff.md). Website and generated `out/` changes are excluded from the crawler release.

## Historical initial acquisition

The live sources currently reported **10 municipal listings**, rather than the supplied 11-listing baseline, and **64 Rakuen records**, rather than approximately 65. Counts are discovered at runtime, not hardcoded.

| Initial result | Count |
| --- | ---: |
| Municipal sale-house listings | 10 |
| Rakuen records, across two pages (50 + 14) | 64 |
| Rakuen house sales | 13 |
| Rakuen land exclusions | 48 |
| Rakuen rental exclusions | 3 |
| Total feed appearances | 74 |
| House-sale appearances | 23 |
| Cross-feed duplicates removed | 10 |
| Unique eligible houses | **13** |
| Municipal canonical listings | 10 |
| Rakuen-only additions | 3 |
| Negotiating/closed/uncertain houses in this snapshot | 0 |
| Verified English neighbourhoods | 13 |
| Public images | 0 |

The complete local state/report are Git-ignored: `data/iizuna-initial-state.json`, `data/iizuna-initial-report.json`. The earlier secondary-only diagnostic is `data/iizuna-rakuen-preview.json`; it cannot be synced. No sample property information has been inserted into Supabase. The initial captured observations were reprocessed after reviewing source address-format variants; original Japanese addresses, prices and observation timestamps were retained.

The three additional Rakuen records are `/bukken/455397/` (Toyono, ¥12,800,000), `/bukken/456694/` (Fukoji, ¥8,900,000) and `/bukken/458837/` (Toyono, ¥6,000,000). The last publishes only the general locality: no street number was invented.

## Source rules and evidence

- Official sale index: https://www.town.iizuna.nagano.jp/ijuportal/live/sale/search/ . One current page, explicit count and ten `property-box` links. New pagination/coverage gaps fail validation.
- Official details: `/ijuportal/live/sale/{page-id}.html`; use published registration numbers, not page IDs. Header examples include `登録番号010/受付番号023`.
- Municipal robots: https://www.town.iizuna.nagano.jp/robots.txt returned 200, disallowing `/kana/` and `/mobile/`; inspected listing paths are allowed.
- Municipal copyright: https://www.town.iizuna.nagano.jp/docs/292.html prohibits secondary use without permission. **The user explicitly confirmed permission for automated factual collection and commercial factual display.** The adapter's permission flag records that decision. This does not establish photograph or protected-prose republication permission.
- Rakuen index: https://rakuen-akiya.jp/housesearch/area/?vender_jiscode%5B%5D=20590 . Pagination uses `pg=2` while retaining exactly municipality JIS code 20590. The unfiltered nationwide directory is never fetched.
- Rakuen robots: https://rakuen-akiya.jp/robots.txt returned 200; `/wp/wp-admin/` is disallowed, `/wp/wp-admin/admin-ajax.php` allowed. No path inspected here is disallowed.
- Rakuen footer reserves photographs/articles; privacy policy: https://rakuen-akiya.jp/privacypolicy/ . No blanket automated factual-access prohibition was identified in the inspected public pages; this is not an image/prose licence. No form, account, CAPTCHA, internal API or access restriction was bypassed.
- Both transports recheck robots and pace sequential HTML requests at least one second apart, or slower per robots. No photographs/PDFs are requested or rehosted. Unknown image permission means placeholders.

Municipal prices use `document.write(Number(1550).toLocaleString())`. The parser recognizes only this literal numeric grammar; it does not execute JavaScript. Missing/unknown expressions remain null, not zero. Zero is accepted only when explicitly published. Index/detail price conflicts abort acquisition.

## Identity and canonical selection

One existing-style source job, `iizuna_akiya_bank`, owns a combined inventory from two feeds. Both feeds must succeed before its independent transaction/checkpoint advances. A failure in either feed leaves Iizuna unchanged and cannot affect Myoko, Shinano or Joetsu. Per-feed totals and deduplication counts are retained in private provenance and crawl-run summaries.

`reg-010` is the stable cross-feed identity for municipal registration 010. Leading-zero variants normalize to three digits; exact Japanese registration text remains private. Missing registrations use `rakuen-{property-number}`. Address-only or price-only similarity never merges records. Fallback requires the same normalized full address with a house number and exact non-null land AND building areas; ambiguous matches stop the run.

Address comparison normalizes only source orthographic variants (numeric hyphens, postal prefixes, `字` sublot notation and 番地/号). Original Japanese addresses are never rewritten. Three apparent address conflicts were verified as formatting differences with matching registrations and exact areas.

Municipal listings win as canonical; secondary facts only supplement null fields, with provenance. A restriction in either feed wins over an active duplicate. Contradictory numbered addresses remain unknown and excluded. Previously known canonical identities/history survive a supplemental-to-municipal upgrade. A vanished municipal listing is held `not_found` (or retains an explicit terminal status); a stale secondary posting cannot reactivate it. Normal reappearance on the municipal feed can confirm availability again.

House sales only: exclude rentals, land, unsupported building evidence, negotiation, viewing closure, sold/withdrawn/missing and unknown statuses. Occupancy is separate. A complete snapshot's normal disappearance is `not_found`, never assumed sold. The existing >25% disappearance guard remains.

## Facts, permissions and frontend

Existing property columns cover price, Japanese address, municipality `Iizuna Town`, Japanese/English neighbourhood, land/total building areas, structure/layout/construction, parking and source conditions. No new columns are needed. Private `source_facts` retains both providers' original Japanese values, descriptions, registration strings and original URLs. Protected descriptions remain null in normalized/public description fields. Contact-like content in condition notices remains private and is replaced by a review notice.

Canonical attribution: **Source: Iizuna Town Akiya Bank**. Supplemental-only attribution: **Source: Rakuen Shinshu Akiya Bank (Iizuna)**, with its actual Rakuen original URL. Both origins have exact host/path checks. The legacy public column `original_pdf_url` contains HTML listing URLs; it is not a PDF download.

The verified place-name dictionary uses the town's own statistical kana list (https://www.town.iizuna.nagano.jp/fs/5/3/1/3/9/_/h28tokeishiryo.pdf) and official source location information. The shared frontend formatter produces **Iizuna (Kurai)**, **Iizuna (Fukoji)**, **Iizuna (Toyono)**, etc.; missing locality gives `Iizuna`, unknown readings retain Japanese and a review flag. No AI translations or guessed addresses.

The API and municipality filters now support Iizuna locally. No Iizuna image domain is enabled: Python export, proposed SQL view and API preserve placeholders. Myoko/Shinano/Joetsu image handling and eligibility remain unchanged. Existing Access, Hyperdrive, reader login, static-export and deployment settings are untouched.

## Proposed migration and release order

`sql/migrations/006_iizuna_source.sql` follows 005 and is **not applied**. It:

1. Registers the aggregate source disabled, recording the two feeds and factual permission scope.
2. Adds Iizuna-only ID/origin/completeness/private-media checks.
3. Extends the existing customer eligibility function to Iizuna sale houses only.
4. Keeps the invoker/barrier restricted view, all existing columns and the other sources' rules; adds source-aware attribution and explicit Iizuna image suppression.

No new role/schema grants, public private-table access, subscription bypass or service credentials. `sql/tests/006_iizuna_checks.sql` contains future read-only eligibility/security checks; static validation is not PostgreSQL execution. No new database/services were installed or started.

After review: back up affected production schema/tables, approve and apply 006 using the private checksum ledger, verify existing source rows/view/permissions unchanged, then approve Iizuna activation/import and the website release. The local workflow matrix proposes all four sources at the unchanged `17 21 * * *` schedule (06:17 JST). The live GitHub workflow remains unchanged until reviewed code is explicitly published. No new Actions secrets are needed.

If an approved migration transaction fails, roll it back. After a later real import, disable Iizuna and restore the previous customer function/view instead of deleting rows/history. Dropping the source without reviewing foreign keys or deleting imported rows loses history. Do not replay old migrations on production; record the reviewed 006 checksum once.

## Local commands

```sh
cd crawler
PYTHONPATH=src python -m myoko_property_crawler.iizuna_live --output data/iizuna-initial-state.json
PYTHONPATH=src python -m unittest discover -s tests -t . -q
PYTHONPATH=src python -m tools.validate_schema
```

Repeat local crawls load the saved state and preserve first-seen dates and price history. A secondary-only preview cannot overwrite a complete state or be synchronized to the database.

## Verification result

- **230 crawler tests** and **28 Finder tests** pass. TypeScript and lint on all changed website source/test files pass. Pages Functions compile locally with the existing nodejs_compat flag. No full website export or Directus operation was run.
- Offline SQL checks parse 89 prepared test statements and 24 PL/pgSQL bodies, plus migration 006. SQL execution/RLS runtime checks for 006 remain pending approval; no production migration was applied.
- The 13 actually captured local records pass the API projection and Iizuna municipality filter, with eight verified English neighbourhoods and zero public images. Local customer preview: `data/iizuna-customer-preview.json` (Git-ignored).
- Read-only production verification: Myoko 34 internal / 19 visible; Shinano 15 / 8; Joetsu 156 / 73. Total remains 205 internal / 100 visible; production Iizuna records: **0**.
- The actual GitHub schedule is unchanged. All Iizuna implementation/migration/workflow changes remain local and uncommitted for review.
