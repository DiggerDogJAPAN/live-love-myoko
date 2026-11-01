# Administrator-only Stripe Sandbox deployment — 1 November 2026

The owner approved production deployment using the existing six Sandbox IDs and three encrypted Cloudflare Pages Production secrets, without another Stripe plugin. Customer purchasing and live payments remain excluded. The owner will enable the Stripe Sandbox webhook destination and perform the first test payment after deployment verification.

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
