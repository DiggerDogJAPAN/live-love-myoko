> Migrations 004 and 005 have now been applied and verified for the approved full HTTPS release. See the [release receipt](property-finder-supabase-https-release.md). Local-only statements below describe the earlier preparation stage.

> Historical Saved Properties preparation. The owner has authorized the [complete Supabase HTTPS release](property-finder-supabase-https.md); use that guide and its deployment receipt for current status.

# Saved Properties — direct Supabase preparation

Status: implemented and validated locally; **migration 004 is NOT applied, and nothing is committed, pushed or deployed**. Production project is `fgdoqsepihlzfqlqymet`. The existing production feature remains unchanged until the separately approved migration and application deployment. No production saved records, roles, memberships, crawler data, secrets or settings were changed during preparation.

## Request design

The existing UI now sends listing data operations directly to the project's Supabase HTTPS Data API:

| Operation | POST `/rest/v1/rpc/…` | JSON arguments |
| --- | --- | --- |
| IDs/count | `finder_saved_ids` | `{}` |
| Save | `finder_save_property` | `{ "p_property": "listing UUID" }` |
| Remove | `finder_remove_saved_property` | Same single listing UUID |
| Current saved details | `finder_saved_page` | `{ "p_cursor": null }` or the previous cursor |

No RPC accepts an owner, session ID, role, tier or rollout flag. IDs returns the authenticated owner's ID solely for UI isolation. Page responses contain at most 20 bookmarks and their **current** eligible display fields; unavailable listings return `property:null`. Keyset cursors preserve timestamp/UUID ordering. Existing saved rows, timestamps, 500-save cap, read/write rate limits, optimistic hearts, rollback, counts, cross-tab refresh, dashboard styling and removable placeholders are retained.

The existing pure listing/thumbnail projection moved to `src/lib/property-finder/property-data.ts`, shared by server search and the browser. This preserves approved source-specific photographs, original links, location labels, types, pricing and placeholders without maintaining two mappers. No server database/TLS code enters the browser bundle.

## Reusing the existing login

Current login uses HttpOnly cookies, so JavaScript cannot directly read its access token. A small **POST `/api/auth/saved-access`** action checks same-origin/JSON/empty arguments, existing authentication configuration and the existing verified asymmetric Supabase JWT. It returns **that same access token**, project HTTPS origin and the existing publishable key with private/no-store headers and no CORS permission. It opens no SQL/Hyperdrive connection, creates no session, exposes no refresh token, cookie-signing secret or database credentials, and does not make authorization decisions from client flags.

The browser holds this token only in the current operation's memory, sends it with the publishable key to the fixed project RPC URL and does not store it in localStorage/sessionStorage/cookies or cache a second session. Supabase cookies are not sent to the Data API; redirects are rejected. Data API database connections use Supabase's existing API pool, not the website reader/Hyperdrive login. An expired credential triggers the existing cookie-session refresh once; ambiguous failed writes are not retried. All RPCs independently recheck current session/account/entitlement. Logout/revocation therefore denies retained access tokens at the database boundary too.

This necessarily makes the user's existing **access token** temporarily available to same-origin JavaScript for direct HTTPS requests; HttpOnly refresh/session persistence stays unchanged. The publishable key is deliberately public and confers no account/administrator rights. The security boundary is verified JWT identity plus live database authorization, never secrecy of the publishable key. No new SDK, login flow, service-role key or session store is introduced.

The Finder heart provider now obtains permission and saved IDs from the RPC instead of making a separate account-snapshot request first. The `/account/` dashboard and Finder search themselves still use their existing server authorization, which can independently fail if the separate reader/Hyperdrive issue persists. This change is not a claim to fix `/api/auth/session` 503s.

## Migration 004

Review `sql/proposals/004_finder_saved_properties_rpc.sql` and its read-only `.verify.sql` companion after the applied 001–003. Do not rerun those migrations.

- Existing saved/membership/role tables, forced RLS and private account/session helpers remain intact. The new public functions have fixed `pg_catalog` search paths, explicit qualified relations, explicit callable-role ACLs and no dynamic SQL.
- Only `authenticated` receives EXECUTE on the four public wrappers. Anonymous, service, authenticator, crawler and website-reader roles receive none. No browser role receives private schema/table/helper privileges. All new private defaults are explicitly revoked, including permissive existing platform defaults.
- PostgREST verifies the signed JWT before PostgreSQL reads `auth.uid()` and `auth.jwt()`. The helper requires the expected project issuer, authenticated audience/role, non-anonymous identity, valid token times and a live matching Auth session. Existing private helpers check verification, bans, deletion, account activity, administrator status or paid/date-valid Premium entitlement and revocation. Browser metadata cannot promote an account.
- The RPC owner can bypass RLS, so **listing eligibility is read by a separate private projection owned by `crawler_customer_reader`**, which has no BYPASSRLS/login/writer privileges. This respects existing restrictive portal and source RLS even when invoked by a privileged outer RPC. Only safe display columns for up to 20 supplied saved IDs are returned internally. Do not substitute a postgres-owned direct view read.
- Creating that projection requires temporary SET-role and private-schema USAGE/CREATE privileges. The transaction adds a separate self-grant, assigns/restricts the helper while acting as its owner, then removes that self-grant and schema privileges before commit. The original Supabase-admin grant is preserved byte-for-byte; local tests compare all membership options before/after. Preconditions refuse unexpected existing permissions. No managed Auth grants/policies or permanent crawler permissions change.
- A new private forced-RLS singleton setting, `finder_security.saved_api_settings.customer_access_enabled`, starts **false**. Since direct requests bypass Cloudflare flags, this database gate independently denies Premium customers during this release. Active administrators are independent of it. Keep `FINDER_CUSTOMER_ACCESS=disabled` as well; future billing rollout must explicitly coordinate both gates. No paid/member/admin rows are seeded.
- Unexpected SQL errors return only `saved_properties_unavailable`; a PostgreSQL LOG event records operation and SQLSTATE, not raw SQL messages, user/session IDs or credentials. Expected safe denial/quota errors retain their codes. Transport/gateway errors are also masked in the UI.

The migration is transactional, bounded by timeouts, refuses replay and notifies PostgREST to reload its schema. It changes no connection budget, crawler source/data/view, Auth policy, subscription or account role. Production execution and a hosted browser/API test are still required after approval; local PostgreSQL is not a live Supabase gateway validation.

## Old path removal and preserved work

The local application removes `server/property-finder/saved-api.ts`, `saved-database.ts` and `saved-diagnostics.ts`, their dispatch branch and the old same-origin Saved Properties fetch wrapper. GETs to the retired saved routes now return 404; PUT/DELETE return 405 without opening the database. Shared Finder database, membership and Auth Functions remain. Transport-only legacy tests were replaced with direct-RPC and handoff tests, including actual workerd compilation/execution.

Migration 003's private helpers remain installed and unchanged; `check_saved_access` is reused. Do not drop private SQL objects during cutover or silently rerun 003. Historical migration receipts and incident reports are retained. The superseded runtime/test files, including the previous uncommitted diagnostic regression, were preserved locally under `/private/tmp/livelove-saved-properties-before-direct/` before removal; that private archive is not part of `out/` or Git.

## Complete HTTPS continuation

The owner subsequently approved migrating **all** remaining paths and deploying the complete release. The [complete HTTPS guide](property-finder-supabase-https.md) supersedes this earlier Saved-Properties-only preparation record. Migration 005 moves search and account authorization to HTTPS and coordinates 004's permission checks. The token-handoff action is now `/api/auth/supabase-access`. All SQL/Hyperdrive helpers, bindings, driver packages and the emulator are removed from the application. The connection-pool proposal is withdrawn, preserved only in the private pre-change checkpoint, and **will not be applied**.

## Approval and manual steps

1. Confirm a current completed/restorable Supabase backup. Review production catalog prerequisites and the complete migration; stop on drift. With explicit approval, apply 004 once and run its read-only verification. No dummy memberships or admin accounts are needed.
2. In Supabase **Data API settings**, confirm the API is enabled and `public` is exposed. Keep `finder_security`, `auth`, `crawler` and `property_api` **unexposed**. This proposal does not change dashboard settings. If public-schema access is disabled or a custom pre-request hook conflicts, review that configuration before deployment rather than exposing private schemas or broadening grants.
3. Confirm the existing production publishable-key/project pairing; retain existing Auth URLs, SMTP, signing/cookie secrets and login configuration. No new key/secret, OAuth or Auth dashboard change is required.
4. After migration verification and deployment approval, run the complete CMS workflow (`npm run build`), review source/generated changes, and publish the complete tracked `out/` through the established GitHub → Pages integration. No partial/manual deployment.
5. In the owner's real administrator session: save → refresh → open `/account/` → check count/current image/price/link → remove, including a removable unavailable bookmark. Check direct anonymous/unpaid denial. Do not claim this hosted success until actually tested. Existing `/account/` or search 503s still require the separately approved capacity correction.
6. Keep customer access disabled in both places. Address Hyperdrive budget changes separately after approval, then verify existing Auth/search paths without introducing bypasses.

Primary references: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [RLS and invoker views](https://supabase.com/docs/guides/database/postgres/row-level-security), [live session verification](https://supabase.com/docs/guides/auth/sessions), [Hyperdrive connection-pool tuning](https://developers.cloudflare.com/hyperdrive/configuration/tune-connection-pool/).

## Completed validation

- **146 tests passed**: existing Auth/authorization/search/design checks plus direct RPC admin/Premium/customer denial, metadata escalation, live session/account restrictions, ownership isolation, duplicate saves, invalid IDs, restrictive portal RLS, current prices, unavailable tombstones, keyset pagination, 500-save/rate limits, safe errors, direct HTTPS client mapping/refresh and workerd token-handoff/retired-route tests. Legacy transport-only checks were replaced, not counted as tests of the new path.
- TypeScript, changed-file ESLint, non-generated diff checks, production Pages Functions compilation and static-export security checks passed. No dependencies or production bindings changed.
- The normal **complete** `npm run build` fetched current Directus assets and generated `out/`. A fresh read-only CMS inventory and independent output inspection verified **25 properties, 2 accommodations, 377 CMS images, 418 public assets**, 67 content fields, all 48 existing HTML routes and 433 local references, with no missing items. The export guard passed for 259 text artifacts.
- PostgreSQL parsing passed. The actual mutation-free migration preflight DO block passed in a **read-only production transaction**. Local PGlite executed and verified the migration with a non-superuser postgres owner, managed Auth ownership, permissive default grants and existing role options. Production migration application, Supabase HTTP/CORS/schema-cache validation and authenticated browser save/remove **have not happened**.
- Changed/generated files were checked against private local credential values: no matches or private database/key/env files were found, and Git has no staged files. Complete output and all intended changes remain local/uncommitted.
