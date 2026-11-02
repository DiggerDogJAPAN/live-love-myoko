# Stripe Live configuration cutover — 2 November 2026

The owner authorized the Live runtime/database transition with **customer purchasing disabled**. Creating subscriptions, initiating payments, opening customer access and enabling the Live webhook are excluded from this release.

## Release configuration and safeguards

The active `wrangler.jsonc` uses the six reviewed owner-supplied IDs from `wrangler.live.jsonc`, `FINDER_BILLING_ENABLED=enabled`, `FINDER_STRIPE_MODE=live`, `FINDER_BILLING_SANDBOX_ENABLED=disabled` and `FINDER_CUSTOMER_ACCESS=disabled`. Default/preview billing remains disabled. All other Auth, domain, compatibility and build settings are preserved. Administrators retain free Property Finder access and cannot purchase Live subscriptions. Normal customer Checkout requires both the runtime and database customer-access gates to be enabled; both remain closed.

The owner replaced the two encrypted Pages Production Stripe secrets with the Live key and new Live destination's signing secret. The Supabase billing secret and all other encrypted bindings remain unchanged. The agent inspected binding names/types only and neither read nor replaced their values. Stripe Tax remains disabled; existing Checkout validation requires exact JPY 2,000/4,000 starting totals, with no added tax, shipping or discount. Existing upgrade proration is unchanged.

No application logic changes or migration replays are included. The existing administrator-only `GET /api/billing/status?check=configuration` validates both prices and both Portal configurations using the deployed credentials, without creating a customer, session, subscription, invoice or payment. Require `configurationValid=true` and `sandbox=false` after deployment; a failure blocks opening memberships. The configuration requires Premium-only price updates, `always_invoice` proration and an unchanged billing cycle, with the tested decrease-only scheduling exception.

## Preflight and full CMS export

- The Supabase connector could not refresh OAuth. The existing private database transport succeeded with **verify-full TLS**, the independently expected project `fgdoqsepihlzfqlqymet` and existing `postgres` operator; no credentials were exposed or weakened.
- Migration history contains 008 and 009 exactly once. Both read-only security verifiers passed; the installed 009 apply-function hash is `e0ae4a00ecd2a51afc1bff08b97d509a`. Before cutover, mode was `test`, customer access false, with one eligible administrator, one Sandbox billing customer, zero real memberships, zero Live billing customers and zero active leases.
- **255 tests passed**, including billing, authorization, security, webhook/mode isolation and customer launch guards. TypeScript, changed-file lint, Pages Functions compilation, Wrangler configuration checks and the export-security guard passed. Provider/payment test calls use fixtures only.
- Ran the complete established **`npm run build`**, including CMS asset downloads. Independently verified 25 published properties, 2 accommodations, 27 detail URLs, 40 CMS description fields and **all 377 CMS images against source bytes**. The published inventory stayed unchanged during the build.
- All **51 previous HTML routes, 418 public assets, 410 production image blobs and 442 local references** are preserved; no missing CMS content/assets or metadata changes. Directus database/configuration fingerprints are unchanged. The release includes the complete regenerated tracked `out/` through GitHub `main` → Cloudflare Pages (`npm ci`, output `out`), with no direct/partial upload.

## Database cutover and deployment acceptance

With both webhook destinations confirmed disabled by the owner, the exact guarded `sql/operations/009_enable_stripe_live.sql` operation **completed once**. It changed only `finder_security.billing_settings.mode` from `test` to **`live`**, with database customer access still **false**. Immediate before/after fingerprints match for administrator roles, memberships, all Sandbox billing state and event receipts; no new Live customer mappings or memberships were created. Both 008's read-only security verifier and 009's read-only verifier passed again. Migrations 008 and 009 were not replayed.

The old Sandbox destination and new Live destination remain disabled by the owner's confirmation; this release does not enable either. The private local receipt `/tmp/livelove-live-cutover-20261102/database-mode-operation.json` records the verified operation. The final task report supplies the actual commit and hosted verification outcome. Do not replay the mode operation; subsequent checks must be read-only.

After deployment, verify the canonical revision, all production flags and encrypted binding types, protected Auth/billing endpoints, unsigned webhook rejection and current public content/assets. The owner must verify the signed-in administrator screen and read-only Live configuration result because no authenticated browser is connected to the agent. No payment is needed for these checks.

## Remaining steps before customer launch

1. Require successful authenticated Live catalog/Portal preflight, preserved administrator access, closed customer gates and aligned runtime/database `live` mode.
2. Verify the disabled Live destination is **Your account / Snapshot**, endpoint `https://love-live-myoko.com/api/billing/webhook`, API version **`2026-07-29.dahlia`**, and exactly the 19 supported events in [production readiness](stripe-production-readiness.md). Keep the Sandbox destination disabled. Enable Live webhook delivery only after the owner authorizes that next step; verify signing/delivery when real supported events occur. Do not fabricate paid events or membership records.
3. Obtain separate customer-launch approval before enabling **both** `FINDER_CUSTOMER_ACCESS=enabled` and `finder_security.saved_api_settings.customer_access_enabled=true`. Any configuration deployment still requires another full CMS build/export and complete `out/` release. A real customer purchase/charge requires separate authorization; administrator accounts are subscription-free.

Keep all existing Sandbox subscriptions and records intact. Do not copy them into Live mappings or entitlements, cancel them during this release, create new subscriptions or initiate payments.
