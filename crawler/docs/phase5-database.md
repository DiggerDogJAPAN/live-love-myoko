# Phase 5 — Working development database

Completed **27 October 2026 (Japan time)** in the dedicated **Myoko Property Finder** Supabase development project. The user authorized permanent installation and real-inventory import in this phase. Earlier proposal/rehearsal approval boundaries are historical; no further installation approval is pending.

## Installed objects and inventory

Applied `sql/001_proposed_schema.sql` permanently, in its explicit transaction, after confirming the configured project reference, PostgreSQL 17.11 actor and absence of conflicting application schemas/roles/public tables. TLS certificate-chain and hostname verification remained enabled (`verify-full`). No unrelated objects or Data API settings were changed.

| Object | Purpose |
| --- | --- |
| `crawler.sources` | Stable source metadata, attribution, rights notes and source-check watermarks. |
| `crawler.properties` | Current source listings, internal UUID/identity, Japanese facts, locations, prices, permissions, publication and availability. |
| `crawler.crawl_runs` | Atomic sync runs, canonical snapshot/idempotency keys, counts and safe failures. |
| `crawler.price_changes` | Imported historical price events and later detected changes. |
| `crawler.status_changes` | Later publication/availability/raw-status transitions. |
| `crawler.translations` | Reserved translation cache; no translation provider is connected. |
| `property_api.customer_properties` | Allowlisted, eligible-only customer projection; no internal IDs or raw status labels. |

Also installed: five lookup/history indexes plus key/uniqueness indexes, constraints/foreign keys, the eligibility helper, RLS enabled and forced on all six tables, and NOLOGIN/NOBYPASSRLS roles `crawler_writer` and `crawler_customer_reader`. No new passwords or application credentials were created.

Installation SHA-256: `eca82251807d8f04579162e25339006aab24afbe300c6325572d219d9e98dee8`. Local receipt: `data/phase5-installation.json` (Git-ignored). **Do not rerun the fresh-install SQL against this installed database.** The installer refuses existing application objects. Future schema changes require a separate upgrade migration; no DROP/recreate path was added.

Imported the saved local inventory only:

- **34 internal properties**, with stable UUIDs, original source IDs, Japanese facts, timestamps, locations, prices and resource URLs preserved.
- **20 eligible customer rows**; **12 under negotiation and 2 viewings closed** retained internally and excluded.
- Exact customer attribution: **Source: Myoko Akiya Bank**.
- Zero synthetic sources/listings. Existing local price history was empty, so no historical events were fabricated.
- Local JSON state/export were not changed. State SHA-256 remains `6be170225ed596d471b1833e0ed6b01a5165e0a64b8b549b7a9b200772ba7e22`.

## Future synchronization

From the project root:

```sh
PYTHONPATH=src .venv/bin/python -m myoko_property_crawler sync-db \
  --state data/myoko-akiya-state.json
```

The private `.env.supabase.local` connection is loaded as data, never sourced/evaluated in a shell. A different private file can be selected with `--env-file`. No URI belongs on the command line or in browser code. Database configuration was moved into the installed Python package and remains re-exported by the existing preflight tooling for compatibility. No additional third-party package was required beyond the existing Psycopg client.

The source-check watermark, record values and price history form a deterministic snapshot hash. `(source_key, idempotency_key)` ensures replay returns the existing outcome. Source-row locking serializes concurrent syncs. Existing `(source_key, identity_token)` rows keep their UUID/discovery time; changed IDs for a reused URL, stale snapshots and conflicting facts at one observation timestamp fail safely. Reruns of old already-applied snapshots never restore old facts.

Property updates, source watermarks, price/status history and successful run completion commit together. Failed applies roll back their property changes and, where the source/database is available, record a separate failed run with a sanitized summary. CLI exits nonzero on failure; raw driver messages/connection strings are suppressed. Replaying a failed acquisition can retry its same run key.

Local price events receive deterministic legacy keys, retain original detection times and are not duplicated on retries. New known-price changes generate a run-linked event unless the existing local price chain already describes that transition. Null prices stay null. Status history records real transitions observed by sync, never invented earlier transitions.

The input is the **reconciled state**, not a raw listing page. Sync never infers absence or deletes omitted rows. Explicit `not_found` input retains the previous known sighting or null for an unprovable legacy sighting. The input JSON does not retain independent completeness evidence, so imports are recorded as successful `partial` runs with `absence_inference=false`; `last_complete_check_at` is not fabricated. Current facts continue to use original source observation times, not import time. Source `enabled=false` remains unchanged: this phase enables neither live crawling nor scheduling.

The command currently supports real Myoko Akiya Bank inventory. Other source records in a shared local file are left alone; adding a new source sync profile is later adapter work. It rejects source/attribution conflicts and obvious synthetic fixtures. URLs are stored, never fetched.

## Essential checks completed

`tools.verify_database` checked the actual installed database using the real saved inventory:

```sh
PYTHONPATH=src .venv/bin/python -m tools.verify_database --repeat-sync
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -t . -q
```

Results:

- Six internal tables, safe view and RLS enabled/forced verified.
- Every imported property field matches the local normalized model; counts **34 / 20**.
- Restricted reader sees exactly the 20 eligible PDF URLs and allowed fields, with no internal IDs/raw status columns.
- Actual `anon` and `authenticated` role queries are denied against both `crawler.properties` and the customer view.
- A repeated sync added **0 properties, 0 runs and 0 events**, retaining the same 34 UUIDs. One successful applied sync run remains.
- An additional focused `--check-updates` check changed one existing property's price and negotiation status, verified exactly one price/status event and removal from the view, then verified active reappearance. **The entire check rolled back**, including both changes, history, runs and watermarks. No fictional listing was inserted or persistent price/status fact changed.
- **163 Python tests pass**: all 159 earlier tests plus four focused sync regressions. Static SQL checks also pass. The large prepared synthetic/rehearsal suites were not run or imported.

Verification temporarily allowed only the administrator to SET the restricted reader role, inside a force-rollback transaction. No persistent test memberships or anonymous/authenticated grants were created. The credential-free result is `data/phase5-verification.json` (Git-ignored). Administrator SET ROLE checks verify current-role RLS/access, not future independent-login isolation.

## Access boundary and files

Both `crawler` and `property_api` remain outside the public Data API; its confirmed exposed schemas remain `public` and `graphql_public`. The safe view requires the restricted backend reader and active publication/availability with unrestricted known labels. The current sync uses the existing private development **administrator** connection; website code must use a separate restricted backend identity and server-side session/subscription verification in the next phase. None is exposed or provisioned here. The view itself is not a subscription checker.

Added `src/myoko_property_crawler/database.py`, `db_connection.py`, `tools/install_database.py`, `tools/verify_database.py`, four tests in `tests/test_database_sync.py`, and this report. Updated CLI with `sync-db`, shared preflight configuration imports, optional dependency metadata, schema header/checksum manifests, README and database documentation. The executable schema body is unchanged from the reviewed Phase 4B-3 proposal.

No Love Live Myoko/Directus changes, property-site requests, PDF/photo downloads, AI calls, scheduling, deployments, commits or pushes were made. Ready to proceed to website/backend implementation as a separate task.
