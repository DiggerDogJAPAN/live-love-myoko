# Production migration 003 — completed 28 October 2026 (Japan time)

Migration `003_shinano_source` was permanently applied to the existing Myoko
Property Finder Supabase database after explicit user approval. PostgreSQL 17.11,
project reference/connection identities and TLS certificate/hostname verification
(`verify-full`) were checked. No crawler ran and no Shinano listings were imported.

SQL SHA-256:
`a8e7c2eddc76a623b60ec38a11f08a5f712c39250b71a6e7c0c445ab80015fb7`.
Ledger application time: 28 October 2026, 19:05:28 JST.

## Backup before changes

Private Git-ignored directory:
`crawler/data/backups/003-20261028T100514798237Z/`.

The backup includes `schema.sql`, `data.sql`, `catalog.json`, `rows.json`,
a SHA-256 manifest, the exact migration SQL and the final result receipt.
It captures both Finder schemas, their tables, constraints, indexes, functions,
view, RLS policies, grants/default privileges and relevant role memberships;
no role passwords or connection strings are captured. All six existing tables
were backed up: 1 source, 5 crawl runs, 34 properties, 0 price events,
1 status event and 0 translations.

The backup directory is mode 0700 and files are 0600. Manifest hashes and SQL
syntax were verified. `pg_dump` was unavailable, so this is a catalog-based
logical backup. A restore rehearsal was not performed. Restore SQL is for an
empty compatible PostgreSQL/Supabase schema with existing role names, never an
automatic overwrite of production; detailed ACL/default/membership metadata is
also retained in `catalog.json`.

Table locks protected the backup/before-after comparison from concurrent writers.
Migration and pre-commit checks ran in one transaction with bounded lock waits.

## Installed and preserved

- Three nullable columns: transaction_type, construction_details, source_facts.
- Property type check expanded to allow lodge; existing values not rewritten.
- Source-aware eligibility function and RLS policy; restricted invoker/barrier
  view appends municipality, property_type and transaction_type.
- One Shinano source profile, with zero associated property records.
- Private, RLS-forced `crawler.schema_migrations` checksum ledger, created by the
  runner. Anonymous, authenticated, reader and writer roles have no ledger access.

All 34 pre-existing property records compared exactly on every original column,
including UUIDs, Japanese data, prices, statuses, permissions and timestamps.
Myoko source metadata/watermarks and all existing crawl/price/status/translation
history compared exactly. The customer view retained the same 19 Myoko listings
and every original projected value. All 19 appended municipality/type/transaction
values were separately compared to the underlying property facts.

## PostgreSQL and effective-access checks

- New nullable columns and CHECK constraints verified against PostgreSQL.
  Positive lodge/sale and negative type/classification/JSON cases used an isolated
  temporary probe table only; no synthetic production property rows were created.
- Prepared SQL checks passed for negotiations, viewing closures, sold/withdrawn/
  missing/unknown states, rentals, land, unknown labels and Myoko compatibility.
- Actual website reader login plus crawler_customer_reader role: view reads work;
  all private crawler tables/metadata and internal view columns are inaccessible;
  writes and escalation to writer/postgres are denied. Disabling row security
  cannot bypass the view's underlying RLS.
- Actual crawler writer login plus crawler_writer role: required reads and
  zero-row insert/update permission checks work; delete, schema CREATE, ledger
  reads and escalation to postgres are denied.
- anon/authenticated retain no private-schema usage or customer-view SELECT.
- Administrative test memberships were rolled back; none persisted. No broad
  grants, login passwords, Data API exposure or website configuration changed.

Checks were run under effective roles before commit and independently through
the existing real reader/writer logins after commit. No permission or data-integrity
check failed. All 187 Python tests also pass.

## Reapplication protection and remaining scope

The private ledger records the exact approved SQL checksum. A second invocation
of `tools.migrate_shinano --apply` returned `already_applied=true`, skipped all
migration DDL and passed the reader/writer checks again. A changed checksum or
untracked partial installation is rejected. The raw one-time SQL itself is not
idempotent; use the tracked runner rather than rerunning it directly.

Database-side migration/verification is complete. Website deployment and the
first Shinano import remain separate approval steps. No Git commit/push, website
or crawler deployment, workflow dispatch, Directus action or Shinano crawl/import
was performed. Other website team's local edits were left untouched.
