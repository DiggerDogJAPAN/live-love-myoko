# Property Finder — current production deployment checklist

Supabase Auth is the sole authentication provider. The owner removed both Finder Cloudflare Access applications after testing Supabase administrator login and Finder access. No Access application, allowlist or redirect is a deployment prerequisite. Keep the short [migration/rollback record](property-finder-supabase-cutover.md) and [legacy-secret review](property-finder-access-removal.md).

## Existing deployment and database configuration

- Repository `DiggerDogJAPAN/live-love-myoko`, branch `main`, Pages project `livelove`.
- Existing GitHub → Pages automatic deployment: repository root, command `npm ci`, output `out`. This installs Function dependencies and publishes the **tracked complete static export**; it does not fetch CMS content or rebuild Next.js remotely.
- Root `functions/` contains `/api/auth/*` and `/api/property-finder/*`; retain `nodejs_compat`, static export and `out/_routes.json`. No separate manual deployment, SSR adapter or new infrastructure.
- Existing `FINDER_HYPERDRIVE` resource `d2e1e9cc5947483f8747b8e84ccaf57b`, restricted reader, Supabase CA/verify-full and disabled query caching remain unchanged. Never use crawler/admin writer credentials in the website. Keep production migrations 001/002, RLS and grants intact.

## Production bindings — preserve values

| Binding | Required state |
| --- | --- |
| `FINDER_AUTH_ENABLED` | `enabled` |
| `FINDER_AUTH_SITE_ORIGIN` | `https://love-live-myoko.com` |
| `FINDER_CUSTOMER_ACCESS` | **`disabled`** |
| `FINDER_GOOGLE_LOGIN_ENABLED` | `disabled` until separately configured/tested |
| `FINDER_SUPABASE_PUBLISHABLE_KEY` | Existing encrypted publishable key for the dedicated project |
| `FINDER_AUTH_COOKIE_SECRET` | Existing encrypted signing secret |
| `FINDER_DATABASE_PROJECT_REF` | Existing encrypted `fgdoqsepihlzfqlqymet` binding |
| `FINDER_DATABASE_URL` | Existing encrypted restricted-reader connection |
| `FINDER_HYPERDRIVE` | Existing resource binding, not a secret/vars entry |

`FINDER_LOCAL_CA_FILE` is local-only. Preserve Directus build bindings. Retained legacy secrets are rollback-only and not prerequisites for the current application; do not delete them without explicit approval. Do not copy any secret into browser variables, source or generated files.

## Mandatory complete CMS build before every push

1. Inventory all current published Directus properties/accommodations using the established configuration without changing CMS settings/data.
2. Run `npm run build`: CMS image download, Next.js static production build and Finder export-security guard. Verify **25 public properties, 2 accommodations, 377 CMS images and 418 public assets**. Stop for missing content, failed downloads or unexpected reductions.
3. Independently verify each CMS URL, titles/descriptions, featured/gallery images and existing public routes/assets. Confirm navigation and the four-column footer/account links. A framework page count alone does not prove completeness.
4. Run `node --import tsx --test tests/*.test.ts`, `npx tsc --noEmit`, relevant ESLint and production Pages Functions compilation. Check generated files for inventory/credentials and Git changes for private files or unrelated work.
5. Stage only intended source/docs/tests plus the **entire regenerated `out/`**, including old hashed-file deletions. Commit/push to `origin/main` only within the approved scope. Let the existing Pages integration deploy; stop on build/deployment failure.

## Immediate production acceptance

Wait for the exact commit's Pages deployment to succeed. Confirm public pages, all CMS routes/content and representative images; compare deployed static chunks with the approved export. Login/registration remain public; registration requires trimmed Full Name and eight password characters, with exact guidance **Must be 8 characters or more.**

Without cookies, search serves a generic shell and the inventory API returns HTTP 401 JSON, no Access challenge or listings. Invalid bearer credentials and forged legacy headers/cookies must also fail closed. Private data responses must use no-store browser/CDN headers.

Use the existing real administrator for interactive acceptance: login → account shows Administrator/no subscription required → Finder listings → logout → denial → fresh login. Do not create accounts or paid fixtures without authorization. Unpaid customers must receive no listing data; Basic/Premium boundaries remain tested server-side while `FINDER_CUSTOMER_ACCESS=disabled` blocks all customer listings. No Stripe or paid activation is part of a maintenance deployment.

If a security regression appears, stop and follow the recorded rollback process; never bypass authorization, change private roles or broaden database grants to make tests pass.
