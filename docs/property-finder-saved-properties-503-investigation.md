> The pool-budget proposal described in this historical investigation is withdrawn. The approved [complete HTTPS migration](property-finder-supabase-https.md) removes the application dependency instead. No connection-limit or pool-size correction was applied.

> Historical investigation of the deployed Cloudflare Saved Properties path. A [direct Supabase replacement](property-finder-saved-properties-direct-supabase.md) is now prepared locally; the separate connection-budget findings remain relevant to Auth and Finder search. No proposed production correction has been applied.

# Saved Properties 503 — investigation, pending request correlation

No production writes, SQL application, connection termination, resource/secret changes, commit, push or deployment were performed. Customer access remains `FINDER_CUSTOMER_ACCESS=disabled`. Existing runtime application code is unchanged. Local changes are regression tests and an unapplied capacity proposal; they are not an asserted fix for an uncorrelated request.

## Supplied production request

The owner reports `PUT /api/property-finder/saved-properties/:listingId` returned HTTP 503 and `{"code":"saved_properties_unavailable"}`, with request IDs `d7729838-57f9-454d-a605-9edc0a145ce7` and subsequently `1a89bee9-7433-45f0-b69a-ff56ab3a4e05`.

**Neither supplied request has yet been matched to its sanitized production log.** Standard Pages logs are live-only and not stored. A historical request ID alone does not retrieve a past event that was outside the capture window. The exact request's `stage` and `databaseCode` remain required before calling any proposed change its confirmed correction. The authenticated log stream is available using the explicit deployment ID `f225cf9d-813b-4b41-b9cc-3aeb10090c78` and emits only sanitized Saved Properties failure fields. See [Pages logging limits](https://developers.cloudflare.com/pages/functions/debugging-and-logging/).

## Confirmed production blocker — separate evidence

A fresh verified-TLS connection as the **actual** `property_finder_web_reader` failed with PostgreSQL **SQLSTATE 53300**: `too many connections for role "property_finder_web_reader"`. This was a connection attempt, not a write test. Read-only administrator inspection found:

- Reader hard limit: **5** connections. All five were occupied by idle `love-live-myoko-property-finder` connections at inspection.
- Existing Hyperdrive resource `d2e1e9cc5947483f8747b8e84ccaf57b` origin soft limit: **20**. Query caching remains disabled.
- Database `max_connections`: **60**, with 20 total sessions at the recorded snapshot. The observed rejection is the dedicated role cap, not proof that the whole database is exhausted.
- Reader retains NOINHERIT, no superuser/RLS-bypass/role-creation/database-creation/replication privileges, default read-only transactions and existing timeouts. No memberships are present.

The resource budgets conflict. A new origin connection can fail even when existing pooled connections are idle/reusable elsewhere. This dependency is shared by all four saved operations and also by the private authorization snapshot; therefore failures can be intermittent and occur before the saved helper. Existing read-counter activity shows that some requests have reached the database. It does not prove the specific PUT's stage.

Do not treat a matching generic 503 message as request correlation. The separate direct connection error proves the capacity blocker exists, but a matching request log or an approved same-path test is still needed to establish whether it caused the supplied PUT.

## Migration 003 comparison

Read-only production checks compared installed helper bodies byte-for-byte with migration 003. All matched:

| Installed helper | Parameters, in call order | Return | Website execution |
| --- | --- | --- | --- |
| `finder_security.save_property` | `p_user uuid, p_session uuid, p_property uuid` | `void` | Granted |
| `finder_security.remove_saved_property` | Same three UUIDs | `void` | Granted |
| `finder_security.saved_property_ids` | `p_user uuid, p_session uuid` | `TABLE(property_id uuid, saved_at timestamp with time zone)` | Granted |
| `finder_security.check_saved_access` | `uuid, uuid, boolean` | `void` | Not directly granted, intentionally |

Owners are postgres, SECURITY DEFINER is enabled, search paths are fixed to `pg_catalog` and `row_security=on`. Saved tables retain forced RLS. Application argument order matches these signatures. No new direct-table/role grants are indicated by this inspection. Catalog compatibility is not a successful live save; no production save/remove test was performed.

## Source of the public code

- `saved-api.ts` returns the generic HTTP 503 for unexpected failures before/in storage. It also passes through the safe database-failure wrapper.
- `saved-database.ts` wraps unclassified configuration, connection, transaction, target-read, helper, result and commit failures as `saved_properties_unavailable`; the safe log records its stage and sanitized database code.
- The browser can also choose the same friendly fallback for transport/invalid-response errors, but the owner captured an actual HTTP 503 JSON response, so this is a server response.
- A storage connection rejection with SQLSTATE 53300 maps to `stage=connect`, `databaseCode=53300`. If authorization's membership lookup fails first, inspect `stage=authorization`; the current logger does not attach SQLSTATE to an unwrapped authorization lookup error. Do not mislabel a request without its log.

## Capacity proposal withdrawn

The owner approved full Supabase HTTPS transport instead. No pool/role-limit correction was applied. The proposed budget scripts are preserved only in the private pre-change checkpoint, not as deployable migrations. Follow the [complete release receipt](property-finder-supabase-https-release.md).

## Regression and acceptance

Local tests cover connection-cap rejection across save/remove/IDs/list: HTTP 503, the public generic code, safe `connect`/53300 diagnostics, no helper query executed and client cleanup. Local PostgreSQL executes the proposed role-cap change, verifies that only the connection cap changes, preserves saved data and rejects replay/unexpected preflight values. Those tests do not validate a real Hyperdrive pool or substitute for request correlation.

Keep the full existing admin/Premium/Basic/unpaid, expiry/revocation, ownership/RLS, zero-body, stable-ID, quota and pagination regressions. Once the exact failure is confirmed and any correction is approved, use one existing administrator-owned record for a controlled reversible live API/browser save → IDs/list → remove test. Preserve any pre-existing saved state; do not create customers/memberships or perform a production write without approval.

The complete CMS build/export validation is performed locally as requested. Any later application release must include all 25 properties, 2 accommodations, 377 CMS images, 418 public assets, existing pages/navigation and four-column footer. No partial export or manual Cloudflare deployment is proposed.

## Completed local validation

- All **148 automated tests** passed, including existing Auth/authorization/RLS/saved-operation regressions and the two new capacity-focused tests.
- TypeScript, changed-file ESLint, non-generated diff whitespace checks and production Pages Functions compilation passed.
- Full `npm run build` passed, including CMS asset preparation and the static-export security guard (259 text artifacts).
- Independent inventory check verified 25 properties, 2 accommodations, 377 CMS images, 418 public assets, 67 CMS content fields, all 48 baseline HTML routes and 433 local asset/link references, with no missing items.
- The live log stream was independently confirmed to receive production events: an anonymous GET to saved IDs returned 401 `authentication_required`, and its exact response request ID matched the sanitized authorization-stage log. This establishes capture connectivity; it does not establish the failing PUT stage.

No production application, SQL, roles, memberships, Hyperdrive settings or customer-access flags were changed. No successful authenticated production save/remove is claimed.

## Additional reported authentication-session failure

The owner also reports GET `/api/auth/session` returning HTTP 503 `authentication_unavailable`, request ID `f825a48d-716d-41ad-9c34-cc811fb3be24`. Its matching production failure log has not been captured. The live sanitizer now accepts both `finder_auth_failure` and `finder_saved_request_failure`; an anonymous session request returned 401 and matched its authentication log, confirming the expanded stream receives Auth events. No authenticated failure has yet been correlated.

Both routes verify the Supabase JWT and then call the **same** `loadMembershipSnapshot`, which uses `databaseClientConfiguration`, `FINDER_HYPERDRIVE`, `property_finder_web_reader` and `finder_security.account_snapshot(uuid,uuid)`. The session route then calls the Supabase Auth `/user` endpoint. A saved request instead proceeds to a second restricted database transaction and the saved helper; it does not call Auth `/user`. This establishes a common database dependency but does not prove both supplied failures occurred there.

There is an existing diagnostic limitation: Auth session processing leaves the outer stage at `configuration` while JWT verification, the membership database lookup and Auth `/user` run. Non-ProviderError failures omit SQLSTATE. Saved authorization also omits SQLSTATE for unwrapped membership lookup errors. Consequently a runtime/configuration or runtime/authorization log alone would not establish the underlying PostgreSQL error. No runtime instrumentation or speculative runtime correction has been changed in this investigation.

Whether authenticated session failures are intermittent or persistent remains unmeasured: no authenticated browser/session credentials are available, and anonymous 401 checks do not exercise the database snapshot. Existing users with valid JWTs still depend on that fresh snapshot on each request; a snapshot outage can therefore affect already signed-in users without invalidating their Supabase login itself. Do not claim Supabase session revocation, provider outage or permanent failure from these generic 503 responses.

A second read-only production capacity snapshot again found reader hard limit 5, all five reader sessions idle, and 20 total database sessions. This confirms saturation persisted across the two inspections, not that every authenticated request failed throughout the interval.
