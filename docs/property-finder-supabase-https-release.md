# Complete Supabase HTTPS release — database and build receipt

Production project: `fgdoqsepihlzfqlqymet`. The owner authorized the complete migration/deployment and elected to perform the final interactive administrator browser test. Follow the [current architecture and release procedure](property-finder-supabase-https.md).

## Applied database migrations

- `004_finder_saved_properties_rpc.sql` — SHA-256 `758ed1761140cef3dae7a75ed628c5fb04c2e12bc14bde4814cf990320385788`; applied once and read-only verification passed.
- `005_finder_supabase_https.sql` — SHA-256 `c4584184be5047defefed8d99935758f50d3a0ebbf216641a4666e00ea79c688`; applied once and read-only verification passed.

Both were applied in order and completed successfully. No migration 001–003 was rerun. The production administrator was already active/verified and was not changed. The real database smoke test ran as `authenticated` using the existing administrator/session in a controlled SQL context: account → directory → save → IDs → page → remove. Its transaction was rolled back and protected fingerprints rechecked. This is not an HTTP login/browser test and no JWT or membership was fabricated.

- Current eligible customer view: **143 listings** at verification, below the unchanged 500-snapshot cap. The older 140 count was not forced onto the current crawler dataset.
- The actual frontend mapper accepted all 143 rows with 143 unique stable IDs, zero projection errors, four municipalities and 137 permitted thumbnail objects. This is data validation, not a claim that 137 images were loaded in a browser.
- Auth users/sessions/identities, private memberships/account roles/bookmarks/counters, crawler tables, existing protected relation metadata/RLS policies and role memberships matched before/after. Reader connection limit/configuration remained unchanged.
- New private customer rollout setting remains **false**; no customer, administrator or paid-membership rows were created. Existing forced RLS and private schema isolation remain.
- The connection-budget/pool-size proposal was withdrawn; no such SQL or resource change was applied.

## Application and export validation

All **147 tests** passed, including the actual SQL migrations with non-superuser ownership, HTTPS account authorization, direct Finder transport, complete source/location/image mapping, Saved Properties and workerd. TypeScript, changed-file lint, production dependency audit (zero advisories), Functions compilation and static-export security checks passed. No application pg client, database URL or Hyperdrive reference/binding remains; shared authentication and the design are preserved.

The full normal CMS build regenerated `out/`. Independent checks verified **25 properties, 2 accommodations, 377 CMS images, 418 public assets**, 67 content fields, all **48** baseline HTML routes and 433 local references. No missing content or private Finder inventory/credentials were exported. GitHub Pages publishes the complete tracked `out/`, not a partial application-only output.

## Deployment and owner acceptance

This receipt accompanies the source/static commit sent through the existing GitHub `main` → Cloudflare Pages integration. The final task report records the resulting commit/deployment status and live automated checks. The unused Hyperdrive resource is retained until the owner completes the administrator browser checklist in the architecture guide; its application bindings and SQL credential requirements are removed. No separate manual deployment is used.
