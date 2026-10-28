# Iizuna production handoff — 29 October 2026

Migration 006 was backed up, checksum-tracked and applied to the existing Supabase project. The restricted production writer then imported both feeds in one source-isolated transaction.

| Result | Count |
| --- | ---: |
| Municipal house-sale cards | 10 |
| Rakuen records (two pages) | 64 |
| Rakuen house sales / land / rentals | 13 / 48 / 3 |
| Duplicate house appearances removed | 10 |
| Imported / customer-eligible Iizuna properties | 13 / 13 |
| Permitted municipal thumbnails / placeholders | 10 / 3 |
| Existing Myoko / Shinano / Joetsu internal records | 34 / 15 / 156 |
| Existing Myoko / Shinano / Joetsu visible records | 19 / 8 / 73 |
| Total internal / visible | 218 / 113 |

The pre-existing 205 property records and 100 customer rows were compared before/after migration and import and remained unchanged. No synthetic records were imported. Existing reader/writer grants are preserved.

## Website contract

- Source identifier: `iizuna_akiya_bank`; structured municipality: `Iizuna Town`. Display the short form `Iizuna (Kurai)` using the website's shared location formatter.
- Existing English neighbourhood fields are populated for all 13 records. Current names: Fukoji, Imogawa, Kawakami, Kodama, Kosaka, Kurai, Sakaguchi and Toyono. Japanese originals and disclosures remain private/preserved; unknown readings retain Japanese and a review flag.
- No new public columns are required. The restricted `property_api.customer_properties` view exposes the existing `thumbnail_url`, neighbourhood/location, municipality, source agency, attribution, condition notice and original listing fields.
- Internal `main_image_url` supplies public `thumbnail_url`. Approved municipal format: `https://www.town.iizuna.nagano.jp/fs/.../filename.jpg` (also vetted JPEG/PNG/WebP extensions). Allow only HTTPS, the exact host and `/fs/` path, without credentials, custom ports, query strings or fragments. The crawler and SQL enforce canonical municipal listing provenance and reviewed card-image identity. Never broadly allow arbitrary image hosts.
- Municipal attribution: **Source: Iizuna Town Akiya Bank**. Rakuen-only attribution: **Source: Rakuen Shinshu Akiya Bank (Iizuna)**. Preserve the original canonical source link. Legacy `original_pdf_url` contains an HTML listing URL here, not a PDF.
- Rakuen-only images remain null. Keep the existing missing/failed-image placeholder. The user confirmed municipal photo display and direct hotlinking permission on 29 October; factual permission was confirmed previously. No image bodies or PDFs were downloaded/rehosted. All ten municipal primary references returned HTTP 200 with image/jpeg on HEAD requests using an external website Referer.
- Website Codex must add Iizuna to municipality filters and API municipality/source/image allowlists, retaining restricted reader access, Access and Hyperdrive. The existing reader has SELECT on the restricted view and no private crawler-schema access. No reader grant change is needed.
- This release edits no website/API code, generated export or Cloudflare configuration. Frontend build/deployment belongs to website Codex.

## Safety and automation

Source-specific transactions, locks, checkpoints and history isolate Iizuna from the other municipalities. Both feeds and all required detail pages must validate before writes. The town is canonical for duplicates; registration identity plus conservative full-address/area matching prevents cross-feed duplicates. Rentals, land, unavailable/unknown status and conflicting facts cannot become customer-visible. Missing municipal records cannot reactivate from a stale Rakuen listing. The existing disappearance guard remains.

The existing workflow keeps `17 21 * * *` (06:17 JST) and independently runs all four sources daily. Manual dispatch can select just Iizuna, allowing repeat-import verification without touching other sources. Existing Actions writer/project-reference/CA secrets are reused; TLS stays verify-full. No new credentials or hosting services are needed.

Migration checksum: `a9ab2d63902bbcb2932e4baf7dcb16eb4de652a73c0160a786c387f282ac99f2`. Private backup: `data/backups/006-20261028T152242971773Z` (Git-ignored). The existing checksum ledger prevents accidental reapplication. Do not edit or blindly rerun the applied migration. A later rollback should disable Iizuna and restore the prior eligibility/view definitions while retaining property/history rows; deleting imported data loses history.

Validation: 231 Python crawler tests, static SQL parsing, production read-only migration checks, restricted writer import and reader privilege checks. The crawler activation commit and first GitHub Actions run are reported in the delivery message. Earlier local-review results in iizuna-integration.md are historical and superseded by this handoff.
