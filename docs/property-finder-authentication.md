# Property Finder authentication — Phase 2

> Current implementation/preparation: see [Supabase-only cutover](property-finder-supabase-cutover.md). Access-dependent code, login routes and required bindings described below are historical; the replacement no longer trusts them. Keep the existing dashboard gate and rollback secrets until the staged verification/removal sequence is approved and completed.

Status: application implementation remains local/uncommitted and is not deployed. The separately approved revised database migrations 001 and 002 were applied on 29 October 2026 at 17:22 JST; see [the production receipt](property-finder-membership-migration-results.md). The owner subsequently completed Supabase email/SMTP/redirect/session configuration. This deployment preparation changes no production provider, Access, Hyperdrive, Directus or crawler settings and creates no production users, administrator assignments or memberships. Phase 1 changes are preserved. See the [exact Pages bindings and first-registration deployment checklist](property-finder-authentication-deployment.md).


The production preflight exposed managed Auth ownership restrictions that the first SQL fixture missed. Both proposals have now been revised locally; see [migration compatibility, validation limits and backup confirmation](property-finder-migration-compatibility.md). They were subsequently applied after the owner confirmed completed physical backups with Restore available; no application rollout was activated.

## Architecture and boundaries

The Next.js export contains public, generic account screens. Cloudflare Pages Functions under `/api/auth/*` act as a same-origin backend for Supabase Auth. There is no Supabase browser SDK, browser database credential or browser-readable session store. Passwords travel over HTTPS to the Function and then to the fixed Supabase Auth origin; they are never logged, stored or reflected by this code.

Supabase access and rotating refresh tokens are set only in `__Host-` cookies: HttpOnly, Secure, SameSite=Lax, Path=/ and no Domain. Access-cookie lifetime follows the provider response; the refresh cookie lasts at most 30 days. Supabase's own expiry/reuse/session policies remain authoritative. The account screen refreshes before access-token expiry, on return to the page, and after an expired session. Refresh requests are coalesced within a tab. No tokens are returned in JSON, URLs, localStorage or sessionStorage. Logout revokes the Supabase session and clears all four application cookies; a provider failure clears this browser but explicitly reports that server revocation was not confirmed. Cloudflare Access sessions are separate and are not signed out by account logout.

All mutations require an exact trusted Origin, JSON content and a bounded body. Foreign origins, cross-site requests, unknown fields, role/tier/account-ID inputs and alternate actions/methods are rejected. Responses, including errors and callback redirects, disable browser/CDN caching and expose no CORS allowance. Provider calls use the fixed project host, no redirects, no cache and a ten-second timeout. Provider diagnostics are not reflected. Public Auth rate limits remain enforced by Supabase and 429 responses are retained; no rate-limit bypass or service-role key is used.

Registration, verification resend and recovery use PKCE. A signed HttpOnly flow cookie holds the verifier for 15 minutes. Callback codes can only be exchanged using that verifier, and the callback destination is fixed to the account or reset page, never a user-supplied URL. Links must be opened in the originating browser within that lifetime. Templates keep `{{ .ConfirmationURL }}`: Supabase verifies the email link, then redirects with an authorization code to the exact canonical `/api/auth/callback`. Resend now explicitly supplies a fresh challenge too, avoiding an incompatible implicit fragment response. Email-code verification provides a separate explicit signup OTP path when the email template includes a code; it cannot create a recovery marker. Password updates require a 10-minute signed recovery marker bound to both verified user and live session, then globally revoke sessions. Ordinary login alone cannot submit a password reset. Google uses the same PKCE boundary and appears only when both our server flag and Supabase's provider settings enable it.

For every account read/profile update/reset, the server verifies the asymmetric JWT using Phase 1's dedicated issuer, audience, role and session checks, reads a fresh private account/session snapshot and confirms the authenticated Supabase user. Account IDs are always taken from signed claims. The profile endpoint updates `full_name` only. The account response contains the authenticated user's safe details and trusted membership status, never raw tokens, ledger fields or other users' data.

## Routes and screens

| Surface | Behaviour |
| --- | --- |
| `/login/`, `/register/` | Email/password forms; conditional Google sign-in. Registration requires email confirmation and cannot select a role or plan. |
| `/verify-email/` | Signup email code verification and resend. Links must use the same browser; codes can be entered explicitly. |
| `/forgot-password/`, `/reset-password/` | Generic recovery request; bound recovery session required for a new password. |
| `/membership/` | Basic ¥2,000/month and Premium ¥4,000/month, clearly marked unavailable for purchase. Later Premium features/refund eligibility are described as planned. No Checkout or fake payment. |
| `/account/` | Own verified email/name, account role, membership status, name edit, reset-password link and logout. Unpaid accounts are told that registration does not unlock listings or start charges. |
| `GET /api/auth/config` | Public enabled/provider booleans only. Defaults to disabled when bindings are absent/invalid. |
| `POST /api/auth/register`, `/login`, `/verify-email`, `/recover`, `/resend`, `/google` | Fixed Auth flows. Registration/recovery/resend use generic account-existence messaging; credentials/OTP failures remain denied. |
| `GET /api/auth/callback` | PKCE exchange and fixed redirect, with no tokens exposed to client JavaScript. |
| `GET /api/auth/session`, `POST /api/auth/profile`, `/password` | Verified live account; only safe self-account operations. |
| `POST /api/auth/refresh`, `/logout` | Cookie-only refresh rotation and session revocation. |
| `/api/property-finder/*` | Existing centralized Phase 1 authorization, now accepting the access cookie when Auth is enabled. No new property-data route or static inventory. |

Account screens are public shells, with no personal information in generated HTML/RSC/JS. Private account pages are noindex. Footer/account links make the new screens discoverable without changing the desktop menu. Logout broadcasts clear displayed account/listing state and invalidate pending data loads. Returning from the browser page cache revalidates. These UI controls supplement server authorization; they never grant permission.

## Account role is not subscription tier

| Trusted role/state | Account management | Finder data |
| --- | --- | --- |
| Verified customer, no ledger row/unpaid/expired | Own account | Denied |
| Customer, active paid Basic | Own account | Standard listings/search, only after customer rollout is separately enabled |
| Customer, active paid Premium | Own account | Basic and reserved Premium permissions, only after rollout; Premium features themselves remain unimplemented |
| Private `administrator` role | Own account | No subscription required; valid live verified session/account required |
| Existing allowlisted Cloudflare Access administrator | Existing workflow | Unchanged, independently of new Auth/database/account settings |

The new private `finder_security.account_roles` stores `customer`/`administrator` separately from `memberships.tier`. Missing role rows mean customer; missing membership rows mean unpaid with no tier. No registration trigger, fake paid row, public administrator registration or metadata-based role assignment exists. Only an authorized database operator may promote a verified user by their real Auth UUID after approval. The web reader, browser roles, service_role and crawler writer have no private role/membership write grants. No administrator credential/seed is included.

Schema version 2 validates email confirmation, account role/disable state and live Auth session independently of paid-ledger state. Version 1 remains available for the existing Phase 1 rollout, but cannot accept an injected administrator role. Customers still need a real active/paid ledger and valid dates. An account being registered or having `user_metadata.role`, `app_metadata.tier`, a claimed user ID, or a modified browser flag conveys no listing permission.

## Two independent rollout controls

`FINDER_AUTH_ENABLED` must be exactly `enabled` for account sessions and schema version 2. The pending `wrangler.jsonc` production section now sets this value; local/preview defaults remain disabled. Missing/invalid configuration fails closed. This flag does **not** activate customer listing access. Read-only Cloudflare inspection confirmed both new encrypted Auth secrets are present with matching names; the local flags will take effect only in the next approved deployment.

Keep `FINDER_CUSTOMER_ACCESS` **unset or `disabled`** throughout Phase 2. Even a genuinely paid customer snapshot cannot read listings while it is disabled. Private server-assigned administrators may authorize without payment; existing Cloudflare administrators retain their original independent route. Invalid Cloudflare assertions never fall back to a cookie/token.

Cloudflare Access protection on the existing Finder page/API is preserved. New public Auth routes serve identity/account flows only and never return property inventory. A new Supabase role does not itself grant entry through an existing Cloudflare Access edge policy. The account dashboard therefore keeps the Cloudflare administrator sign-in link. Do not widen/remove those edge policies to make customer login appear to unlock listings. A later reviewed Access transition is still required before customers can use Finder.

## SQL proposals and safe testing

Apply [001](../sql/proposals/001_finder_membership_foundation.sql), then [002](../sql/proposals/002_finder_accounts.sql), **only after review/approval**. Both have now been applied to production; see the receipt above and do not rerun them. Both are deliberately one-time transactional migrations with lock/statement timeouts.

002 adds the private forced-RLS role table and `account_snapshot(uuid,uuid)` helper. The existing postgres administrator owns the private tables/functions and uses its pre-existing Auth reads. No custom helper role, Auth grant or Auth RLS policy is created. Only the restricted website login receives helper EXECUTE; it receives no direct Auth, ledger or role-table access. Helpers use a fixed search path and verified server-supplied IDs. There is no new writer, entitlement seed or property-schema change.

`tests/property-finder-migrations.test.ts` executes the actual SQL files in an in-memory PGlite PostgreSQL database, using synthetic Auth tables, roles and property-view fixtures. It verifies:

- Both migrations execute, existing sentinel property/view flags/writer grants/RLS stay intact, and migration files seed no account/payment rows.
- Anonymous/authenticated/service/crawler roles cannot access helpers, read private tables or write roles/memberships.
- The website login can call fixed helpers but cannot directly read Auth/private tables, modify entitlements or SET the helper-owner role.
- Unpaid accounts remain customer/no tier; explicit administrator fixtures have no fabricated payment; user/session mismatches return no row.
- Disabled/banned/deleted/anonymous/unverified accounts, expired/deleted sessions fail closed.

PGlite tests real PostgreSQL SQL, privileges and RLS in isolation; it is **not a hosted Supabase replica**. The revised fixture models non-superuser postgres and separate managed Auth owners, without Auth grant authority. The owner elected to skip the disposable hosted test; the subsequent approved production application and verification are recorded in the receipt. This preparation preserves those exact SQL checksums and applies no migration. Confirm the Data API exposed schemas exclude `finder_security` and preserve direct REST/GraphQL/RPC denial.

## Operator configuration still required

Do not put values in source code, tracked `out/`, client environment variables or this document. Set server-only Pages bindings/secrets only for the separately approved account deployment. The [deployment checklist](property-finder-authentication-deployment.md) lists every new/existing binding, its source and whether it is secret:

| Binding | Required value/purpose |
| --- | --- |
| `FINDER_AUTH_ENABLED` | `enabled` only for the separately approved Auth rollout |
| `FINDER_AUTH_SITE_ORIGIN` | `https://love-live-myoko.com`; exact canonical origin. Local HTTP localhost/127.0.0.1 is accepted for isolated Functions tests, but cookies always remain Secure. Other preview/staging hosts need an explicitly reviewed origin allowlist change. |
| `FINDER_SUPABASE_PUBLISHABLE_KEY` | Modern `sb_publishable_…` key for the same project as `FINDER_DATABASE_PROJECT_REF`. Secret/service-role/legacy JWT keys are rejected. |
| `FINDER_AUTH_COOKIE_SECRET` | Independently generated cryptographically random signing secret (e.g. 32 random bytes encoded as base64url, at least 43 characters); keep private. Rotation invalidates pending verification/recovery flow cookies, not Supabase sessions. |
| `FINDER_GOOGLE_LOGIN_ENABLED` | `enabled` only after Google OAuth is configured and tested; otherwise `disabled` |
| `FINDER_CUSTOMER_ACCESS` | **Keep `disabled`** |

Existing reader/Hyperdrive/TLS/Access bindings remain unchanged. Do not use the crawler writer or Supabase secret/service-role key.

Supabase dashboard status and remaining acceptance actions:

1. Owner-confirmed: email registration and **email confirmation** enabled. Registration explicitly refuses auto-confirm configuration. Keep anonymous sign-in disabled and retain supported asymmetric signing keys. The configured access-token expiry is 3600 seconds with refresh protection enabled; test refresh/reuse and logout after the approved deployment.
2. Owner-confirmed: Resend SMTP, sender `Love Live Myoko <noreply@love-live-myoko.com>`, Site URL `https://love-live-myoko.com` and exact redirect `https://love-live-myoko.com/api/auth/callback`. Delivery remains to be exercised with an owned real address. Do not add broad production wildcard redirects.
3. Owner-confirmed: confirmation, password recovery and email-change templates configured using `{{ .ConfirmationURL }}`. Preserve those links. Include `{{ .Token }}` in the signup/verification template only if the optional cross-browser signup-code flow is desired; link resend itself still requires the originating browser. Implicit hash links are intentionally not accepted; the page discards hashes instead of reading tokens. This phase does not add dashboard email editing.
4. Review Auth email/token/password rate limits and password policy. Provider throttles propagate as 429. If enabling Supabase CAPTCHA, add a reviewed matching challenge UI/server token flow first; CAPTCHA is not implemented in this phase. Do not weaken existing production protection to test the forms.
5. Optional Google: create the OAuth client in Google Cloud, configure the allowed Google redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`, and enter its client ID/secret in Supabase's Google provider dashboard only. Preserve the exact app callback allowlist above. Test consent, cancellation, verification and account-linking behaviour before enabling our Google flag.
6. Any future administrator promotion requires separate approval using the intended verified Auth user UUID. No new administrator is needed to test ordinary registration. Do not add administrators to public registration or seed fictitious accounts/payments.

No dashboard/provider settings were changed during this preparation. No real signup, email, OAuth consent or production payment was exercised. The first real email/browser acceptance checklist follows the separately approved deployment; existing Cloudflare Access/cache-policy review remains required. Local UI/HTTP tests are not a claim of working email delivery or OAuth configuration.

## Validation and later phases

Run `node --import tsx --test tests/*.test.ts`, `npx tsc --noEmit`, changed-file ESLint, the normal `npm run build`, and `wrangler pages functions build` with the existing Node compatibility flag. Auth tests use synthetic signing keys, intercepted provider HTTP and in-memory SQL only. They cover configuration failures, CSRF, invalid/expired/unverified tokens, secure cookies, no token disclosure, role/ID escalation, unpaid denial, subscription-free trusted administrators, PKCE binding/provider rejection, recovery binding/revocation, refresh/logout and safe account responses. Component tests check form semantics, password autofill, pricing and empty static account shells.

The complete static export must be regenerated with all new pages and both API route patterns. The artifact guard rejects inventory, embedded tokens and server-secret references. The new dev-only PGlite dependency never ships in the Functions or client bundle.

Completed initial Phase 2 checks (before the compatibility revision): **94/94 tests passed**, TypeScript and changed-file ESLint passed without warnings, the normal Directus-backed production build regenerated all **48 pages**, and Cloudflare Functions compiled successfully with Node compatibility. The export guard checked **258 text artifacts**. A local Pages runtime smoke test returned 200 for all seven new pages, configuration disabled by default, 503 for unconfigured account authentication, 404 for an invented administrator action, and 401 for anonymous Finder requests. That runtime test used an unreachable dummy local Hyperdrive target; it could not read production data. No interactive browser, real email delivery or live OAuth round trip was verified.

Deployment preparation revalidated on 29 October 2026 after the PKCE resend fix and dependency patches: **106/106 tests passed**, including actual SQL execution in PGlite and signup/resend/recovery callback regression tests. TypeScript and ESLint passed for all **30 changed source/test/script files**. The normal Directus-backed production build regenerated **48 HTML pages**; the export guard passed for **258 text artifacts**, including required Auth Functions routing. Cloudflare Pages Functions compiled successfully with `nodejs_compat`. A fresh isolated local Pages runtime returned 200 for all seven new pages, default-off configuration, 503 for disabled session/login, 404 for invented administrator/detail routes and 401 for anonymous inventory requests including pagination; API responses retained no-store headers. It used an unreachable dummy Hyperdrive target, not production SQL. SQL file SHA-256 values still match the already-applied production receipt. No new migrations, production configuration changes, real accounts, live email/browser checks, commit, push or deployment were performed.

### Dependency security patches

Deployment preparation updated Next and the matching ESLint configuration from 16.3.5 to **16.4.3**, with compatible transitive patches, using no forced major upgrades. The initial full audit reported 13 findings, including critical/high framework and transitive advisories; the patched lockfile's full `npm audit` reports **zero vulnerabilities**. React, database access and the static-export architecture are preserved. The framework release includes the fixes recommended by the maintainer's [ImageResponse advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j), [Cache Components advisory](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) and [development-server disclosure](https://github.com/vercel/next.js/security/advisories/GHSA-39w2-rjm5-chcv); see the [16.4.3 release](https://github.com/vercel/next.js/releases/tag/v16.4.3).

This production architecture serves a static export and separate Pages Functions, without a Next server, ImageResponse route or `use cache` function in application source. Dependency patches are local and are included in the production rebuild/Functions checks; they have not been deployed. An audit result does not replace the application authorization tests or real registration acceptance.

Before paid access: implement separately reviewed billing synchronization with real paid entitlement writes, complete the controlled Cloudflare customer-access transition, and obtain explicit approval to enable `FINDER_CUSTOMER_ACCESS`. Stripe Checkout/billing, saved properties/searches, interactive map and refund processing are intentionally not implemented here.

Primary references: [Supabase Auth REST schema](https://github.com/supabase/auth/blob/master/openapi.yaml), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [password flows](https://supabase.com/docs/guides/auth/passwords), [PGlite](https://pglite.dev/docs/).
