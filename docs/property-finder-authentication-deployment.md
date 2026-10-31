> The current release replaces all SQL/Hyperdrive application transport. Follow the [complete Supabase HTTPS architecture and release procedure](property-finder-supabase-https.md). Database-connection requirements below are historical and no longer apply to this release.

# Property Finder authentication deployment

Supabase Auth is the sole production authentication provider. Both old Finder Access applications have been removed by the owner, who verified real administrator login and Finder access. Use the [current production checklist](property-finder-deployment-checklist.md); retain the [short cutover/rollback record](property-finder-supabase-cutover.md). Current runtime configuration does not require an Access gate, allowlist or legacy redirect.

## Registration password policy

The owner has confirmed a production Supabase Auth minimum of eight characters. Frontend and server share that minimum and the visible guidance is exactly **Must be 8 characters or more.** The technical maximum of 128 remains enforced without appearing in that guidance. Full Name is required and trimmed on both sides, then stored in the existing profile metadata. Existing-account login remains compatible. Provider `weak_password` responses remain authoritative and safely handled; no Supabase setting was changed locally. The previously reported policy mismatch is resolved by the owner's latest confirmation.

## Current production setup

Preserve `FINDER_AUTH_ENABLED=enabled`, `FINDER_AUTH_SITE_ORIGIN=https://love-live-myoko.com`, `FINDER_CUSTOMER_ACCESS=disabled` and `FINDER_GOOGLE_LOGIN_ENABLED=disabled`. Keep the existing encrypted `FINDER_SUPABASE_PUBLISHABLE_KEY`, `FINDER_AUTH_COOKIE_SECRET`, `FINDER_DATABASE_PROJECT_REF`, `FINDER_DATABASE_URL`, and the `FINDER_HYPERDRIVE` resource with its verified TLS/CA and disabled query caching. The exact secret classifications, rollback-only legacy names and cleanup order are documented in the cutover guide. No credentials belong in tracked source or browser variables.

Supabase email registration/confirmation, SMTP, canonical Site URL and exact `/api/auth/callback` redirect remain configured as reported by the owner; preserve them. Google stays disabled. Migrations 001/002 are already applied and the initial private administrator has been assigned/verified. Do not rerun migrations or create replacement users, administrator seeds or fictitious subscriptions. See [the original migration receipt](property-finder-membership-migration-results.md).

## Complete static CMS release

Every approved production release must run `npm run build` against the normal Directus setup, including its asset-download step. Independently verify the current 25 public properties, 2 accommodations, 377 CMS images, 418 public assets, full descriptions, all existing routes, footer/navigation and other public assets in `out/`. A framework page count alone is insufficient. Stop if required content/assets are missing. Stage the whole regenerated export and approved source, then use the existing GitHub main → Pages workflow (`npm ci`, repository root, `out`). Do not deploy a partial export or switch to SSR/manual infrastructure.

Run all local tests, TypeScript, relevant lint, the export security guard and production Pages Functions compilation. Follow the current checklist for real administrator login, public CMS and anonymous/unpaid denial. Retain legacy rollback secrets until explicit deletion approval; do not recreate Access applications during routine deployment. Customer listing access stays disabled and no Stripe activation is included.
