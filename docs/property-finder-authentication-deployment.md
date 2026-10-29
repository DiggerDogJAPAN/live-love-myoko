# Property Finder authentication deployment

The current, authoritative procedure is the [Supabase-only application cutover](property-finder-supabase-cutover.md). It supersedes the previous Access-dependent staging commands and binding requirements. Application changes are local only; existing dashboard protection and rollback secrets remain unchanged.

## Registration password policy

The owner has confirmed a production Supabase Auth minimum of eight characters. Frontend and server share that minimum and the visible guidance is exactly **Must be 8 characters or more.** The technical maximum of 128 remains enforced without appearing in that guidance. Full Name is required and trimmed on both sides, then stored in the existing profile metadata. Existing-account login remains compatible. Provider `weak_password` responses remain authoritative and safely handled; no Supabase setting was changed locally. The previously reported policy mismatch is resolved by the owner's latest confirmation.

## Current production setup

Preserve `FINDER_AUTH_ENABLED=enabled`, `FINDER_AUTH_SITE_ORIGIN=https://love-live-myoko.com`, `FINDER_CUSTOMER_ACCESS=disabled` and `FINDER_GOOGLE_LOGIN_ENABLED=disabled`. Keep the existing encrypted `FINDER_SUPABASE_PUBLISHABLE_KEY`, `FINDER_AUTH_COOKIE_SECRET`, `FINDER_DATABASE_PROJECT_REF`, `FINDER_DATABASE_URL`, and the `FINDER_HYPERDRIVE` resource with its verified TLS/CA and disabled query caching. The exact secret classifications, rollback-only legacy names and cleanup order are documented in the cutover guide. No credentials belong in tracked source or browser variables.

Supabase email registration/confirmation, SMTP, canonical Site URL and exact `/api/auth/callback` redirect remain configured as reported by the owner; preserve them. Google stays disabled. Migrations 001/002 are already applied and the initial private administrator has been assigned/verified. Do not rerun migrations or create replacement users, administrator seeds or fictitious subscriptions. See [the original migration receipt](property-finder-membership-migration-results.md).

## Complete static CMS release

Every approved production release must run `npm run build` against the normal Directus setup, including its asset-download step. Independently verify the current 25 public properties, 2 accommodations, 377 CMS images, full descriptions, all existing routes, footer/navigation and other public assets in `out/`. A framework page count alone is insufficient. Stop if required content/assets are missing. Stage the whole regenerated export and approved source, then use the existing GitHub main → Pages workflow (`npm ci`, repository root, `out`). Do not deploy a partial export or switch to SSR/manual infrastructure.

Run all local tests, TypeScript, changed-file lint, the export security guard and production Pages Functions compilation. The detailed cutover guide specifies the owner approval gates, real administrator login acceptance while Access still protects the edge, later Access removal, clean-browser tests and rollback. No commit, push, deployment or dashboard change is authorized by preparation alone.
