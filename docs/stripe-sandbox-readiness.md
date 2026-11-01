# Stripe Sandbox preflight — 1 November 2026

Historical preflight receipt. The owner subsequently approved deployment without another Stripe plugin. The guarded database switch has now completed with mode `test`; see the [deployment record](stripe-sandbox-deployment.md) for the current release state.

**Source and complete CMS export prepared. Stripe provider verification pending. No deployment, database mode switch or payment performed.**

## Configuration and production state

- All six owner-supplied Sandbox Product/Price/Portal IDs are saved in `wrangler.jsonc` under `env.production.vars` and match exactly. Wrangler successfully parses the production configuration.
- Production source flags are `FINDER_BILLING_ENABLED=enabled`, `FINDER_STRIPE_MODE=test`, `FINDER_BILLING_SANDBOX_ENABLED=enabled`, and `FINDER_CUSTOMER_ACCESS=disabled`. Default/preview billing remains disabled. Source edits have not changed deployed runtime settings.
- Read-only Cloudflare Pages secret metadata confirms `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `FINDER_BILLING_SUPABASE_SECRET_KEY` are present and encrypted in Production for Pages project `livelove`. No secret values were retrieved. Existing Auth/alerts secret names remain present.
- Read-only Supabase checks confirm database mode remains `live`, customer access remains false, one eligible verified administrator exists, and membership/customer/event counts remain zero.
- `sql/operations/008_enable_stripe_sandbox.sql` remains prepared only. The owner explicitly requires further approval before its production execution or any website deployment. Migration 008 is already applied and must not be replayed.
- Existing API and database administrator restrictions remain intact. Automated tests verify ordinary accounts cannot enter Sandbox billing and simulated billing cannot modify real memberships or administrator permissions.

## Complete CMS build/export

The established `npm run build` ran successfully, including CMS asset downloads, Next.js static export and the Finder export-security guard. It regenerated the complete tracked `out/` for later GitHub → Cloudflare Pages publication. No partial build or alternate deployment method was used.

An independent Directus API inventory used unlimited published-record and gallery reads before the build, then confirmed that inventory stayed unchanged afterward. It verified:

| Check | Result |
| --- | --- |
| Published properties / accommodations | 25 / 2; all 27 detail URLs exported and linked from their indexes |
| Titles and nonempty summary/description/about fields | All 27 titles and 40 content fields preserved; metadata matches CMS SEO overrides/fallbacks |
| Featured and gallery images | All 377 exported files match source image bytes via SHA-256 |
| Existing public assets | All 418 paths and bytes preserved |
| Previous production HTML routes | All 51 preserved; current export has 51 HTML files |
| Previous production image bytes | All 410 image paths compared using tracked Git blob hashes; no differences |
| Local HTML page/asset references | 442 unique references resolve |
| Previous production page metadata | Preserved except the previously prepared membership-description update that directs users to account subscription availability |
| Directus SQLite data and configuration | SHA-256 unchanged before/after the service start, inventory and build |

The existing local Directus service was initially stopped and was started with its installed Node 22 runtime for the build. Its configuration/content were not edited. No production CMS writes occurred. Temporary audit inventories and logs are under `/tmp/livelove-sandbox-preflight/`; no secret values are included in this receipt.

## Checks

- All **239 TypeScript tests pass**, including the real Workers runtime tests, which require localhost permissions.
- TypeScript checking and targeted ESLint pass.
- Production Pages Functions compilation with `nodejs_compat` passes.
- Static export security guard passes over 281 text artifacts.
- Exact known local credential-value scanning passes over the public text artifacts without printing credentials.
- The stale homepage snapshot was updated to include the Premium Property Alerts paragraph already published in commit `7483589`. No homepage content was changed.

## Remaining provider verification before first payment

No Stripe secret is available in this local process; the Cloudflare secret listing reveals names only. No dashboard browser is connected. The available Stripe plugin was suggested but remains unconnected. Consequently, no Stripe API read or payment was performed and the following cannot yet be marked verified:

1. Basic price `price_1UWnqdByKDiZGfxHGAPVvbf7` actually belongs to `prod_VXtd0bhZkd700E`; Premium price `price_1UWnr7ByKDiZGfxHC6NLf8Am` belongs to `prod_VXteQEfIzveRCC`. Each must be active, test mode, quantity-one licensed monthly pricing, JPY 2,000/4,000 respectively, with interval count one and inclusive tax behavior.
2. Management Portal `bpc_1UWo5ZByKDiZGfxHce7bPGdN` disables subscription updates. Upgrade Portal `bpc_1UWv8FByKDiZGfxHg6EAnWSE` allows price updates only to the configured Premium product/price, uses `always_invoice` proration, leaves the billing anchor unchanged and has no end-of-period switch conditions. Both must be active test-mode configurations with invoice history, payment-method updates and end-of-period cancellation enabled.
3. The Snapshot webhook destination points to `https://love-live-myoko.com/api/billing/webhook`, uses own-account events and version `2026-07-29.dahlia`, subscribes to the 19 documented events, and its signing secret matches the encrypted Pages secret. Keep it disabled until the endpoint is deployed.
4. The Stripe API key is for the intended Sandbox and the Supabase billing API secret is for the existing project. Name presence alone cannot establish either fact.

The existing server validates product/price assignments and both Portal restrictions and rejects unsupported configuration; synthetic tests prove those checks, not the actual provider settings. Connect authenticated Stripe access to complete the read-only provider review. After that review and separate owner approval, perform the guarded database switch and publish the complete export, then enable the matching webhook destination and make the first administrator test-card payment. Customer launch gates must remain disabled throughout.
