# Phase 2 authentication deployment checklist

Prepared locally on 29 October 2026; **not deployed**. Canonical website: `https://love-live-myoko.com`. Supabase project: `fgdoqsepihlzfqlqymet` (Myoko Property Finder). Migrations 001/002 are already applied and verified; **do not run them again**. See [the migration receipt](property-finder-membership-migration-results.md) and [implementation/security boundaries](property-finder-authentication.md).

The owner subsequently approved the Phase 2 production release. The checks below record the release's pre-deployment evidence; the authoritative deployment result is the matching Git commit and Cloudflare Pages deployment. No real customer, paid membership or administrator assignment is part of the release.

## Permanent complete-CMS release requirement

Every deployment must run the established **full `npm run build`** workflow against the existing CMS: download current published property/accommodation featured and gallery assets, build all CMS detail/listing pages and other application pages, copy the complete public assets, then run the export security guard. Publish the entire resulting tracked `out/`, including replaced/deleted hashed bundles. The Git-connected Pages build command `npm ci` validates/publishes that prepared export; it does not fetch or rebuild the local CMS for you. Never use a fixed framework page count as the CMS completeness check. Stop before pushing if required records, descriptions, URLs or assets are missing. This permanent requirement is also recorded in `AGENTS.md`.

For the approved release, an independent unlimited published-record query confirmed that the CMS's only content collections are `properties` and `accommodations` (plus their file junctions): **25 published properties and 2 accommodations**. The full build downloaded **377 CMS images**. Independent artifact checks verified all **27 CMS detail URLs**, **67 nonempty title/summary/description/about fields**, all **377 featured/gallery images**, all **418 public assets** byte-for-byte against `public/`, all **41 baseline HTML paths**, and **432 internal page/asset references**, with no missing content or broken references. The regenerated export has **48 HTML files**, including the seven new authentication/pricing pages; the CMS inventory, not that count, establishes completeness. All **37 existing public production URLs**, including the **27 CMS details**, returned 200 and their CMS text matched the current records. No separate CMS page collection or export step was found; the existing asset-download and static-generation steps cover both content collections. No Directus configuration or data was changed.

## Cloudflare Pages bindings

The existing configuration file is **`wrangler.jsonc`**, not `wrangler.toml`. Its `env.production.vars` now enables account authentication and explicitly disables paid listing access and Google. Top-level variables keep local/preview authentication disabled. Because Pages environment overrides do not inherit resource bindings, `env.production.hyperdrive` explicitly retains the same existing binding/ID. Do not create a competing TOML file or place secret values in Wrangler `vars`.

Read-only production inspection on 29 October confirmed **both new Auth secrets and all five existing Access/database bindings are encrypted** on Pages project `livelove`. The secret names match the Functions' `context.env` → `AuthEnv` → `authConfiguration` references. Cloudflare does not return their values, so this confirms presence/type, not secret content or a successful provider round trip. No dashboard settings were changed. These are Functions bindings, never `NEXT_PUBLIC_*` variables. Keep account authentication off in unconfigured preview environments and retain all existing encrypted values.

The same read-only project check confirmed production branch `main`, repository-root build, `npm ci`, output `out`, the unchanged Hyperdrive ID, and **no existing dashboard bindings with the four rollout-flag names**. There is therefore no detected dashboard/config naming conflict. Wrangler's own configuration parser resolved all four expected flags and the existing Hyperdrive binding for local, production and preview, with no validation warnings.

| Exact name | Value/source | Secret? |
| --- | --- | --- |
| `FINDER_AUTH_ENABLED` | `enabled` in `wrangler.jsonc` → `env.production.vars`; local/preview `disabled` | No; server-only rollout control |
| `FINDER_AUTH_SITE_ORIGIN` | `https://love-live-myoko.com` exactly; configured in Wrangler | No |
| `FINDER_SUPABASE_PUBLISHABLE_KEY` | The project's modern `sb_publishable_…` key, from Supabase **Project Settings → API Keys** | Public by design; keep server-side, optionally encrypted. Never substitute an `sb_secret_…`, service-role or legacy JWT key |
| `FINDER_AUTH_COOKIE_SECRET` | Generate and privately save a new cryptographically random 32-byte value encoded as base64url (at least 43 characters), using a password manager or trusted local generator | **Yes: encrypted secret**. Do not paste into logs, Git or build output |
| `FINDER_CUSTOMER_ACCESS` | **`disabled` throughout Phase 2**, configured in Wrangler for every environment | No; server-only paid-listing control |
| `FINDER_GOOGLE_LOGIN_ENABLED` | **`disabled`**, configured in Wrangler; enable only after separate provider setup/consent tests | No; optional feature flag |
| `FINDER_DATABASE_PROJECT_REF` | Retain `fgdoqsepihlzfqlqymet`; Supabase Project Settings project reference | No; retain existing binding |
| `FINDER_DATABASE_URL` | Retain the existing restricted website-reader connection URI from the approved deployment setup; validation still requires it when Hyperdrive is used | **Yes: encrypted secret**. Never use postgres, a service key or crawler-writer credentials |
| `FINDER_ACCESS_TEAM_DOMAIN` | Retain the existing `https://<team>.cloudflareaccess.com` issuer; Cloudflare Zero Trust team settings | Public issuer identifier; retain existing binding |
| `FINDER_ACCESS_AUD` | Retain the existing Finder **API** Access application's Audience (AUD) tag, from Zero Trust → Access → Applications | Public audience identifier; retain existing binding |
| `FINDER_ADMIN_EMAILS` | Retain the existing approved comma-separated administrator email allowlist | **Sensitive: keep encrypted**, since it contains personal data and authorization policy |

Retain the existing `FINDER_HYPERDRIVE` **resource binding**, origin reader credentials, verify-full TLS/CA and disabled query caching. It is not a new text variable. `FINDER_LOCAL_CA_FILE` is a local workerd preview path only; do not add that filesystem path to production. The existing Directus build settings are unchanged. No Supabase service-role key, separate `SUPABASE_URL`, browser Supabase key, Resend API key or SMTP password is needed by Pages. SMTP credentials remain in Supabase. Google client ID/secret, if later needed, belong in Supabase/Google dashboards, not Pages.

## Supabase configuration and exact email flow

The owner reports email registration/confirmation, Resend SMTP (`Love Live Myoko <noreply@love-live-myoko.com>`), confirmation/recovery/email-change templates, canonical Site URL, exact callback redirect, 3600-second access tokens and refresh-token protection are configured. These settings were **not changed or independently exercised** during this preparation. No further migration or administrator assignment is required for ordinary unpaid registration. Keep `finder_security` outside Data API exposed schemas and preserve existing grants/RLS/asymmetric JWT signing.

1. Registration, verification resend and recovery send a PKCE S256 challenge to Supabase and set a signed, HttpOnly, Secure flow cookie for **15 minutes**.
2. The template's `{{ .ConfirmationURL }}` points to Supabase's `/auth/v1/verify`, with its verification token, type and the exact `redirect_to=https://love-live-myoko.com/api/auth/callback`. Do not replace it with a direct app link containing `token_hash`, an implicit token fragment or an unrelated domain.
3. Supabase verifies that one-use link, then redirects with `?code=…` to the Pages Function. The Function exchanges the code with the cookie's verifier and sets HttpOnly session cookies. Signup/resend goes to `/account/`; recovery goes to `/reset-password/` with an additional user/session-bound **10-minute** recovery cookie.
4. Use the **same browser** that requested the email, and the latest link within 15 minutes. New requests replace the pending verifier. A link opened in another browser, after expiry or after reuse fails closed; request another link. No access/refresh token is accepted from a URL fragment or returned to browser JavaScript. A signup OTP is optional only if the template includes `{{ .Token }}`; it never authorizes password recovery.
5. Password reset requires the valid recovery session, changes the password and revokes all Supabase sessions. Email-change templates can remain configured; this phase's dashboard edits the name only and does not expose an email-change action.

Optional Google requires its provider client ID/secret in Supabase and Google redirect URI `https://fgdoqsepihlzfqlqymet.supabase.co/auth/v1/callback`, plus the existing exact application callback allowlist. Leave the website flag disabled until that provider is configured and tested. If Supabase CAPTCHA is enabled, it needs a matching reviewed UI/token integration before registration can work; do not disable protection to work around missing integration.

## Production release procedure — after approval

1. Review all pending Phase 1/2 source, dependency patches, SQL receipts and regenerated `out/` together. SQL files document the already-applied schema; this release must not execute them. No fake users, administrator seeds or memberships are included.
2. Both new encrypted Production secrets are now confirmed present. Retain them and the existing Access/reader/Hyperdrive settings; do not recreate or print them. Review `wrangler.jsonc`'s production settings, which the next approved deployment will apply: **account authentication only**, `FINDER_CUSTOMER_ACCESS=disabled`, Google disabled. Do not add conflicting plaintext/secret flags in the dashboard. This preparation changes the local config only, not production configuration.
3. Preserve the existing Access applications protecting Finder search and its API. Ensure public `/login/`, `/register/`, `/verify-email/`, `/forgot-password/`, `/reset-password/`, `/account/`, `/membership/` and `/api/auth/*` can reach their static shells/Functions without the Finder administrator challenge. Do not broaden existing Finder policies. Confirm no Cache Everything override caches `/api/auth/*` or `/api/property-finder/*`; both handlers return private/no-store headers.
4. With the normal local Directus setup, run `node --import tsx --test tests/*.test.ts`, `npx tsc --noEmit`, changed-file ESLint and `npm run build`. The latter regenerates the complete static export and runs `node scripts/check-finder-export.mjs`. Compile with `npx wrangler pages functions build functions --outdir /private/tmp/finder-auth-functions --compatibility-date 2026-10-27 --compatibility-flags nodejs_compat`.
5. Review/stage the approved sources and **complete new `out/`**, including both `/api/auth` patterns in `_routes.json` and all seven account/pricing pages. Keep secrets, local databases, backups and temporary files excluded. After explicit approval, commit/push through the established Pages workflow: its `npm ci` checks the tracked export; it does not regenerate stale export content for you. Pages compiles the root `functions/` separately; no Next server or new infrastructure is required.
6. Confirm the approved Pages deployment and perform the first real-account checklist below. If Auth configuration fails, disable only `FINDER_AUTH_ENABLED` to stop account operations; preserve Access and keep customer access disabled. Account cookies cannot bypass the Finder server's paid-access gate.

### Exact Git procedure — do not execute before approval

Use the current `main` checkout and include the complete pending Phase 1/2 implementation, dependencies, configuration, documentation and refreshed export together. Fetch/review upstream first; if upstream advanced, preserve the dirty working tree and safely integrate/revalidate before committing. Never force-push or discard local changes.

```sh
git fetch origin
git log --oneline HEAD..origin/main
git status --short
```

When upstream is integrated and the final checks below pass, stage only these reviewed paths (include deletions/replacements within `out/`):

```sh
git add -- .dev.vars.example AGENTS.md wrangler.jsonc package.json package-lock.json public/_routes.json
git add -- functions/api/auth server/auth
git add -- server/property-finder/access.ts server/property-finder/api.ts server/property-finder/authorization.ts server/property-finder/customer-auth.ts server/property-finder/membership.ts server/property-finder/membership-database.ts
git add -- src/components/Footer.tsx src/components/property-finder/PropertyFinderAccess.tsx src/components/auth src/lib/auth
git add -- src/app/account src/app/login src/app/register src/app/verify-email src/app/forgot-password src/app/reset-password src/app/membership
git add -- scripts/check-finder-export.mjs tests/property-finder-auth.test.ts tests/property-finder-auth-ui.test.ts tests/property-finder-security.test.ts tests/property-finder-migrations.test.ts
git add -- docs/property-finder-authentication-deployment.md docs/property-finder-authentication.md docs/property-finder-membership-security.md docs/property-finder-migration-compatibility.md docs/property-finder-membership-migration-results.md
git add -- sql/proposals/001_finder_membership_foundation.sql sql/proposals/002_finder_accounts.sql out
git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
```

Review the staged source diff and confirm no private env files, credentials, database files, backups, crawler changes or unrelated work are staged. SQL files retain the production receipt checksums and are not migration commands. `AGENTS.md` contains the framework-generated heading update. Then:

```sh
git commit -m "feat: add secure Property Finder account authentication"
git push origin main
```

Allow the existing GitHub → Cloudflare Pages automatic production deployment for that exact commit. Retain build command `npm ci`, repository root and output `out`; its postinstall export guard runs before Pages compiles `functions/`. Do not run `wrangler pages deploy`, change infrastructure or apply SQL. Wait for successful deployment before the real-account checks.

## First real registration and recovery test

Use an owned real email address after deployment; no production test paid membership or administrator promotion is needed.

- Visit the canonical HTTPS `/register/` in a normal browser. Confirm Google is hidden unless configured. Register and confirm there are no charges or listing privileges. Before verification, login/account access must not become an authenticated account.
- Check sender, delivery and the `{{ .ConfirmationURL }}` link. Open the latest link in the originating browser within 15 minutes. It should pass through Supabase and `/api/auth/callback?code=…`, then land on `/account/` without tokens in the address bar. Confirm your email/name, **Customer**, **No membership** and locked listings. Inspect cookies privately for Secure/HttpOnly/SameSite=Lax; do not copy their values into tickets or logs.
- Request a verification resend when appropriate and repeat its link flow; old/expired links must not create a session. A signup OTP screen requires a token in the email template and is optional.
- Save the name, reload the dashboard, sign out, and confirm account requests cannot reuse the revoked session. Sign in again with the verified address. Let a session refresh before the one-hour access expiry; reloading/returning to the dashboard must retain only a valid server-verified account.
- Request password recovery, open the latest link in the originating browser, and set a password of at least 12 characters within 10 minutes of arriving at reset. Confirm sign-out after reset, the old password fails and the new password succeeds. Replayed/expired links and a normal login without a recovery marker must not authorize another reset.
- Confirm unauthenticated/unpaid direct Finder requests remain behind Access and/or receive an API denial with no listing payload. Check the existing administrator's separate Cloudflare Access route still works; do not add an account role merely for testing. No private membership schema should be available through browser REST/GraphQL/RPC.
- Administrator acceptance: in a fresh browser, open `https://love-live-myoko.com/api/property-finder/login`, complete the existing Cloudflare Access login with the approved administrator identity and confirm Finder still loads. A normal Supabase signup with the same email is **not** automatically an administrator. If a genuinely operator-assigned Supabase administrator already exists, verify its dashboard role is Administrator/plan not required, and that its Finder requests still pass through the existing Access policy. Otherwise a positive production Supabase-administrator test requires a separately approved private role assignment; this deployment creates none. Automated SQL/authorization tests cover the trusted-role path and reject metadata-based promotion.

Keep Cloudflare Access throughout this release. Replacing it with Supabase for administrators and future paid members is a later separately reviewed edge-policy transition.

Real email delivery, provider dashboard settings, Google consent and interactive production cookies cannot be proved by mocked HTTP/in-memory SQL tests or a static build. They remain deployment acceptance actions. Billing synchronization, paid listing activation, saved data, maps and refunds remain later phases.

## Final pre-deployment review — 29 October 2026

- **106/106 tests passed**, including registration/confirmation/resend/recovery PKCE, refresh/logout, unpaid denial, trusted private administrator permissions and actual migration SQL security in PGlite. A previously unreliable token-tampering test now always changes signature bytes instead of potentially retaining the same token/base64url padding; runtime authentication code was not weakened.
- TypeScript and changed-file ESLint passed. The normal Directus-backed production build regenerated all **48 HTML pages**; the static-export security guard checked **258 text artifacts** and both Auth/Finder route patterns.
- Cloudflare Pages Functions compiled using the **production** environment and `nodejs_compat`; dependency audit reports **zero vulnerabilities**. The SQL checksums remain identical to the production application receipt; no migrations were applied.
- Unauthenticated read-only live checks returned **200** for public `/properties/`, and **302 to Cloudflare Access** for both `/property-finder/search/` and `/api/property-finder/properties`. Existing public CMS access and Finder edge protection remain in place. A successful administrator sign-in remains an interactive post-deployment acceptance action.
- No new implementation/build blocker was found. Encrypted values cannot be read back; their actual correctness, SMTP delivery and complete browser/session flows still require the first real tests after the approved deployment. A short/invalid signing secret or wrong publishable key fails closed rather than enabling access.
- All work is local/uncommitted. No production configuration/data, crawler, schema, Access policy or account assignment was changed; no Git commit, push or deployment was performed.

References: [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [email template variables](https://supabase.com/docs/guides/auth/auth-email-templates), [Auth resend PKCE parameters](https://github.com/supabase/auth/blob/master/internal/api/resend.go).
