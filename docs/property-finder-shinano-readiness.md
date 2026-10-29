# Shinano Finder readiness — 28 October 2026

> Historical report: counts, rollout state and Cloudflare Access references below describe that earlier operation. Current production uses Supabase Auth only; the owner has removed both Finder Access applications. Follow the [current deployment checklist](property-finder-deployment-checklist.md) and preserve these migration/release facts as evidence.

## Approved release preparation update

Migration 003 is now installed and verified in production; see
[the migration results](../crawler/docs/migration-003-results.md). All 34 existing
Myoko records are unchanged, 19 remain customer-visible, and Shinano inventory
is empty. The user approved committing the website/crawler implementation and
fresh export together, pushing `main`, and allowing the existing Pages deployment.
No Shinano import is approved in this release.

The workflow matrix is deliberately Myoko-only for both schedule and manual
execution. Restoring Shinano execution requires separate final approval after
website verification. No crawler was manually run during release preparation.

The existing Directus service was started with the already-installed Node
22.22.0 runtime, matching its installed native modules. Configuration and content
were not changed. `npm run build` completed successfully, generating all 41
static HTML pages and existing CMS assets with the production configuration.
TypeScript, all 16 Finder tests, changed-file ESLint, all 187 Python tests and the
Pages Function compilation pass. Export asset references/redirects and scans for
private paths, exact local secret values and synthetic inventory pass. The
migration SQL checksum matches the applied migration receipt. Backups, databases,
local environments and credentials remain excluded from Git.

Before release, the existing live Access-authorized API returned HTTP 200 with
19 Myoko properties and no Shinano listings; anonymous access redirected to Access.
Post-push deployment and live verification results are reported in the release
conversation. No connected Browser was available during preparation; component
rendering and HTTP checks are available independently of browser interaction.

The sections below retain the original pre-migration review and failed-build
record as historical context; their pending migration/build items are superseded
by the successful migration and complete build recorded above.

Website source is prepared for migration 003 and mixed Myoko/Shinano inventory.
This is local preparation, not authorization to migrate, import or deploy.
No database SQL, crawler import, Directus changes, commit, push or deployment was performed.

## Migration review

Reviewed `crawler/docs/shinano-handoff.md`, migration
`crawler/sql/migrations/003_shinano_source.sql`, its prepared read-only checks,
and the 001/002 view, grants and eligibility predicate. No blocking issue found
in the static migration/API contract review:

- Three nullable table columns; `lodge` added to the type constraint. No property
  rewrite, ID/history changes or Myoko transaction-type backfill.
- The source predicate preserves Myoko eligibility and requires Shinano sales
  with a recognized building type. Both view and base-table reader policy use it.
- Existing view column order is preserved, with municipality, type and transaction
  appended. Security invoker/barrier, existing ACL and image permission gating remain.
- Added reader grants cover only the two new predicate inputs and predicate
  execution. Private source facts, schema access and writes remain restricted.

PostgreSQL execution, effective grants and real-login RLS behaviour remain
unverified for 003. The prepared SQL checks do not replace real reader/writer
login verification or a private before/after Myoko baseline comparison.

## Website behaviour

The API explicitly selects the appended fields from the protected view. Nullable
Myoko transaction/type values are supported. Shinano receives an additional API
sale/building eligibility check. Unavailable listings remain excluded; 15 observed
source records must not be treated as 15 eligible Finder results. The handoff's
8 eligible, 5 negotiating and 2 contracted are observations, not fixed assertions.

One shared formatter supplies titles, cards, thumbnail alt text, location filter
options/matching and enquiries: `Myoko (Taguchi)` / `Shinano (Nojiri)`.
The stored `Shinano Town` value remains intact; the municipality selector displays
`Shinano`. Verified English locality takes precedence over district tags, including
when a district needs review. Missing English uses Japanese and retains a review
flag. Missing or duplicate locality yields municipality alone. Japanese keywords,
price filters, sorting, original listing links and source attribution remain.

`lodge` displays as `Pension/Lodge`; house, apartment, commercial, land and other
are mapped explicitly, with unknown types left blank. Each Shinano card includes
the programme eligibility/registration notice and original conditions link.

Permitted Shinano thumbnails are directly hotlinked at their original URLs, only
for HTTPS `shinanomachi-iju.jp` under
`/shinanomachi/wordpress/wp-content/uploads/` with JPEG/PNG/WebP extensions.
Myoko's source/host/path mapping remains. Missing, rejected or failed images use
the existing placeholder. No media was downloaded or rehosted.

Cloudflare Access verification, administrator entitlement, Hyperdrive configuration,
verified TLS, dedicated reader login, read-only transactions and static export
configuration are preserved. No Directus schema/content changes are needed.

## Local validation

- TypeScript: `npx tsc --noEmit`.
- Focused tests: `npm run finder:check` (16 tests), including actual card/directory
  HTML rendering, mixed-source eligibility/filtering, Japanese fallbacks, image
  allowlists/failure state, pension labels, original links, pricing, sorting,
  enquiry actions, Access and TLS protections.
- ESLint: changed website/API/test TypeScript files only.
- Pages Function: Wrangler compilation with `nodejs_compat` and the existing
  compatibility date; temporary output outside the tracked static export.
- Full `npx next build`: JavaScript compilation and TypeScript completed; page-data
  collection failed on `/accommodation/[slug]` fetching Directus. A separate
  read-only health request confirmed `ECONNREFUSED`. Directus was not started or
  modified. The full static export was not regenerated or validated.

## Required rollout order

1. After separate migration approval, capture the private Myoko baseline and apply
   003 once, after installed 001+002. Do not rerun historical installation scripts.
2. Run the prepared 003 SQL checks, real reader/writer isolation checks and compare
   existing Myoko values/UUIDs/history. Verify the new API SELECT as the dedicated
   reader while Shinano inventory is still empty.
3. With the existing Directus available, regenerate and verify the static export
   using the established build. This repository publishes tracked `out/`; the old
   export does not contain the frontend changes in this preparation.
4. After separate release approval, deploy the website/API through the existing
   Git-connected Pages workflow, then verify genuine Access-authorized mixed-source
   API handling and denied unauthenticated requests.
5. Enable the first Shinano crawler import only after the website/API is updated.
   Verify the actual eligible count, images, filters, source links and enquiries.

The updated API requires migration 003's view columns. Deploying it against 002
fails closed with the existing generic directory-unavailable response; it does
not fall back to private tables or source-name-based municipality inference.
The website source is ready; production import readiness is conditional on the
migration/runtime checks, fresh static export and coordinated release above.
