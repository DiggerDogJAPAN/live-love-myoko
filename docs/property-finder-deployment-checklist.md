# Property Finder — current production deployment checklist

Supabase Auth and authenticated Supabase HTTPS RPCs provide the complete Finder service. The owner has verified administrator login, search and Saved Properties in production. The obsolete Hyperdrive resource has been permanently removed after confirming it had no active bindings or other application users. See the [architecture](property-finder-supabase-https.md) and [release/cleanup record](property-finder-supabase-https-release.md).

## Existing deployment

- Repository `DiggerDogJAPAN/live-love-myoko`, branch `main`, Pages project `livelove`.
- GitHub → Pages automatic deployment: repository root, command `npm ci`, output `out`. This publishes the **tracked complete static export**; it does not fetch CMS content or rebuild Next.js remotely.
- `/api/auth/*` and the protected `/api/property-alerts/*` email endpoints use Pages Functions. Preserve `nodejs_compat`, static export and `out/_routes.json`. Finder and Saved Properties use the narrow authenticated Supabase RPCs.
- Migrations 001–005 are applied. Preserve their checksums, private roles/memberships, forced RLS and source eligibility. Do not replay them or alter crawler permissions.

## Production bindings — preserve values

| Binding | Required state |
| --- | --- |
| `FINDER_SUPABASE_PROJECT_REF` | `fgdoqsepihlzfqlqymet` — non-secret project identifier |
| `FINDER_AUTH_ENABLED` | `enabled` |
| `FINDER_AUTH_SITE_ORIGIN` | `https://love-live-myoko.com` |
| `FINDER_CUSTOMER_ACCESS` | **`disabled`** |
| `FINDER_GOOGLE_LOGIN_ENABLED` | `disabled` until separately configured/tested |
| `FINDER_SUPABASE_PUBLISHABLE_KEY` | Existing encrypted publishable key for the dedicated project |
| `FINDER_AUTH_COOKIE_SECRET` | Existing encrypted signing secret |

No website database URL/password, SQL driver, database CA file or Hyperdrive binding is needed in production or preview. Preserve the existing Directus build configuration and all unrelated credentials. Crawler/admin database-writer credentials must never enter website configuration. Property Alerts separately requires an encrypted server-only Supabase API secret for narrow delivery RPCs; it never enters frontend code. See the [alerts setup](property-finder-property-alerts.md).

## Mandatory complete CMS build before every push

1. Inventory the current published Directus properties/accommodations using the established configuration without changing CMS settings/data.
2. Run `npm run build`: CMS image download, complete Next.js static production build and Finder export-security guard. The accepted inventory is **25 public properties, 2 accommodations, 377 CMS images and 418 public assets**; preserve the full current inventory if legitimate CMS content changes. Stop for missing content, failed downloads or unexpected reductions.
3. Independently verify CMS URLs, descriptions, featured/gallery images and existing public routes/assets. Confirm navigation and the four-column footer/account links. A framework page count alone does not prove completeness.
4. For application changes, run relevant automated tests, TypeScript, changed-file lint and production Pages Functions compilation. Check generated files for protected inventory/credentials and Git changes for private files or unrelated work. Documentation-only cleanup does not require repeating the full migration test suite.
5. Stage intended changes plus the **entire regenerated `out/`**, including obsolete hashed-file deletions. Commit/push to `origin/main` within the approved scope. Let the existing Pages integration deploy; stop on build/deployment failure. Do not deploy a partial export or use a separate manual deployment.

## Production acceptance

Wait for the exact commit's Pages deployment to succeed. Verify public CMS pages and representative assets match the complete export. Registration requires trimmed Full Name and at least eight password characters, with guidance **Must be 8 characters or more.** Preserve configured email verification, recovery, refresh and logout.

Anonymous/forged credentials must be denied; authenticated unpaid customers cannot retrieve protected listings. PostgreSQL enforces live sessions, private administrator roles, paid membership boundaries and per-user bookmark ownership. Private schemas remain unexposed, and only narrowly scoped public RPCs are callable by `authenticated`.

Keep customer access disabled in the private database rollout setting as well as deployment configuration until separately approved Stripe work is complete. Administrators need no paid membership. Do not create test accounts or subscriptions without authorization. The owner has already completed the real administrator login/search/save/remove acceptance for the HTTPS cutover; do not repeat it for routine documentation cleanup.

Property Alerts migration 006 and provider setup are separately owner-applied. This release defaults sending off (the `FINDER_ALERTS_ENABLED` operational secret is absent, and the GitHub workflow variable is unset). Missing tables/credentials fail closed. Complete the [Property Alerts setup](property-finder-property-alerts.md) before activation.
