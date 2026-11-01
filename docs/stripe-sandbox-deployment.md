# Administrator-only Stripe Sandbox deployment — 1 November 2026

## Basic purchase and Premium upgrade validation correction

The owner completed one Basic Sandbox purchase for ¥2,000/month. Read-only production checks confirmed exactly one test subscription, active paid Basic state, a paid-through boundary of 1 December 2026, and successfully processed `invoice.paid` and `checkout.session.completed` receipts. No real memberships or live billing records exist; administrator role fingerprints and disabled customer-access settings remain unchanged.

The failed Premium request returned `billing_portal_configuration`. The owner supplied the matching Stripe Workbench configuration response: immediate invoiced proration and the unchanged billing anchor were correct, but the catalog was omitted from the unexpanded response and a `decreasing_item_amount` schedule rule was present. Stripe's product catalog is an expandable field, so the upgrade configuration read now explicitly requests `expand[]=features.subscription_update.products`. See the [Stripe API object](https://docs.stripe.com/api/customer_portal/configurations/object) and the corresponding [catalog-expansion issue in Stripe's repository](https://github.com/stripe/terraform-provider-stripe/issues/54).

The validator permits the single decrease-only rule for this fixed quantity-one, JPY 2,000 Basic → JPY 4,000 Premium increase. That condition is false for this upgrade. It still requires the configured Premium product/price as the only target, price-only changes, `always_invoice` proration and an unchanged billing anchor, and rejects unknown/other scheduling rules. The management Portal still forbids plan updates; application-owned Premium-to-Basic scheduling is unchanged. No Stripe configuration is mutated by this fix.

Known configuration rejections previously returned their safe error code without logging field details; the attempted filtered Cloudflare tail contained no matching historical failure record. Rejections now emit a redacted `billing_portal_configuration` event containing only a request ID, Portal type and fixed failing field names. Tests verify that customer/subscription identifiers, keys and provider bodies are not logged.

For non-payment acceptance, a verified Sandbox administrator can open `/api/billing/status?check=upgrade`. This performs read-only price and upgrade-configuration validation and returns `upgradeConfigurationValid=true` on success. It creates no Portal session, subscription, invoice or payment and does not acquire a billing lease. Normal `/api/billing/status` and the existing Basic subscription are preserved. Actual upgrade confirmation remains the owner's later action.

## Fixed membership totals without Stripe Tax

The owner confirmed Stripe Tax must remain off and approved reusing existing prices with `tax_behavior=unspecified`. Price validation now accepts `inclusive` or `unspecified`; it still rejects exclusive/unknown behavior, wrong products, wrong amounts/currency, non-monthly/metered prices and live-mode mismatches. No products, prices or Stripe Tax settings are created or changed.

New Checkout requests explicitly disable automatic tax, Adaptive Pricing and promotion codes. They use the same approved price and quantity one, with no manual tax rates or shipping charges. Before returning a new or reused Checkout URL, the server verifies JPY subtotal and total are exactly ¥2,000 for Basic or ¥4,000 for Premium, automatic tax is off, and no tax, discount or shipping amount is added. Unknown/mismatched totals return `billing_checkout_review` without returning a payment URL. This is the owner's fixed tax-inclusive fee policy; Stripe does not calculate or itemize tax under this integration.

This corrects the remaining `billing_price_configuration` rejection when the existing prices use `unspecified`. It does not require replacement Price IDs, a new plugin or weaker payment proof. Administrator access, Sandbox-only billing, customer launch gates and membership rules remain unchanged. Provider references were checked against Stripe's pinned v22.4.0 Checkout types and its [Checkout tax documentation](https://docs.stripe.com/tax/checkout/page).

The owner approved production deployment using the existing six Sandbox IDs and three encrypted Cloudflare Pages Production secrets, without another Stripe plugin. Customer purchasing and live payments remain excluded. The owner will enable the Stripe Sandbox webhook destination and perform the first test payment after deployment verification.

## Billing status runtime correction

After the initial deployment, the owner confirmed that administrator login worked but `GET /api/billing/status` returned `billing_unavailable`. Production Sandbox flags and all six IDs matched the source; Supabase mode remained `test`, customer access false, with no memberships or live billing records. A rollback-only call as `service_role` successfully acquired the administrator's test-mode billing lease, confirming the database procedure and its permissions worked without retaining any row or lease.

The root cause was `redirect: 'error'` in both outbound billing transports. Cloudflare Workers accepts `manual`/`follow`; it rejected these requests before any provider call. The new `stripe-billing-worker.test.ts` reproduces the original database request returning 503 instead of 200 in the actual workerd runtime. Switching both transports to `manual` and explicitly rejecting all 3xx responses fixes the test while preventing credential forwarding. The regression covers both Supabase RPC and Stripe HTTP requests, including hostile redirect responses. The earlier mocked transport tests had accepted the unsupported redirect mode; they now require `manual` too.

The correction changes no account roles, membership rules, customer-access gates, Stripe IDs, secrets or database mode. It creates no Checkout session or payment. Its deployment uses another complete CMS download/build/export and the existing GitHub → Pages workflow.

## Database operation completed

The exact prepared `008_enable_stripe_sandbox.sql` transaction ran once against the existing Supabase project `fgdoqsepihlzfqlqymet`. It returned `mode=test` and `customer_access_enabled=false`. Before/after fingerprints confirm existing Auth accounts, administrator roles and memberships are unchanged. There were no billing customers or event records. Migration 008 was not replayed.

## Source and complete static export

This release contains the Stripe backend/Functions route, account billing UI, provider validation, tests, migration/operator history, non-secret Wrangler configuration and the complete regenerated tracked `out/`. It uses `origin/main` in `DiggerDogJAPAN/live-love-myoko` and the existing Cloudflare Pages project `livelove`, with remote build command `npm ci` and output `out`. No manual Pages deployment is used.

Production configuration retains:

```text
FINDER_AUTH_ENABLED=enabled
FINDER_BILLING_ENABLED=enabled
FINDER_STRIPE_MODE=test
FINDER_BILLING_SANDBOX_ENABLED=enabled
FINDER_CUSTOMER_ACCESS=disabled
```

Both existing customer launch gates remain disabled. Only active verified administrators can use test-mode billing. Test records never modify real membership entitlements or administrator access. Existing Auth/alerts secrets and CMS configuration/data are preserved. No secret values enter this release.

Immediately before the push, the established full `npm run build` succeeded, including fresh CMS downloads. Independent unlimited published-content inventory and source-byte verification confirmed 25 properties, 2 accommodations, all 27 detail URLs/titles, 40 nonempty CMS summary/description/about fields, all 377 CMS images, 418 unchanged public assets, all 51 previous production HTML routes, 410 unchanged production image blobs and 442 local HTML references. The CMS inventory remained unchanged during the build; Directus SQLite/configuration SHA-256 values are unchanged. The expected membership-page description change directs users to account subscription availability.

All 239 tests, TypeScript, changed-file ESLint, production Pages Functions compilation and the export-security guard pass. The homepage test snapshot includes the Property Alerts paragraph already published in `7483589`; homepage content is unchanged.

## Deployment acceptance

After the GitHub-triggered release succeeds, verify its exact commit and production Sandbox flags through Cloudflare, compare public CMS pages/assets with this complete export, check account/authentication routes and anonymous billing denial, and confirm the webhook rejects unsigned requests. The final task report records the actual deployment result.

No dashboard browser or signed-in administrator HTTP session is connected to the agent. Database administrator authorization, deployed client assets, runtime flags and anonymous endpoint checks can be verified; an actual signed-in account screen requires the owner's browser. This limitation does not justify creating credentials or bypassing authentication.

The encrypted Cloudflare secret names are confirmed present, but values cannot be retrieved. Direct Stripe catalog/Portal/webhook-destination verification remains unperformed; the owner explicitly authorized proceeding without another plugin. The server validates catalog/Portal settings before their relevant billing actions. Keep the destination disabled until this deployment's signed endpoint is ready, then enable the Sandbox destination and use Stripe test-card details only. No Checkout session or payment is created by the deployment checks.
