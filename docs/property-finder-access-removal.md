# Property Finder — completed Access removal and secret review

## Completed production transition

The owner confirms both dedicated Cloudflare Access applications were manually deleted: the Finder search protection (`/property-finder/search*`) and Finder API protection (`/api/property-finder/*`). Supabase administrator login, the Administrator account dashboard, aggregated listings and logout/fresh login were personally verified without Access. No application or policy was deleted by this cleanup, and shared/unrelated Cloudflare protection was not changed.

Cookie-free live checks independently confirm `/property-finder/search/` returns HTTP 200 without an Access redirect. `GET /api/property-finder/properties` returns HTTP 401 JSON `authentication_required` anonymously, with forged Access JWT/email headers, with a forged `CF_Authorization` cookie, and with an invalid Supabase bearer. The Auth session endpoint also returns HTTP 401 without credentials. Customer listing access remains disabled. Public CMS pages stay public.

The previous incomplete API inventory and manual handoff are superseded by the owner's completion report and these live route checks. They were never a full original Access application/policy backup; the short [cutover and rollback record](property-finder-supabase-cutover.md) states that limit explicitly.

## Exact remaining legacy secret names

| Production binding | Current use | Removal decision |
| --- | --- | --- |
| `FINDER_ACCESS_TEAM_DOMAIN` | No runtime, example-environment or Wrangler dependency | Safe to remove from the current application; retain for the legacy rollback until explicit deletion approval |
| `FINDER_ACCESS_AUD` | No current JWT verification uses it | Retain for legacy rollback; a recreated application may require a different audience |
| `FINDER_ADMIN_EMAILS` | No current administrator allowlist uses it | Retain for legacy rollback until explicit deletion approval |

Presence/type can be checked in Pages production settings without reading encrypted values. This cleanup does **not** delete any production secret or change private local `.dev.vars`. Do not remove Supabase configuration, cookie signing, database bindings, Hyperdrive, WAF, Workers, Pages or Functions.

The entire repository audit found no remaining Access verifier/middleware, required Access variables or old login redirect in current runtime source/configuration. Access names in tests intentionally verify denial; dated crawler handoffs and database receipts are historical evidence, not deployment instructions. Current guides use Supabase only.

## Validation and membership state

Tests cover unpaid/disabled customer denial, Basic/Premium boundaries, invalid/expired/revoked sessions, inactive administrator roles, forged credentials and administrator access without a subscription. Genuine unpaid-customer and administrator production checks must use real existing accounts; do not fabricate paid rows or alter production roles. The owner has confirmed the real administrator flow; the agent's live probes use no credentials and do not claim an authenticated browser test.

Basic is planned at ¥2,000/month; Premium at ¥4,000/month. A private role is independent of `memberships.tier`. Customer access remains `disabled`; billing, Stripe and paid feature activation are outside cleanup.

Every deployment includes a fresh complete CMS export: 25 public properties, 2 accommodations, 377 CMS images, 418 public assets, existing routes/content/navigation and the four-column footer. See the [deployment checklist](property-finder-deployment-checklist.md). Retain rollback secrets until the owner approves their deletion separately.

Cleanup validation: 121 automated tests, TypeScript, relevant ESLint, the complete CMS production build, export security guard and production Pages Functions compilation passed. Independent output checks preserved all required CMS counts, 67 CMS text fields, all 48 baseline HTML paths and 432 internal references. Changed documentation links and private-runtime-value/file-path scans passed. The cleanup changes documentation and regenerated static output only; runtime/configuration, production secrets, database and crawler files remain unchanged.
