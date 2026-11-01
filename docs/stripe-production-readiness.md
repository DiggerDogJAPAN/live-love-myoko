# Stripe membership production preparation — 1 November 2026

**Migration 009 applied with owner approval; the owner has authorized the completed application safeguards for a Sandbox-only release.** Live purchasing remains blocked until the activation requirements below are completed. The website retains administrator-only Sandbox on `https://love-live-myoko.com`, using the existing Supabase Auth project. Live activation is not authorized.

## Sandbox safeguard release validation — 1 November 2026

- Retained **`wrangler.jsonc` byte-for-byte against the previous production revision**; the proposed TOML conversion was withdrawn. Auth remains enabled, billing enabled, Stripe mode `test`, Sandbox enabled and customer access disabled. All six Sandbox IDs and existing settings are preserved; no secrets are stored in configuration.
- All **255 security, billing, authorization and application tests passed**. TypeScript, changed-file ESLint, Cloudflare Pages Functions compilation and the static-export security guard passed.
- Ran the complete established **`npm run build`**, including CMS asset downloads. An independent unlimited inventory stayed unchanged during the build: **25 published properties, 2 accommodations, 27 detail URLs, 40 description fields and 377 CMS images**, all verified against their source content/bytes.
- Verified **all 51 previous production HTML routes, 418 public assets, 410 production image blobs and 442 local HTML references**. No CMS metadata changes or missing content/assets were found. Directus database/configuration fingerprints are unchanged.
- The source and entire regenerated tracked `out/` are released through existing GitHub `main` → Cloudflare Pages, remote `npm ci` and output `out`. No migration command is part of this deployment; do not replay 008 or 009. The final task report identifies the exact commit and deployment result.
- Read-only preflight confirmed production mode `test`, customer access false, the approved 009 function hash, one active verified administrator, no real memberships or Live billing customers, and one existing Sandbox customer. Existing encrypted Cloudflare bindings are present; no secret or subscription changes are included.
- No signed-in browser is connected to the agent. Deployed Auth endpoints, protected anonymous denial, administrator database authorization, Sandbox client assets and revision/configuration can be checked independently; a fresh administrator login and account-screen acceptance must be completed in the owner's browser. Do not create credentials, bypass authentication or make a payment for this check.

## Step 1 production migration receipt — 1 November 2026

- With explicit owner approval, applied `sql/proposals/009_finder_billing_revocation.sql` once to existing project `fgdoqsepihlzfqlqymet`, as migration **`20261101130422_finder_009_billing_revocation`**. Migration history contains one 009 entry. Migration 008 was not replayed.
- Before application, inspected billing/membership/role/settings table structure, ownership, forced RLS, ACLs and constraints. All four billing RPC body hashes matched migration 008; its security verifier passed. Found **zero membership rows, zero revocations, zero Live billing customers and zero active leases**, with one existing Sandbox customer. No unexpected billing schema state was found.
- Saved pre-change function definitions, owner/ACL metadata and protected-data fingerprints to `/tmp/livelove-009-before-production.json` for scoped recovery/audit. Prior documentation records owner-confirmed completed, restorable managed backups dated 27/28 October; their current availability and a newer full-project recovery point were not independently revalidated through this connection. The function snapshot is not a full-database backup.
- After application, **009's complete read-only verifier and the existing 008 security verifier both passed**. The installed apply-function body hash is `e0ae4a00ecd2a51afc1bff08b97d509a`, exactly matching the tested correction. Other billing function bodies, ownership, ACLs and security settings are unchanged.
- Before/after fingerprints match for Auth account eligibility, administrator/customer roles, memberships, billing customers/state, event receipts and both billing/customer-access settings. Database mode remains **`test`**, customer access remains **false**, and the existing Sandbox subscription data is unchanged.
- Re-ran **13 isolated SQL migration tests; all passed**, including manual revocation surviving a paid refresh, failed renewal and later successful payment. Production confirmation uses the exact installed function hash and read-only security checks; no fake memberships, payments or reconciliation writes were introduced in production.
- No Stripe mode/secret changes, customer launch, source commit, push, website build or deployment occurred during the migration-only step. The owner subsequently authorized the Sandbox-only application release recorded above.

## Verification and findings

| Requirement | Evidence / result |
| --- | --- |
| Basic / Premium / administrator authorization | PostgreSQL verifies a real active Supabase session, verified active account and private role on protected RPC calls. Basic permits Finder search/listings; Premium additionally permits saves and alerts. Administrators retain free access independently of Stripe. Browsers cannot write membership, roles or billing tables. Existing RLS, SQL-owner and narrow service-RPC grants are preserved. |
| Expiry without webhooks | Every protected permission decision requires `paid_through > clock_timestamp()`. New SQL tests deny Basic and Premium at the paid boundary even when stored billing state still says active and no webhook runs. Model tests also cover the exact boundary and delayed cancellation. No cron job or browser refresh is required to enforce that boundary. |
| Failed / expired payments | Only matching paid invoice and Stripe PaymentIntent allocation evidence can extend the paid period. Failed renewals cannot extend it. Failed upgrades preserve only the remaining already-paid Basic time. Inactive, unpaid, expired, paused, trialing and revoked states do not provide new access. |
| Manual revocation | **Correction 009 applied and verified:** Finder 008 could clear `revoked_at` during a later paid reconciliation. Forward migration 009 preserves operator revocations, separates automatic nonpayment from manual revocation and rechecks account eligibility before applying a leased result. Regression tests demonstrate the old failure and the correction; the installed function matches that tested correction. |
| Webhooks | Raw bytes, HMAC SHA-256 signature, five-minute timestamp tolerance, pinned API version, resource shape, own-account context and test/live mode are checked. Unknown customers cannot create mappings from metadata. Mode-scoped event receipts deduplicate retries; leases fence stale writers. Signed events trigger current canonical Stripe reads, not entitlement changes from stale event bodies. |
| Portal / supported actions | Owner-reported Sandbox acceptance passed Basic purchase, Premium upgrade, downgrade, cancellation and paid-through access. Tests cover fixed Premium-only confirmation, immediate invoiced proration, no client-selected IDs, unchanged billing anchor, scheduled cross-product downgrade, release/cancel/replacement and management Portal restrictions. Pending downgrades must be removed before Portal subscription cancellation; the account explains this. No new payments were made during preparation. |
| Sandbox / Live isolation | Key prefixes, provider object mode, signed event mode, RPC mode, customer mappings, subscription uniqueness, event IDs and foreign keys are mode-scoped. Test records cannot write real memberships. Tests include colliding provider identifiers in different modes and reject stale-mode writes. The same project supports **one active billing mode at a time**; simultaneous Sandbox and Live runtimes require separate infrastructure or a separately reviewed design. |

The initial read-only production snapshot showed database mode `test`, customer access false, zero memberships and zero live billing rows. The existing test subscription was Premium with end-of-period cancellation and paid access through 1 December 2026. Processed Sandbox receipts included Checkout completion, paid invoices and schedule release. These facts were inspected without changing them; the owner supplied the broader Sandbox acceptance results. Destination configuration and Live provider objects have not been independently validated during this preparation.

## Validation performed

- The initial **119 targeted tests passed, zero failures**; the authorized release subsequently passed all **255 tests**, as recorded above. Provider/payment cases use synthetic fixtures; no additional Stripe sessions, subscriptions or payments were created.
- TypeScript `tsc --noEmit`, ESLint on changed TypeScript files and the Cloudflare Pages Functions bundle compilation passed.
- The existing 008 read-only verifier passed against production. Deployed account snapshot, account RPC and protected property RPC function bodies matched the reviewed source. Migration 009 was subsequently approved, applied and verified as recorded above. The Live mode operation remains tested only in the isolated SQL fixture and was not run against production.
- Wrangler's installed parser confirmed the production values with the retained JSONC. `git diff --check` passed. Package/build configuration and the CMS download script are unchanged. The release regenerates the complete `out/` through that workflow, as recorded above.

## Local changes

- Retained the existing `wrangler.jsonc` format at the owner’s deployment request; no technical reason requires TOML. All existing settings are unchanged and production still selects Sandbox. No keys or signing secrets are in JSONC. Existing Auth/alerts credentials are unchanged.
- Prepared and, after separate approval, applied `sql/proposals/009_finder_billing_revocation.sql` and ran its read-only verifier. The migration changes only the existing billing apply function, preserves owner/ACL/RLS settings and refuses drift/replay. It seeds, deletes and reactivates no records. Existing live billing revocations require explicit operator review rather than guessing their origin. Applied migration 008 is untouched.
- Automatic expiry/nonpayment in 009 changes account/payment/status fields but does not create an operator revocation. Only an explicitly approved operator can clear a manual `revoked_at`; a later valid paid reconciliation can then recover access. Normal billing recovery is still automatic when no operator revocation exists.
- The server rejects new Live Checkout and upgrade actions for a revoked customer before any billing lease/provider call. Existing management/cancellation remains available so a revoked customer can close their subscription; revocation itself does not cancel Stripe billing automatically.
- Prepared `sql/operations/009_enable_stripe_live.sql`. It requires the corrected function, existing operator, mode `test`, customer gate off, no active leases and no existing live billing mappings. It changes only database billing mode; it does not verify credentials or enable customer access. It has been exercised only in an isolated test database.
- Extended the existing administrator read-only configuration check to work in either mode. After deployment, `/api/billing/status?check=configuration` verifies both prices and both Portal configurations without a billing lease, customer mapping, session, subscription, invoice or payment. Non-administrators cannot use it. Administrators still cannot buy live subscriptions.

## Required Live catalog and destinations — not created now

Create or select active **Live** objects in the intended Stripe account, independently of the Sandbox objects:

| Wrangler variable | Required Live object |
| --- | --- |
| `STRIPE_BASIC_PRODUCT_ID` | Basic Membership product |
| `STRIPE_BASIC_PRICE_ID` | That product's JPY 2,000 recurring monthly, interval count one, licensed price |
| `STRIPE_PREMIUM_PRODUCT_ID` | Separate Premium Membership product |
| `STRIPE_PREMIUM_PRICE_ID` | That product's JPY 4,000 recurring monthly, interval count one, licensed price |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Management-only configuration: subscription updates disabled; invoices, payment methods and end-of-period cancellation enabled |
| `STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID` | Separate configuration: price-only updates targeting only Premium's product/price, quantity one, `always_invoice`, unchanged billing anchor; no scheduling rule or only `decreasing_item_amount`; invoices/payment methods/end-of-period cancellation enabled |

All six Live IDs are still required. Do not substitute Sandbox IDs or synthetic test fixtures. No new product/price is needed merely because tax behavior is `unspecified`: both `unspecified` and `inclusive` are accepted. Stripe Tax stays off. Checkout explicitly disables automatic tax, Adaptive Pricing and promotion codes, supplies no manual tax/shipping rates, and returns a new/reused payment URL only if the JPY subtotal and total equal exactly ¥2,000 or ¥4,000 with zero added tax/discount/shipping. Upgrades retain the approved prorated charge behavior.

Create a separate **Live Snapshot** webhook destination for own-account events at:

`https://love-live-myoko.com/api/billing/webhook`

Pin it to **`2026-07-29.dahlia`**, matching the server API version. Register these 19 events and keep the destination disabled until the matching runtime and database mode are ready:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.pending_update_applied
customer.subscription.pending_update_expired
invoice.paid
invoice.payment_failed
invoice.payment_action_required
invoice.voided
invoice.marked_uncollectible
subscription_schedule.created
subscription_schedule.updated
subscription_schedule.released
subscription_schedule.canceled
subscription_schedule.completed
subscription_schedule.aborted
```

Thin events, a different version, Connect/organization contexts or a Sandbox signing secret are incompatible. Stripe retries can arrive late or out of order, which is why the application reconciles current state and treats paid-through expiry independently. See [Stripe webhook guidance](https://docs.stripe.com/webhooks).

## Cloudflare secrets — never put values in JSONC or Git

For Pages project `livelove`, Production:

| Secret | Activation requirement |
| --- | --- |
| `STRIPE_SECRET_KEY` | Replace Sandbox key with the intended account's Live server key (`sk_live_…`) only after authorization |
| `STRIPE_WEBHOOK_SECRET` | Matching Live destination's `whsec_…`; not the Sandbox or local CLI secret |
| `FINDER_BILLING_SUPABASE_SECRET_KEY` | Keep the authorized server API secret for existing project `fgdoqsepihlzfqlqymet`; no new database/password/crawler credential is required |

Preserve existing encrypted Supabase publishable/Auth-cookie and alerts bindings. The Live key and signing secret remain unconfigured/unverified in this task. No secret is to be pasted into chat, a command argument, frontend variables, source files, artifacts or logs.

## Activation sequence — requires later explicit authorization

1. **Completed for database migration 009:** inspected relevant schema drift and revocations, applied 009 once with owner approval and ran both verifiers. See the receipt and recovery-evidence limitation above. Do not replay 009 or 008. Application/source release approval and the subsequent Live activation steps remain pending.
2. Finish the Live catalog, both Portal configurations and disabled Live webhook destination above. Resolve/retain Sandbox subscriptions appropriately and disable the Sandbox destination before switching the shared endpoint. Retain clearly marked test history; do not copy it into live rows or seed paid memberships.
3. Pause runtime billing during the configuration switch and wait for leases to clear. Any deployment of this temporary flag must also use the complete CMS workflow in step 6. Leave both customer gates disabled. The setup interval is unavailable for purchasing; do not attempt to run test and live mode concurrently against the same global database mode.
4. For the coordinated final deployment, set `FINDER_BILLING_ENABLED="enabled"`, `FINDER_STRIPE_MODE="live"`, `FINDER_BILLING_SANDBOX_ENABLED="disabled"` in `wrangler.jsonc` production variables, replace all six IDs with their actual Live counterparts and preserve `FINDER_AUTH_ENABLED="enabled"`, the production origin and `FINDER_CUSTOMER_ACCESS="disabled"`. Configure the two matching Stripe secrets in encrypted Pages Production settings. Never place credentials in JSONC.
5. As the approved operator, run the guarded `009_enable_stripe_live.sql` transaction. It leaves database customer access false. Coordinate this with the matching runtime deployment; no customer purchasing may be enabled while the two modes differ.
6. When deployment is authorized, inventory all current published CMS records/assets, run the established full **`npm run build`** including CMS downloads, independently verify every CMS URL/title/description/featured/gallery asset and preserve prior routes/assets. Commit/push the complete tracked **`out/`** and source through the existing GitHub → Cloudflare Pages workflow. Remote Pages remains `npm ci`, output `out`; it does not replace the local CMS build. Stop for missing content/assets.
7. Verify the exact deployed revision, encrypted secret names/types, production flags, Auth and free administrator access. As an existing administrator, open `/api/billing/status?check=configuration`; require `configurationValid=true` and `sandbox=false`. This can validate real Live settings while customer purchasing is still closed.
8. Enable the matching Live destination and verify signed Live delivery, retry/idempotency handling and monitoring/redelivery procedures. Do not send fake paid events or fabricate membership rows. Unexpected refunds/disputes require the existing reviewed operator/recordkeeping process; no automated refund feature was added.
9. Only after explicit customer-launch approval, enable **both** `FINDER_CUSTOMER_ACCESS="enabled"` in JSONC and `finder_security.saved_api_settings.customer_access_enabled=true` through the approved operator procedure. Publish any source change with another complete CMS build/export. Complete owner-authorized ordinary-customer purchase/access acceptance; administrator testing cannot prove paid customer restrictions because administrators have free access. No Live charge is authorized by this document.

## Remaining blockers

Correction 009 is applied and verified, but **Live activation is not yet ready**: all six Live IDs, Live API key and matching destination secret must be supplied/validated; the Live destination and runtime/database alignment must be verified; and ordinary-customer launch/payment acceptance needs separate authorization. The authorized application release above remains Sandbox-only. Monitor failed deliveries and use Stripe redelivery for event loss; no background reconciliation scheduler has been added. Missed renewal/cancellation events still cannot extend paid access beyond the server-enforced paid-through timestamp.
