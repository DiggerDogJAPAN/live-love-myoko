# Property Finder membership security — Phase 1

Supabase Auth is the sole deployed authentication provider. The owner removed both Finder Cloudflare Access applications after real administrator acceptance. Migrations 001/002 are already applied; preserve their checksums, private helpers, roles and RLS. **Customer listing access remains disabled.** Current setup is in the [deployment checklist](property-finder-deployment-checklist.md); historical transition/rollback is in the [cutover record](property-finder-supabase-cutover.md).

## Current data routes and audit

| Surface | Data/access boundary |
| --- | --- |
| `GET /api/property-finder/properties` (optional trailing slash/query) | The only Finder inventory endpoint. Common authorization runs before the property loader. Returns the bounded eligible snapshot; browser filters, sorting and six-card pagination operate on that authorized response. Pagination/query parameters do not bypass authorization or expand SQL eligibility. |
| Legacy `GET /api/property-finder/login` | Removed; returns 404. Administrator login is `/login/` through Supabase. |
| Detail, map, saved-property/search, refund and alternate data paths | Not implemented. Catch-all handler returns 404; unsupported methods return 405. There is no separate Finder detail endpoint; cards link directly to the original source. Future routes must choose a server-side permission through `authorizeFinderRequest`. The route-inventory test fails if another Functions handler is added without review. |
| `/property-finder/search/`, `index.html`, RSC `.txt`, `/_next/` JS | Static access shell and presentation logic only. Live inventory is fetched after authorization, never imported during export or persisted in browser storage. The development fixture route remains development-only. An automated export guard checks HTML, RSC, JSON and JS for inventory, private artifacts, credential references and embedded tokens. |
| Browser-to-Supabase REST, GraphQL, RPC or SQL | No Supabase client/keys or database credentials exist in Finder client code. Supabase browser roles receive no paid-schema grants, even when authenticated. Membership does not grant a PostgreSQL reader role to a customer. |
| Public Directus `/properties/`, `/property/[slug]/`, accommodation and image files | Deliberately public CMS content, separate from the paid Finder inventory. Existing publication, image and sold-property styling rules are preserved. |
| Original municipal/portal listing and image hosts | Public third-party resources intentionally linked/hotlinked; this project cannot revoke copies or access obtained directly from those sources. |

Read-only production checks:

- Eight relations in `crawler`, `property_api` and `public`, and 17 RLS policies inspected. Crawler tables have enabled/forced RLS. The customer view is a security-invoker/security-barrier projection and retains the source/status/type/duplicate/geographic restrictions.
- `anon`, `authenticated` and `service_role` have no reachable paid relations, including column-level access. `anon`/`authenticated` have no reachable functions in the paid schemas. Public GraphQL is an invoker entrypoint, so it receives no additional table rights. The public `rls_auto_enable` function is an event-trigger helper, not a property-data RPC.
- The web login is non-superuser, NOBYPASSRLS, NOINHERIT and not a crawler-writer member. Existing read-only transactions, role checks, column-limited projection, five-second SQL timeout, 500-result bound and TLS connection validation stay intact. The crawler writer remains a separate role/credential and is not imported by website code.
- Hosted Hyperdrive uses the restricted reader, `verify-full`, its CA certificate and disabled query caching. Pages publishes tracked `out/` after `npm ci`; the new `postinstall` guard therefore also checks the actual deployment artifact. Normal `npm run build` checks it again after regeneration.
- The dedicated project currently advertises an ES256 public signing key. No key rotation or Auth configuration change was performed.
- The Pages production variables currently contain only the existing five administrator/database settings; there is no enabled customer feature flag.
- Limits of inspection: the restricted SQL session cannot confirm the Data API exposed-schema dashboard setting. Available Cloudflare credentials returned an empty account Access-app list and 403 for legacy zone Access/cache-rule inspection. Existing Access redirects were confirmed during the preceding release; **the owner must review the actual Access policies and zone cache overrides before customer rollout**. Nothing was broadened or bypassed to obtain these settings.

## Server-side authorization

Every request first passes the explicit route/method/origin allowlist, verifies a Supabase JWT, then reads a fresh version-2 private account/session snapshot using the signed user/session IDs. An inactive or invalid account/session is denied. A private active administrator receives the selected permission without payment. A customer additionally requires the real active paid membership, permitted tier and valid dates, followed by the customer rollout flag. Finally the handler loads the restricted eligible-property view, rechecks the grant deadline and returns private no-store JSON.

`FINDER_CUSTOMER_ACCESS=disabled` denies all customer listing access, including real paid memberships; unknown values also deny customers. The flag is server-only, never taken from a URL, header or browser flag. Administrators are independent of that flag but always require a verified active Supabase account/session. Cloudflare Access headers/cookies convey no permission.

The customer verifier accepts only ES256/RS256 tokens from `https://<FINDER_DATABASE_PROJECT_REF>.supabase.co/auth/v1`, using that project's fixed JWKS endpoint. Audience must be exactly `authenticated`; the role must be `authenticated`, anonymous sessions are rejected, and signed user/session UUIDs plus issuance/expiry are validated. HS256 legacy shared secrets, service-role tokens, unrelated issuers/audiences, forged signatures and query-string tokens are not accepted. No service-role key is needed.

Token verification is not a membership or session-revocation check. Each request uses a **fresh server lookup** of the signed `sub` and `session_id`, joining the current Auth session and account to a private entitlement. Missing/deleted/revoked sessions, timeboxed expiry, disabled/banned/deleted/anonymous users, unpaid/past-due/inactive/canceled/refunded memberships, unknown tiers and expired/future paid periods deny access. Database failures or a missing schema/helper produce a generic 503 and never fall back to listings. Supabase describes the distinction between JWT expiry and checking `auth.sessions` in its [session documentation](https://supabase.com/docs/guides/auth/sessions).

JWT/user metadata, payment-success URLs, request account IDs and `is_subscribed`/tier flags are ignored. Membership state is not cached; only public verification keys are cached. The authorization grant expires at the earliest token, paid-period or session time limit, and the handler rechecks that limit after loading data. Concurrent revocation takes effect on the next request; an already authorized in-flight request is not a durable entitlement cache.

### Permissions

| Tier | Server permissions |
| --- | --- |
| Basic — planned ¥2,000/month | `listings:read`, `search:use` |
| Premium — planned ¥4,000/month | Basic plus `saved-properties:use`, `saved-searches:use`, `maps:read`, `refund:request-review` |
| Active private Supabase administrator | All defined Finder permissions; no subscription required |

These permissions prepare the boundary; they do not implement Premium features or billing. `refund:request-review` only permits requesting a future review. It never establishes purchase/refund eligibility, pays money, or promises an automatic three-month refund. The later verified agency-purchase workflow must enforce the stated eligibility and maximum of three paid Premium months. Trusted billing code must map approved payment-provider price IDs to the tier; no client-supplied amount/tier can establish payment.

All API responses, including denials, set private/no-store browser and CDN headers, no-cache/expiry headers, `Vary: Authorization, Cookie`, same-origin resource policy and no CORS allowance. No ETag, cache API, 304 data path or persistent client inventory cache is used. A CDN rule must not override these controls; Hyperdrive membership query caching must stay disabled. Already viewed/downloaded data cannot be recalled from an authorized user's browser.

## Database migration — revised and applied

See [the review-only SQL proposal](../sql/proposals/001_finder_membership_foundation.sql) and [the compatibility revision/recovery report](property-finder-migration-compatibility.md).

It creates an unexposed `finder_security.memberships` ledger with forced RLS and deny-by-default account/payment/status fields. It seeds no rows. The application has no membership write grants and no new service-role or writer credentials. A future separately reviewed billing writer must be isolated from both website reads and the crawler writer.

The compatibility revision uses the existing postgres administrator as the owner of private fixed-query helpers, following Supabase’s supported pattern. It adds no managed Auth grants, ownership changes or RLS policies. No custom helper-owner role is created; existing postgres Auth reads and RLS bypass are prerequisites, not new grants. Only the web login receives EXECUTE on the fixed-search-path `SECURITY DEFINER` lookup. That helper reads only account/session status and the requested user's ledger row; it exposes no Auth email, password/token fields, payment details or private property facts. The web login receives no direct Auth/ledger table access and customers receive no helper/schema grants. Server token verification binds the helper arguments; it is never a public RPC for arbitrary IDs.

The revised proposals have now been applied and verified in production; do not replay them. See the application receipt above. Phase 2 also execution-tests both SQL proposals in disposable in-memory PostgreSQL using PGlite, including helper-owner isolation, browser-role denial and unchanged property/reader/writer fixtures. The stronger compatibility fixture models non-superuser postgres and protected Auth ownership. The owner explicitly skipped a disposable hosted test; production application subsequently succeeded after backup confirmation. Preserve existing grants, RLS, membership/writer separation, backups and migration checksums. Do not replay or edit crawler migrations.

## Before customer enforcement may be activated

Preserve the applied migrations, exposed-schema restrictions, RLS, verified reader/TLS and isolated crawler writer. Implement separately reviewed billing synchronization with real paid entitlement writes and trusted tier mapping, then test lifecycle cancellation/expiry/refund behavior. Complete authenticated customer acceptance and explicitly approve enabling `FINDER_CUSTOMER_ACCESS`. Never create fake payments, seed active memberships, trust metadata or open a second unguarded data route. Registration/account management alone does not grant Finder access. Stripe, saved properties/searches, maps and refund processing remain future work.

## Validation

Run `npx tsc --noEmit`, changed-file ESLint, `node --import tsx --test tests/*.test.ts`, the normal production build and Pages Functions compilation. The new security suite covers disabled rollout, missing/invalid/expired credentials, both asymmetric algorithms, role/audience confusion, expired/unpaid/revoked memberships, account/session mismatch, Basic/Premium capabilities, spoofed IDs/flags, administrator preservation, no fallback, per-request refresh, in-flight expiry, cross-origin/alternate-route denial, response-cache headers and static inventory leaks. Synthetic keys/records exist only in tests, not runtime configuration or deployed assets.

Primary references: [Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys), [Data API security](https://supabase.com/docs/guides/api/securing-your-api), [RLS and invoker views](https://supabase.com/docs/guides/database/postgres/row-level-security).
