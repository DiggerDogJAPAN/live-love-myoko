# Commercial portal activation — Myoko and Shinano only

Approved 29 October 2026 (Japan time). This supersedes the earlier broad geographic investigation and complete portal visibility hold. No website, Pages Function, image allowlist, Directus or Cloudflare Access configuration is changed by this crawler release.

| Portal | Myoko | Shinano | Added customer listings |
| --- | ---: | ---: | ---: |
| SUUMO (`suumo`) | 15 | 2 | 17 |
| Rakusumu (`rakusumu`) | 10 | 0 | 10 |
| Total | 25 | 2 | 27 |

The production restricted reader and authenticated hosted API return **140 listings**, comprising these 27 and the unchanged **113 municipal listings**. SUUMO Myoko includes 13 used-house and 2 new-house listings. All 27 permitted thumbnails returned HTTP 200 and an image MIME type on HEAD requests with an external Referer; no image bodies, galleries or PDFs were downloaded.

## Database and preservation

Migration 007 provisioned the portal sources and private duplicate-review metadata. It was followed by an operational full hold during the geographic review. Approved migration 008 narrows the existing restrictive reader RLS policy to verified Myoko/Shinano property addresses, while retaining all original eligibility and duplicate-hold rules. It adds no grants or public columns. Its checksum ledger and private schema/table backup follow the existing procedure. Migration 007 must not be edited or replayed over production; its recorded checksum is unchanged.

All **464 imported portal records** remain stored: SUUMO 261 and Rakusumu 203. The **433 Joetsu/Iizuna portal records** remain hidden, with their original observations, source IDs, prices and history preserved. The narrower crawler reconciles only the approved collection scope and carries archived records forward unchanged; reducing geographic coverage never marks them missing. The **218 municipal property records and four source configurations** remain unchanged. Price/status history is not merged or deleted.

`portal_scope.py` is the shared crawler/customer scope: `Myoko`, `Shinano Town`. Python customer exports reject other portal municipalities; production RLS independently enforces municipality plus anchored property address. RLS also requires the existing status/type eligibility and excludes pending duplicates. Customers cannot bypass this by source filters, direct listing URLs or SQL pagination. Private review metadata stays inaccessible to the reader.

Cross-source duplicate matching retains source-specific identities and URLs. It requires full address and both areas, or locality/price plus both areas. Similar prices/neighbourhoods alone never merge records. Municipal listings take priority, then SUUMO, then Rakusumu. Uncertain duplicate candidates remain private. The 27 count is the current conservative candidate projection, not a claim that missing municipal measurements permit perfect physical-property deduplication.

## Collection and daily operation

- SUUMO collects used/new house indices for Myoko and the shared Shinano/Iizuna county. Explicit Iizuna addresses are skipped; detail addresses must verify Shinano or Myoko. It never requests the robots-disallowed JJ010FJ001 endpoint or Joetsu city index. Land cards are excluded.
- Rakusumu collects new/used houses with exact Myoko JIS filter `area[]=15217` and the published `sort=NEW` setting retained through every page. It has no verified Shinano inventory. Previously unverified English-address listings from the broader search remain unimported.
- Robots are checked each run, with sequential HTML pacing and strict request bounds. Authentication/CAPTCHA/403/429 failures are not bypassed. All required pages/details must succeed before a source transaction commits.
- Existing source locks, transactions, checkpoints, history and idempotency remain. The single GitHub Actions workflow keeps `17 21 * * *` (06:17 JST), existing writer/project-reference/CA secrets and `fail-fast: false`. Manual dispatch can select one source, all sources or just `portals`.
- User confirmed automated collection, commercial display and direct thumbnail hotlink permissions for both portals on 29 October. SUUMO terms: https://cdn.p.recruit.co.jp/terms/suu-t-1003/index.html ; robots: https://suumo.jp/robots.txt . Rakusumu terms: https://www.rakusumu.com/page/kiyaku ; its robots file returned 404 and is rechecked each crawl. Rights scope remains source-specific; no galleries or media copies are made.

## Website handoff

No public API columns changed. Continue using `source_attribution`, structured municipality/location values, `thumbnail_url` and the legacy `original_pdf_url` (HTML listing links for both portals). Source attributions are **Source: SUUMO** and **Source: Rakusumu**. Original agent information and Japanese disclosures remain protected in `source_facts`; customer notices point back to the original listing conditions.

Website Codex must explicitly allow portal thumbnails before they render. Current API image validation returns placeholders for these new hosts; SQL already supplies permitted original URLs:

- SUUMO: exact host `img01.suumo.com`, path `/jj/resizeImage`, query keys `src`, `w`, `h`. The decoded source must be a property image under `gazo/bukken/.../{listing-id}/{listing-id}_....jpg`; verify identity against the `nc_...` listing URL. Retain the original URL and query.
- Rakusumu: exact host `www.rakusumu.com`, path `/images/{agency-id}/{agency-id}-{listing-id}/img_{agency-id}-{listing-id}_G_...jpg`, optional numeric `u` cache query. `_M_` floor-plan images are excluded. Verify against the original listing URL.

Use the existing 4:3 component and failed/missing-image placeholder; do not broadly permit arbitrary CDN hosts or rehost content. Current Myoko/Shinano municipality filters already represent the intended scope; portal Joetsu/Iizuna records must never be enabled through frontend filtering. The API's current 500-result safety ceiling is not approached by the 140-row approved scope.

## Authentication and verification

The existing local helper `python3 /private/tmp/livelove-access-login.py` uses the existing binary at `/private/tmp/livelove-cloudflared-cli/cloudflared`, runs `access login --quiet` against the protected Finder login URL and then `access token --app`. It captures command output and writes the short-lived assertion to the Git-ignored LiveLove `.dev.vars.access-token` with mode 0600. It opens the normal browser login if needed; no manual cookie copying, token output, new credentials or Access setting changes are required. This temporary helper is local and is not part of the deployed workflow.

The refreshed assertion was used automatically for hosted API checks. Authenticated requests return HTTP 200 with 140 rows and only approved portal municipalities; anonymous requests still redirect to Access sign-in. Direct and paginated restricted-reader checks cover every row and deny excluded portals and private metadata. Source-specific repeat-sync and the published workflow run are reported in the delivery message. All changes in this release are crawler/workflow files only.
