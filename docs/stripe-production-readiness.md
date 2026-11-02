# Stripe membership production preparation — 1 November 2026

**Customer-launch update, 2 November 2026:** the owner has authorized enabling both customer-access gates in Live mode. See [the customer launch record](stripe-customer-launch.md) for the current release and [the earlier Live cutover](stripe-live-deployment.md) for its history. The owner reports the Live webhook enabled and old Sandbox webhook disabled. First real payment and signed-delivery acceptance remain separately authorized work. Migration 009 is already applied; do not replay 008 or 009. The preparation notes below record the earlier, superseded staging state.

## Live configuration preparation — 2 November 2026

The owner reports that the Stripe account is activated and the Live products, prices and both Portals are configured. All six supplied IDs are saved in **`wrangler.live.jsonc`**, a prepared, non-default configuration for review. **`wrangler.jsonc` is unchanged and continues to select administrator-only Sandbox.** The prepared file preserves all other settings, selects Live mode with Sandbox disabled, and keeps customer access disabled. It is not selected by the existing build/deployment workflow and must not be used for a direct deployment. At a separately approved cutover, merge its reviewed production variable changes into the default JSONC, checking other settings for drift.

The supplied objects have **not been authenticated against Stripe**. Local identifier/configuration checks and fixture tests do not prove provider state. No new products, prices, configurations or customers were created. No application logic change is necessary: the deployed validators already enforce the required catalog, Portal, mode and Checkout restrictions.

Local validation passed: Wrangler parsed the default and prepared configurations; all six supplied IDs match exactly; every other default/production binding and build setting is preserved except the intended Live mode/Sandbox flags; both customer access flags remain disabled; no secret bindings have values in either file. **48 targeted billing API/catalog/model/UI and Finder security tests passed**, including product/amount/mode rejection, Premium-only target restrictions, immediate invoiced proration, unchanged billing anchor, fixed no-tax Checkout totals, administrator protection and read-only Live preflight. These tests use fixtures, not authenticated Live provider responses. The default JSONC, application source, SQL, CMS workflow and tracked `out/` remain unchanged; nothing was committed, pushed or deployed.

Sandbox safeguard release `ed4332e7b86ef44b126b9a93b771e9b86d2e1312` completed successfully through GitHub → Cloudflare Pages. The owner subsequently confirmed administrator sign-in, free Property Finder access, the Sandbox billing interface and the administrator configuration check all pass.

The current integration retrieves **configured** prices and Portal configurations and validates their mode, product relationships, amounts, intervals and restrictions. It does not enumerate the catalog or select IDs automatically. `/api/billing/status?check=configuration` validates the currently configured mode only: while production remains Sandbox, it cannot inspect Live objects or accept arbitrary Live IDs. Do not switch the runtime just to collect these IDs.

No Stripe connector, installed Stripe CLI, process-environment Live API credential or connected browser is available in this session. The existing encrypted Pages Sandbox credentials are not a Live discovery mechanism. No API key, webhook secret or new plugin is needed in chat to complete the Dashboard inspection below. An attempted read-only Supabase snapshot was unavailable because the connector's OAuth token refresh failed; no database writes were attempted, and current hosted state was not revalidated during this preparation. The last successful deployment checks confirmed mode `test`, customer access false, administrator access and preserved Sandbox records.

These **six non-secret owner-supplied Live IDs** are staged, without changing `wrangler.jsonc`:

```text
STRIPE_BASIC_PRODUCT_ID=prod_VXtd0bhZkd700E
STRIPE_BASIC_PRICE_ID=price_1UXHlkJ3TzZmDKTSP9zyho82
STRIPE_PREMIUM_PRODUCT_ID=prod_VXteQEfIzveRCC
STRIPE_PREMIUM_PRICE_ID=price_1UXHloJ3TzZmDKTSJS8D3Ge0
STRIPE_PORTAL_CONFIGURATION_ID=bpc_1UXJ06J3TzZmDKTSErM3ocWM
STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID=bpc_1UXJ0tJ3TzZmDKTSKIQHEpYG
```

The Product IDs are identical to the IDs in the existing Sandbox configuration. This is not proof of a mismatch or of a valid Live mapping: require authenticated `livemode=true` and each returned price's exact `product` relationship before acceptance. Inspect the already-supplied candidates using these four GET requests in the intended Live account's Workbench Shell; they use the application's pinned API version and do not mutate objects:

```sh
stripe get /v1/prices/price_1UXHlkJ3TzZmDKTSP9zyho82 --live --stripe-version=2026-07-29.dahlia
stripe get /v1/prices/price_1UXHloJ3TzZmDKTSJS8D3Ge0 --live --stripe-version=2026-07-29.dahlia
stripe get /v1/billing_portal/configurations/bpc_1UXJ06J3TzZmDKTSErM3ocWM --live --stripe-version=2026-07-29.dahlia
stripe get /v1/billing_portal/configurations/bpc_1UXJ0tJ3TzZmDKTSKIQHEpYG --live --stripe-version=2026-07-29.dahlia -d 'expand[]=features.subscription_update.products'
```

1. Select the intended Stripe account in **Live** mode. In **More → Product catalog**, open each existing membership. Copy its Product ID and the Price ID of its active, flat-rate, licensed, quantity-one **JPY monthly** price. Confirm Basic is ¥2,000 and Premium ¥4,000, interval count one, and each price belongs to the corresponding product. Product names or a `prod_`/`price_` prefix alone do not prove the mode. In Workbench Inspector, the object should show `livemode=true`.
2. In **Settings → Billing → Customer portal**, inspect the existing default Live settings. Additional configurations may be API-managed and absent from the default settings screen. Inventory existing configurations before creating or changing anything; do not copy/recreate the already-existing products. Stripe supports [multiple Portal configurations through its API](https://docs.stripe.com/customer-management/integrate-customer-portal).
3. Open **Developers → Workbench → Shell** in the Live account. Run this read-only list request (no key needs to be pasted). Stripe documents that [Workbench Shell is read-only in Live mode](https://docs.stripe.com/workbench/shell):

   ```sh
   stripe get /v1/billing_portal/configurations --live --stripe-version=2026-07-29.dahlia -d limit=100
   ```

   Check both default and non-default configurations. If `has_more=true`, repeat with `-d starting_after=<last returned configuration ID>` until all pages are inspected. See the [list API](https://docs.stripe.com/api/customer_portal/configurations/list). For each likely match, retrieve it with the catalog expanded, replacing the example ID below with the actual result:

   ```sh
   stripe get /v1/billing_portal/configurations/bpc_REPLACE --live --stripe-version=2026-07-29.dahlia -d 'expand[]=features.subscription_update.products'
   ```

   If a Shell command is unavailable for the account, use Workbench API Explorer with **GET**, the same resource/path, parameters and version. Do not issue POST, save modified Portal settings, open a customer Portal session or create a payment for this inspection.
4. Return only the six IDs plus each price's non-secret `product`, `active`, `livemode`, `currency`, `unit_amount`, `recurring` and `tax_behavior` fields; for Portal candidates return `id`, `active`, `livemode` and the expanded `features` object. Do not copy API keys, signing secrets, request headers or customer data. If a matching Portal does not exist, report that slot as missing; creating/configuring one is a separate next step, not part of this read-only collection.

Reuse an existing **active Live management** configuration only if `subscription_update.enabled=false`, invoice history and payment-method updates are enabled, and cancellation is enabled with `mode=at_period_end`. Reuse a **different active Live upgrade** configuration only if it also enables invoices/payment methods/end-of-period cancellation and allows `price` updates alone, targeting only the Live Premium product and price, with `proration_behavior=always_invoice`, an unchanged/omitted billing-cycle anchor, and no scheduling conditions or only `decreasing_item_amount`. Downgrades remain application-managed. One Portal ID cannot satisfy both the required enabled and disabled subscription-update settings.

Stripe Tax remains disabled. The current validator accepts `tax_behavior=inclusive` or `unspecified` and rejects `exclusive`; `unspecified` alone is not a reason to replace an existing price. Checkout disables automatic tax, manual extra rates, Adaptive Pricing and promotions, and validates the exact ¥2,000/¥4,000 starting totals before exposing a payment URL. Existing upgrade proration remains separate from the advertised monthly amounts. No runtime/database mode, secrets, purchasing gates or Stripe objects were changed, and no build/deployment/payment was initiated during this collection review.

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

All six Live IDs are supplied and staged above; authenticated validation is still required. Reuse those existing objects if they pass; do not create replacements or substitute Sandbox IDs/synthetic fixtures. No new product/price is needed merely because tax behavior is `unspecified`: both `unspecified` and `inclusive` are accepted. Stripe Tax stays off. Checkout explicitly disables automatic tax, Adaptive Pricing and promotion codes, supplies no manual tax/shipping rates, and returns a new/reused payment URL only if the JPY subtotal and total equal exactly ¥2,000 or ¥4,000 with zero added tax/discount/shipping. Upgrades retain the approved prorated charge behavior.

In Stripe Dashboard **Live mode → Developers → Workbench → Webhooks**, inspect existing destinations first. Reuse a matching dedicated Live destination or, if missing, create one after authorization. It must be a **Snapshot** destination for **Your account** (not Connect/organization or Thin events) at:

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

Preserve existing encrypted Supabase publishable/Auth-cookie and alerts bindings. The Live key and signing secret remain unconfigured/unverified in this task. When separately authorized, use **Cloudflare Dashboard → Workers & Pages → livelove → Settings → Variables and Secrets → Production**, enter the two Stripe values as encrypted **Secret** bindings, and coordinate them with the approved cutover/deployment. Keep preview/default billing disabled. The existing Supabase billing secret stays unchanged. This hosted Checkout integration does not need a new Stripe publishable-key binding. No secret is to be pasted into chat, a command argument, frontend variables, source files, artifacts or logs.

## Activation sequence — requires later explicit authorization

1. **Completed for database migration 009:** inspected relevant schema drift and revocations, applied 009 once with owner approval and ran both verifiers. The Sandbox application safeguards were subsequently deployed and accepted. See the receipt and recovery-evidence limitation above. Do not replay 009 or 008. Reconnect read-only Supabase access and recheck the expected 009 hash, administrator permissions, mode `test`, disabled customer gate, leases and Sandbox/live records before a separately approved Live activation. No Live database operation is authorized now.
2. Authenticate and validate the supplied Live catalog and both Portal configurations, then prepare the matching disabled Live webhook destination above. Disable the Sandbox destination before switching the shared endpoint. Retain existing Sandbox subscriptions and clearly marked test history without modifying them or copying them into Live rows. Any future cancellation/cleanup of test subscriptions is a separate authorized action.
3. Pause runtime billing during the configuration switch and wait for leases to clear. Any deployment of this temporary flag must also use the complete CMS workflow in step 6. Leave both customer gates disabled. The setup interval is unavailable for purchasing; do not attempt to run test and live mode concurrently against the same global database mode.
4. For the coordinated final deployment, merge the reviewed `wrangler.live.jsonc` production variable changes into `wrangler.jsonc`: `FINDER_BILLING_ENABLED="enabled"`, `FINDER_STRIPE_MODE="live"`, `FINDER_BILLING_SANDBOX_ENABLED="disabled"`, all six verified Live IDs, preserved `FINDER_AUTH_ENABLED="enabled"`, the production origin and `FINDER_CUSTOMER_ACCESS="disabled"`. Recheck unrelated settings for drift against the then-current default config. Configure the two matching Stripe secrets in encrypted Pages Production settings. Never place credentials in JSONC, and do not deploy directly from the prepared file.
5. As the approved operator, run the guarded `009_enable_stripe_live.sql` transaction. It leaves database customer access false. Coordinate this with the matching runtime deployment; no customer purchasing may be enabled while the two modes differ.
6. When deployment is authorized, inventory all current published CMS records/assets, run the established full **`npm run build`** including CMS downloads, independently verify every CMS URL/title/description/featured/gallery asset and preserve prior routes/assets. Commit/push the complete tracked **`out/`** and source through the existing GitHub → Cloudflare Pages workflow. Remote Pages remains `npm ci`, output `out`; it does not replace the local CMS build. Stop for missing content/assets.
7. Verify the exact deployed revision, encrypted secret names/types, production flags, Auth and free administrator access. As an existing administrator, open `/api/billing/status?check=configuration`; require `configurationValid=true` and `sandbox=false`. This can validate real Live settings while customer purchasing is still closed.
8. Enable the matching Live destination and verify signed Live delivery, retry/idempotency handling and monitoring/redelivery procedures. Do not send fake paid events or fabricate membership rows. Unexpected refunds/disputes require the existing reviewed operator/recordkeeping process; no automated refund feature was added.
9. Only after explicit customer-launch approval, enable **both** `FINDER_CUSTOMER_ACCESS="enabled"` in JSONC and `finder_security.saved_api_settings.customer_access_enabled=true` through the approved operator procedure. Publish any source change with another complete CMS build/export. Complete owner-authorized ordinary-customer purchase/access acceptance; administrator testing cannot prove paid customer restrictions because administrators have free access. No Live charge is authorized by this document.

## Remaining blockers

Correction 009 is applied and verified, and all six Live IDs are staged, but **Live activation is not yet ready**: obtain authenticated validation of the supplied prices/Portals; verify the dedicated Live Snapshot destination and all 19 events; configure the matching Live server key and destination signing secret as encrypted Pages Production bindings only after authorization; reconnect/recheck Supabase; and coordinate the approved database mode operation with the full CMS deployment. Both customer launch gates must remain disabled through configuration verification. Enabling customer purchasing and ordinary-customer Live payment acceptance need separate authorization. The running release remains Sandbox-only. Monitor failed deliveries and use Stripe redelivery for event loss; no background reconciliation scheduler has been added. Missed renewal/cancellation events still cannot extend paid access beyond the server-enforced paid-through timestamp.
