# Phase 3 — HTML-only Myoko live crawler

The user confirmed permission for this project on 27 October 2026 and requested live collection of HTML card facts. This supersedes Phase 2's fixture-only scope decision. No additional permission flag or API credentials are required for the authorized crawler.

## Local validation

A successful bounded live run on **27 October 2026 at 20:26 JST** read [robots.txt](https://www.city.myoko.niigata.jp/robots.txt) and the [housing index](https://www.city.myoko.niigata.jp/myoko-life/house/). It saved **34 sale records**:

| Region | Records |
| --- | ---: |
| Arai | 27 |
| Myoko Kogen | 4 |
| Myoko | 3 |

Twenty were active without a card restriction, twelve were under negotiation, and two had viewings closed. All remained published. These are counts at the observed time, not a guarantee of current availability. Twenty-one distinct neighbourhood names were unmapped and retained in Japanese for review. Customer export was checked for exact attribution and exclusion of internal ID fields; every PDF-only factual field was null. The follow-up availability filter now exports only the **20 eligible records** from that saved snapshot; all 34 internal records are retained. Verification uses local state only, without another live crawl.

The successful run made only the two permitted GET requests. Earlier bounded validation attempts discovered an ambiguous PDF reference on the No.354 card; no state was written by those failed attempts. The card had links for two different property numbers. A regression-tested rule now accepts multiple references only when exactly one filename explicitly matches the card's internal number. It never opens either PDF. Other ambiguities stop the run.

Internal state is `data/myoko-akiya-state.json`; customer output is `data/myoko-akiya-customer.json`. Both are Git-ignored. No raw source HTML, PDF bytes or photograph bytes were saved. This phase did not modify Love Live Myoko/Directus or connect a database, configure GitHub Actions, call a paid AI API, deploy or push.

## Commands

Run from the project root:

```sh
PYTHONPATH=src python3 -m myoko_property_crawler crawl-live --dry-run
PYTHONPATH=src python3 -m myoko_property_crawler crawl-live
PYTHONPATH=src python3 -m myoko_property_crawler export-customer \
  --output data/myoko-akiya-customer.json
PYTHONPATH=src python3 -m unittest discover -s tests -t . -v
```

The live command fetches the single source index; it does not traverse individual properties. A dry run still makes robots/index requests but does not create or change a state file. Export performs no network requests and is a separate explicit operation. Default state paths differ from fixture demos to keep fictional and real inventory separate.

For future daily execution, invoke one crawl and only run the export after a successful exit. Exit 0 can still report a partial snapshot, so the scheduler must retain/inspect `complete_snapshot` and `warnings` in the internal summary. Exit 2 means failure. No scheduler was installed. Use an identifying user agent with a real contact when available, preserve state between runs, monitor failures/unmapped places, and avoid repeated manual runs against the city.

## Safety and interpretation

- The client allows only the fixed HTTPS robots/index URLs; it rejects redirects and never fetches PDFs, images, scripts or external services. It checks robots every run, honours a bounded declared request interval, and stops on denied access or rate limits without retrying or bypassing controls.
- A complete parse requires the sale heading, all three region groups, valid card wrappers, identity/price/status rows, a rental boundary, a complete page ending and no detected pagination. Unknown or contradictory source data stops persistence. Empty complete inventories require verification and are rejected.
- A disappearance above 25% of previously active records downgrades the run to partial. Absence then changes nothing. A smaller absence in a successfully validated complete snapshot becomes `not_found`, never sold. A page can still be incorrectly published by its owner; internal missing status remains pending verification.
- `listing_status` describes publication; `availability_status` records active/negotiation/viewing restrictions/explicit terminal states. `source_status_ja` persists the Japanese source evidence. Customer eligibility is enforced in `customer.py`: both statuses must be active and the source label must be empty or a known unrestricted badge. Negotiation, viewing closure, terminal/missing states and unknown labels are excluded, while internal records remain intact. A later successful crawl confirming active status restores eligibility on the next export. Missing records preserve the old label as last-seen evidence but get unknown availability.
- The customer projection excludes internal numbers and IDs, even if an internal record title contains one. Source filenames inside PDF/thumbnail URLs are unchanged; present those as labelled resources rather than property-number text. Attribution is exactly **Source: Myoko Akiya Bank**.
- No place-name inference or API translation occurs. Review additions to `locations.py`; unknown Japanese values and their review flags persist. Only the six requested exact mappings are initially reviewed.

## Changes and tests

The Myoko adapter no longer reads or requires PDF projections. It accepts HTML directly; old local JSON manifests remain optional index wrappers. Original projection text fixtures were removed. Core records gained optional English neighbourhood, regional grouping, unmapped-name review flags, availability and Japanese source status. Old version-1 JSON still loads with conservative defaults. Prices and discovery timestamps remain compatible with existing reconciliation.

New `live.py` handles bounded requests, robots and large-drop protection. `locations.py` contains reviewed mappings. `customer.py` builds the allowlisted display payload. CLI commands, local writer locking, documentation and source-specific tests were updated. The proposed SQL was not executed or updated; future Supabase work must add the new fields in a reviewed migration.

**91 tests pass.** All original 36 general tests remain. In addition to HTML-only extraction and transport coverage, the follow-up tests cover every publication/availability combination, contradictory/unknown source labels, filtering in single-record and collection projections, reactivation, active-to-unavailable transitions, and offline export that leaves internal state unchanged. Existing extraction, prices, thumbnails and PDF links were not changed by the filtering follow-up.

Outstanding work is operational/product integration: review the unmapped neighbourhoods, decide retention/monitoring and eventually select daily scheduling and durable storage. No full website or database integration is included in this phase.
