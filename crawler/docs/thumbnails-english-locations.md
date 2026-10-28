# Property thumbnails and English locations

## Deployment update — 28 October 2026

The Finder source/tests and freshly verified tracked static export were committed and pushed to Love Live Myoko `main`: **`0257577e8705682486f6d8762673ac6c8c5e8662`**. The existing GitHub → Cloudflare Pages workflow successfully published production deployment **`1577047d-f722-4077-9166-1fcb29a9214a`**. The website working tree is clean and local/remote `main` match. No Access, Hyperdrive, database, static-export or deployment configuration was changed.

Post-deployment authenticated HTTP verification returned **20 eligible properties / 20 permitted thumbnail URLs / 20 English neighbourhoods**, preserving Japanese references and original listing links. All 20 source image endpoints returned HTTP 200 with image content types. The hosted Finder JavaScript bundle exactly matches the reviewed build. Rendering the actual card component with the hosted API payload produced 20 image-bearing card HTML outputs; missing/failed-image placeholder logic, all 16 English-area filters and both price sort directions passed. Anonymous and forged-session requests were blocked at Access (302); the direct Pages deployment API also denied unauthenticated access (401).

TypeScript, targeted Finder lint, all 8 focused tests, the 41-page production build and Pages Function compilation passed. The owner explicitly approved deploying this focused change while leaving 17 pre-existing lint errors in unrelated pages/galleries (plus generated Wrangler lint noise) untouched. Exact staged-file scans found no private configuration values, credentials, generated Wrangler files or unrelated crawler files. Changes to other generated pages were only build-ID/Finder-chunk references; CMS media files were unchanged.

**Remaining verification limit:** no browser was connected, so a signed-in browser visual/interaction check remains outstanding. HTML rendering was tested with the live payload; this is not a visual browser test. The implementation-stage “not deployed” notes below describe the earlier state and are superseded by this deployment update.

Implemented **28 October 2026 (Japan time)** following the user's express confirmation of permission to display Myoko Akiya Bank photographs. Permission covers display through original source URLs; no copying, rehosting or PDF extraction is implemented.

## Live database result

Upgrade `sql/migrations/002_thumbnails_english_locations.sql` and its shared-dictionary backfill were applied atomically through `tools/migrate_thumbnails_locations.py`, using the existing project-reference checks and TLS `verify-full` connection.

- **34 internal properties / 20 eligible customer rows**, unchanged eligibility.
- **All 20 eligible rows have the expected source thumbnail URL and a verified English neighbourhood name.** Each image remains associated with the same original listing/PDF URL; attribution remains **Source: Myoko Akiya Bank**.
- **25 records' derived display metadata updated**. **28 of 34** records now have verified English neighbourhoods; six unresolved names remain Japanese and flagged: 大鹿, 田町, 藤塚新田, 西野谷, 除戸, 高柳. These six are outside the current eligible set. No additional readings were guessed.
- Japanese originals, prices, statuses, source IDs/UUIDs, original URLs, thumbnail URLs, first discovery, last check and last successfully seen times were compared before/after and preserved exactly. Only `area_en`, `title_en` and `unmapped_locations` changed on property rows.
- Source permission metadata records the user's photograph-display confirmation separately. Price/status history was not fabricated or modified.

The customer view retains the same column names/types, `security_invoker` / `security_barrier` options, source/availability predicates and existing ACL. It now exposes `thumbnail_url` only when `image_permission = 'permitted'`; other cases return null. The restricted reader gained only column-level **SELECT(image_permission)**, required to evaluate that invoker expression. It received no writes, private-schema USAGE, broad SELECT or elevated role attributes/memberships. Anonymous/authenticated access remains denied. The schemas remain outside the public Data API.

SQL SHA-256: `7b4eb7a6e2441a1ff196a9d838db944b5a901357c6a5af5f01cb20025c27dac1`. The private pre-migration row/source/view backup and committed receipt are under Git-ignored `data/`; receipt: `data/upgrade-002-result.json`. The original installed `001_proposed_schema.sql` was not rewritten or rerun.

## Crawler and synchronization

`locations.py` contains the reviewed dictionary and shared `location_display_values` / `reviewed_location` functions. Exact matches use ASCII Hepburn names; unknown or ambiguous text gets no invented English value. The originals stay intact and unresolved names persist in `unmapped_locations`. Municipality/source scoping prevents the backfill from rewriting other agencies' records.

The existing Myoko card parser already uses this dictionary. Future crawls therefore populate the same English names automatically, associate `.pic img[src]` with its own card's internal identity, and leave missing images null. Generic filenames are not used to infer property identity. No PDF, gallery, image downloader or storage service was added.

Archived JSON sync and customer projection use the same dictionary in memory. Existing saved JSON remains unchanged, including its original observation times and Japanese values. Sync now permits **only the three derived location fields** to be refreshed at the same observation timestamp; conflicting price/status/source facts at one timestamp remain rejected. This avoids inventing a fresh sighting merely to update a dictionary.

The ordinary sync command still works:

```sh
PYTHONPATH=src .venv/bin/python -m myoko_property_crawler sync-db \
  --state data/myoko-akiya-state.json
```

Synchronizing the existing archived snapshot after backfill made zero property/event changes and recorded its newly normalized snapshot identity once. A repeat then returned `already_applied=true`, adding zero records/events/runs and preserving all UUIDs. There are now two applied snapshot runs, not duplicate properties. Source observation watermarks remain unchanged.

Dictionary reading references reviewed in the preceding investigation: [Myoko City address readings](https://www.city.myoko.niigata.jp/docs/801.html) and [Japan Post's Myoko directory](https://www.post.japanpost.jp/cgi-zip/zipcode.php?city=1152170&cmp=1&pref=15). Notably, 美守 is **Hidanomori**, not a guessed kanji transliteration.

## Finder changes — local, not deployed

In the existing `LiveLove` website checkout:

- `server/property-finder/database.ts` selects the already approved `thumbnail_url` and location-review flag. Its explicit response mapping returns a thumbnail only for the approved Myoko source, HTTPS city host and expected image-file paths; malformed/unknown source URLs remain placeholders. Japanese neighbourhoods are retained separately as `areaJa`.
- `PropertyFinderCard.tsx` displays that source URL directly with `unoptimized`, preserving static export and avoiding any Next.js image proxy/copy. Missing or failed URLs show the existing placeholder. A different source URL can render again after a previous failure. Japanese reference text appears alongside English where available.
- The shared model/search retain Japanese keyword matching, while the existing card titles and area filters use English display values. Unknown locations continue to display Japanese and carry a review flag.

Cloudflare Access authorization, private API cache headers, Hyperdrive/verified origin TLS, the dedicated reader login, `next.config.ts`, Wrangler configuration and deployment workflow were not changed. No service, bucket, credentials or gallery was created. No photographs/PDFs were downloaded by this implementation or its tests.

**The database update is live. The API/card code is uncommitted local work and has not been deployed or pushed.** The currently deployed API still omits thumbnails until the normal website deployment includes these code changes. Its existing English-location query can consume the backfilled names without a schema-contract change.

## Verification

- **171 Python tests pass**, including eight focused name/extraction/permission/upgrade tests; all prior crawler tests remain passing.
- **8 Finder API tests pass**, including existing Access/TLS checks plus thumbnail allowlisting, missing/failed-image fallback, Japanese references, English filters and unknown-location review flags.
- Website TypeScript checking and targeted ESLint passed. No full website build was run because the existing build downloads unrelated CMS assets; no deployment was needed for database verification.
- Actual PostgreSQL tests checked all 20 source thumbnail/location pairs through the restricted reader, eligibility preservation, missing permission masking in a rolled-back savepoint, anonymous/authenticated denial and no private-schema USAGE. Post-commit verification confirmed **34/20**, matching normalized facts, no duplicate properties/events and stable UUIDs after repeat sync.
- The raw local inventory SHA-256 remains `6be170225ed596d471b1833e0ed6b01a5165e0a64b8b549b7a9b200772ba7e22`.

Changed crawler files: `locations.py`, `database.py`, `customer.py`, the Myoko adapter's rights note, `tools/verify_database.py`, the new atomic upgrade runner/SQL, focused tests and documentation. Website changes are limited to the Finder database mapper, card, model, search and tests. Directus, other website features and original media assets are untouched.

Remaining work: deploy the reviewed website code through the existing workflow when authorized, and review the six currently unmapped neighbourhood readings before adding them. Browser-level image rendering remains to be checked after that deployment; server-side tests intentionally do not fetch source photographs.
