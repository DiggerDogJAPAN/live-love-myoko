# Property Finder — complete Supabase HTTPS architecture

This release replaces all application PostgreSQL/Hyperdrive transport, including search, Saved Properties and `/api/auth/session`. It preserves the existing Supabase cookie session, private roles/memberships, CMS design and crawler. See the release receipt for actual application/deployment status; this guide describes the final architecture.

## Runtime

- Finder's browser client calls authenticated `public.finder_properties()` through Supabase HTTPS. The bounded live snapshot, shared property mapper, all four municipality filters, neighbourhood normalization, pricing, sorting, counts and client pagination remain unchanged. A snapshot over 500 fails closed rather than silently truncating.
- Saved Properties uses migration 004's four RPCs unchanged: `finder_saved_ids`, `finder_saved_page`, `finder_save_property`, `finder_remove_saved_property`. Existing hearts, optimistic feedback, rollback, cross-tab refresh, current details/images, unavailable tombstones, 500-save quota and 20-item pagination remain.
- Cloudflare Functions handle Auth and the protected Property Alerts delivery endpoints (see [alerts setup](property-finder-property-alerts.md)). `/api/auth/session` verifies its existing JWT, calls `public.finder_account()` over HTTPS with that same JWT/publishable key, and fetches the verified Auth user over HTTPS. There is no SQL connection or database-reader credential.
- `POST /api/auth/supabase-access` checks the existing cookie JWT and same-origin empty JSON request. It returns that access token and public project configuration with private/no-store headers. Tokens are used only in current request memory; no extra session store, localStorage, refresh-token exposure or new SDK is introduced. Existing refresh/logout/PKCE/email/password flows remain.
- Supabase validates JWTs before the RPC boundary. The common private account helper derives `auth.uid()` and `session_id`, checks issuer/audience/non-anonymous/token times and current Auth session/account state, and reads the private role/paid ledger. Metadata and browser role/tier/owner flags convey no authority.
- Active administrators receive Finder and Saved Properties without payment. Registered unpaid users can manage their own account but cannot retrieve listings. Basic has search; Premium adds saves only when real paid entitlement is current AND customer rollout is enabled. Cancelled, unpaid, inactive, future, expired and revoked subscriptions cannot grant paid permissions.
- **Customer access remains disabled** in the private forced-RLS `finder_security.saved_api_settings.customer_access_enabled` setting. Migration 005 shares this same setting across all RPCs. `FINDER_CUSTOMER_ACCESS=disabled` remains in deployment configuration; the database setting is the authoritative direct-API gate. Stripe is not implemented or enabled.

## Migrations and security

Apply the reviewed **004**, then **005**, once, after the already-applied 001–003. Stop on either failure; do not rerun or make automatic repairs. Both are transactional, time-bounded, deliberately refuse replay and request PostgREST schema refresh. Neither changes crawler data/views, managed Auth ACL/policies, administrator assignments, memberships or database connection limits.

004 creates the narrow authenticated public save RPCs, private customer-rollout setting and a private safe property projection owned by the existing **non-BYPASSRLS customer reader**. 005 adds `finder_account` and `finder_properties`, generalizes the same projection for the full bounded snapshot, and shares live permissions with the existing save RPCs. Original saved rows/timestamps remain intact.

The restricted projection preserves restrictive source/portal RLS even when called from a postgres-owned outer RPC. No public wrapper reads the security-invoker customer view as the bypass-RLS owner. Temporary ownership prerequisites are restored in the same transaction; original platform-granted role memberships remain intact. No browser receives private schema/table/helper privileges. Only `authenticated` can execute the account, Finder, Saved Properties and own-user alert-preference RPCs. Anonymous, service, authenticator, crawler and old website-reader roles receive no execution grants on those customer interfaces. Migration 006 adds separate, narrow delivery RPCs executable only by `service_role`; only the server-side Property Alerts sender receives that API credential. Private schema/table access remains revoked.

Keep `finder_security`, `auth`, `crawler` and `property_api` outside exposed Data API schemas. Only the public RPC schema is required. There are no direct table endpoints for bookmarks, private roles or memberships. All writes derive ownership from the verified JWT, never browser-supplied IDs. Database logging records operation/SQLSTATE only; public errors never expose raw upstream details.

The obsolete Hyperdrive resource was permanently deleted after the owner confirmed production administrator login, Finder search and Saved Properties. No database role or crawler permission was changed. Historical private SQL helpers/roles remain outside the application dependency; the retired connection-budget proposal was not applied.

## Production configuration

`wrangler.jsonc` retains the Pages static output and Auth runtime settings, with **no Hyperdrive bindings** in any environment:

- `FINDER_SUPABASE_PROJECT_REF=fgdoqsepihlzfqlqymet` — non-secret project identifier.
- `FINDER_AUTH_ENABLED=enabled` — production only; default local/preview remains disabled.
- `FINDER_AUTH_SITE_ORIGIN=https://love-live-myoko.com`.
- `FINDER_CUSTOMER_ACCESS=disabled`.
- `FINDER_GOOGLE_LOGIN_ENABLED=disabled`.
- Existing encrypted `FINDER_SUPABASE_PUBLISHABLE_KEY` and `FINDER_AUTH_COOKIE_SECRET` — preserved without regeneration/printing. The publishable key is deliberately supplied to authenticated browser RPC requests and is not an authorization secret.

Production and preview contain no obsolete website database credentials or Hyperdrive bindings. No service-role key, database password, CA file, `pg` package or local emulator is required. Preserve the current Supabase configuration; do not recreate the removed resource as a fallback.

For local Pages testing: use `.dev.vars.example`, the existing Supabase credentials in private `.dev.vars`, the appropriate local site origin, the complete static build and `npm run finder:dev`. No database credential is needed.

## Release sequence

1. Preserve the current working tree; fetch/review GitHub main. Use the existing owner-confirmed restorable database recovery point and record pre-change protected-data/catalog fingerprints. Confirm the intended production project and active verified administrator; do not create accounts or memberships.
2. Run automated SQL/Auth/HTTPS/client/design tests, TypeScript, lint, dependency audit, complete production build, static-export checks and Functions compilation. Review for secrets/unrelated files.
3. Apply 004 and its read-only verification, then 005 and its verification. Compare protected schemas, roles, crawler/Auth/member/bookmark data. A rolled-back database smoke test may verify the existing administrator's own SQL path without persisting bookmarks; it is not a browser login test.
4. Regenerate the **entire** CMS website using `npm run build`, including all property/accommodation pages, current images, public assets, navigation and footer. Verify the current CMS inventory against `out/`; never publish a partial export. The tracked export is the GitHub Pages integration's `out/` output (`npm ci` remotely).
5. Commit the complete reviewed application/static output, push GitHub main and wait for the existing Cloudflare Pages integration. No separate manual deployment. If deployment fails, stop.
6. Verify the deployed revision, public CMS/Auth pages, image assets, anonymous/forged session denial, deployed RPC grants/rollout gate and absence of Hyperdrive application bindings. Remove only the obsolete database bindings/configuration, preserving Auth secrets and unrelated settings.
7. The owner has completed the real browser login/search/save/remove acceptance below, and the unbound Hyperdrive resource is deleted. Future application changes should retain the same acceptance checks; no database pool configuration is involved.

## Owner browser checklist

- Log out and sign in at **https://love-live-myoko.com/login/** with the existing administrator.
- Open **https://love-live-myoko.com/account/**: confirm Administrator, no paid subscription requirement, no session 503.
- Open **https://love-live-myoko.com/property-finder/search/**: check listings/count, all municipality and location filters, prices, sorting, pagination, photos and original links.
- Save one property, refresh, verify the filled heart and account Saved Properties card/count; remove it and confirm the change survives refresh.
- Sign out: Finder/Saved Properties should deny access. Public **/properties/** and **/accommodation/** remain accessible with images.

Automated SQL/HTTP tests do not claim an interactive administrator browser test. The owner elected to perform it; no browser connection is required to complete the authorized deployment.
