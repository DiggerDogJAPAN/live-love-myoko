# Live customer membership launch — 2 November 2026

The owner explicitly authorized opening customer purchasing for **Basic ¥2,000/month** and **Premium ¥4,000/month, tax included**. A first real customer payment and Live webhook delivery will be separately authorized and monitored. No customer, Checkout session, subscription or payment is created by this release's verification.

## Authorized changes

- Production `FINDER_CUSTOMER_ACCESS=enabled` in the active `wrangler.jsonc`; its Live reference copy matches. Default/preview customer access and billing remain disabled. Live mode, Sandbox disabled, all six Stripe IDs, domain, Supabase Auth and encrypted bindings are preserved.
- The operator-only `sql/operations/enable_live_customer_memberships.sql` enables only `finder_security.saved_api_settings.customer_access_enabled`. It follows the existing guarded operator pattern: expected postgres/project database, applied 009 function hash, Live mode, a previously closed gate, forced RLS/ownership and no active billing lease. It refuses replay and drift. No customer-launch SQL file previously existed; no schema migration was needed or replayed.
- Membership page introduction/metadata now explicitly offers both tax-inclusive monthly plans through the account page. Registration still neither grants listing access nor starts a subscription. Actual purchase actions remain authenticated, explicit account-page actions.

## Security and verification

- **257 tests passed**, including a new guarded SQL activation test proving that opening the gate changes no roles/memberships/billing records and still denies an unpaid customer, while administrators retain free access. The guard also refuses non-Live mode, missing forced RLS and replay.
- New fixture-only Live API acceptance covers Basic and Premium with both gates open, exact JPY totals, disabled automatic tax and explicit quantity one. Either closed gate rejects Checkout before billing/provider mutations. Merely starting Checkout grants no membership. No real provider is contacted by these tests.
- Existing SQL/RLS, verified Supabase sessions, paid/active/unrevoked membership requirements, strict paid-through expiry, Basic/Premium feature separation, sticky manual revocations, webhook signature/idempotency and canonical reconciliation remain unchanged. Administrators require no paid subscription and cannot buy Live memberships.
- TypeScript, changed-file ESLint, Pages Functions compilation, Wrangler parsing and the static-export security guard passed. The only runtime configuration difference is the production customer-access flag. No credential values were logged or changed.
- The existing verified-TLS postgres connection provides before/after fingerprints. Migrations 008 and 009 are already recorded once and their security verifiers pass; they must not be replayed. The database operation's private receipt verifies only the rollout flag changed; administrator roles, memberships, Sandbox billing state and events remain intact.

## Complete CMS export

The full established `npm run build` ran with CMS asset downloads. Independent unlimited inventory and source-byte checks verified **25 published properties, 2 accommodations, 27 detail URLs, 40 CMS description fields and 377 images**. All **51 previous HTML routes, 418 public assets, 410 image blobs and 442 local references** are preserved. Only the intended membership-page metadata changed. CMS database/configuration fingerprints are unchanged. Release the complete tracked `out/` through existing GitHub `main` → Cloudflare Pages (`npm ci`, output `out`), never a partial/direct upload.

## Production acceptance and first payment boundary

Verify the exact canonical revision, Live mode, Sandbox off, runtime customer access enabled and database gate true. Verify public membership prices/tax wording, current pages/assets, Auth endpoints, anonymous billing rejection and unsigned webhook rejection. Read-only database checks must confirm free administrator eligibility and no changes to protected records. The final task report records the actual revision and verification outcome.

No authenticated customer session is connected to the agent. Eligible-customer purchasing is established by both deployed gates and fixture route checks; an actual hosted Checkout/payment is deliberately deferred. An existing administrator can confirm sign-in/free Finder and run the read-only `/api/billing/status?check=configuration` by pasting its URL into the same browser's address bar (external chat navigation can be rejected by the origin guard). This check must return `enabled=true`, `sandbox=false`, `configurationValid=true` and never starts billing.

The owner reports the Live webhook enabled, old Sandbox webhook disabled and all 19 handlers tested. The [webhook readiness review](stripe-live-webhook-readiness.md) records the earlier application-side audit and its limits. A real Live signing-secret match, signed delivery and paid-subscription synchronization will be established during the separately authorized first customer payment. Do not generate a payment or subscription merely to complete this deployment's checks; do not weaken any authorization or signature check.
