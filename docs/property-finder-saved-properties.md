# Premium Saved Properties

> A direct Supabase replacement is now prepared locally, **not applied or deployed**. See [current migration 004 and cutover design](property-finder-saved-properties-direct-supabase.md). The API/transport description below records the currently deployed migration-003 implementation and its history; its Cloudflare Saved Properties handlers are retired in the pending local replacement.

Production migration 003 has been applied and verified after the owner's recovery confirmation; see the [migration receipt](property-finder-saved-properties-migration-results.md). This application release is approved for the existing GitHub → Pages workflow. No memberships, administrator assignments or test customers are created. Customer listing access remains `FINDER_CUSTOMER_ACCESS=disabled`; existing administrators need no subscription. Stripe remains outside this release.

## Identity, data and authorization

The existing crawler uses `crawler.properties.id` UUIDs and retains an existing row's ID during daily data/price updates. Saved properties use those stable opaque IDs, not URLs, array positions, title/price hashes or copies of listing content. The migration appends `listing_id` to the existing security-invoker/barrier customer view without changing its existing columns, source eligibility predicates or image permissions. The API projects it as additive `FinderProperty.id` for eligible live cards. Development fixtures without real listing IDs remain unsaveable.

Every Saved Properties endpoint requests `saved-properties:use` through `authorizeFinderRequest`: a verified asymmetric Supabase token, matching live session and fresh private account snapshot are required. An active administrator needs no subscription and is independent of the customer-access flag. A Basic, unpaid, expired, revoked or inactive account is denied. A genuine Premium customer additionally needs active paid/date-valid entitlement **and customer rollout enabled**. In production the flag remains disabled; all customer saved-data access is therefore denied until separately approved billing/rollout. There is no frontend permission bypass or test paid account.

## Database migration 003 — applied and verified

File: `sql/proposals/003_finder_saved_properties.sql`, after the already-applied membership migrations 001/002. This is a website membership migration, not crawler migration 003. It has been applied to the intended production project. Preserve the recorded checksum and do not rerun it there; the original proposal header is retained as historical source text.

It creates:

- `finder_security.saved_properties(user_id, property_id, saved_at)`: composite primary key prevents duplicates; saved timestamp remains unchanged on a duplicate PUT. Millisecond timestamp precision plus UUID provides deterministic keyset ordering. No descriptions, images or prices are copied.
- `finder_security.saved_property_limits`: one bounded counter row per account, 60 reads and 30 mutations per fixed minute, shared across Function instances; save cap 500 per account. Quota/rate checks serialize with an account-scoped transaction advisory lock.
- Fixed-search-path, postgres-owned helpers `saved_property_ids(uuid,uuid)`, `save_property(uuid,uuid,uuid)` and `remove_saved_property(uuid,uuid,uuid)`. Only the existing restricted website login receives EXECUTE. The internal `check_saved_access` helper is not delegated to that login.

Both tables use forced RLS, no browser policies and no direct table privileges for browser/service/crawler/web roles. Ownership is enforced inside the trusted helpers using verified backend user/session arguments and fresh private session/account/role/entitlement checks. This follows the existing account-snapshot architecture: PostgreSQL does not independently verify the JWT; Pages verifies it and alone supplies signed `sub`/`session_id`. Browser-supplied account IDs are rejected. Anyone holding the website database credential is part of that trusted server boundary; never expose it or delegate helper execution to browser roles/public RPC.

The migration grants the restricted customer reader SELECT on the single opaque property ID column needed by the invoker view. It does not grant crawler schema usage, writer privileges, base-table mutations, managed Auth grants/policy changes or private table access. It does not modify property data, histories, memberships, administrator roles or scheduled jobs. The website reader performs private bookmark mutations only through the narrowly delegated helpers; no general database writer or service-role key is introduced. The existing reader is provisioned with `default_transaction_read_only=on`; that role default remains unchanged. Only Saved Properties uses an explicit `BEGIN READ WRITE` transaction for the delegated helper/counter operations. Existing inventory and membership loads remain explicitly read-only. Privileges, forced RLS and fixed helper bodies constrain this exception; no direct saved-table or crawler mutation grants are added.

Bookmarks intentionally have no foreign key/cascade to crawler records: unavailable or deleted listings remain removable tombstones. Auth user deletion still cascades their private bookmarks/counter. The backend checks save-target eligibility under `crawler_customer_reader`, including restrictive portal policies, before invoking the private write helper. The postgres-owned helper independently checks account/session/entitlement and the generic eligible-view predicate, but its BYPASSRLS owner does not enforce caller-specific restrictive portal RLS; the server-side role-scoped precheck is therefore mandatory. Save checks current eligibility; remove works even when a listing has disappeared. Dashboard reads fetch only current eligible display fields through the restricted customer role and existing `customerProperty` projection. A hidden/deleted/unpublished/private row returns `property:null`; only its already-saved opaque ID and saved date remain. Previous details and prices are never reconstructed or returned.

### Application order and preflight — production completed; new environments only

Production steps 1–4 below have completed; do not replay them. For a new approved environment:

1. Review the SQL against the exact production project `fgdoqsepihlzfqlqymet`, current migrations/view definition and roles. Confirm a current completed, restorable backup or recoverable restore point. Local validation is not hosted compatibility certification.
2. Check 001/002 are applied, `account_snapshot` is the existing postgres-owned fixed-path helper, `account_roles` has forced RLS, the existing reader is isolated, and the current customer view still matches crawler migration 007. The proposed view preserves that projection/predicate and appends only `listing_id`; stop if the production view has additional unreviewed changes.
3. With explicit approval, apply the complete migration **once** through the authorized postgres connection. It is transactional with lock/statement timeouts and deliberately refuses existing/partial saved objects. Stop on error; do not replay or repair speculatively. Do not rerun 001/002 or crawler migrations.
4. Verify the new private tables, forced RLS, helper grants, denied direct/public access and unchanged eligible listings/crawler rights. Do not create fake paid memberships, promote users or enable customer access to test it.
5. Only after migration verification, approve rebuilding/committing/pushing the application through the existing GitHub → Pages workflow. The live inventory query now explicitly selects `listing_id`; **deploying before migration would fail closed with 503 directory_unavailable**. A missing saved helper similarly yields safe 503, never a local-storage or public-data fallback.
6. In the existing administrator's real session, save from Finder, refresh, open `/account/`, verify current details, remove, then sign out and confirm denial. Test an existing unpaid account only with its owner's authorization. Leave production memberships and rollout flags unchanged.

Local PGlite tests exercise the actual revised migrations with a non-superuser postgres/BYPASSRLS role, separate managed Auth ownership and permissive platform defaults. They verify no direct private table grants, narrow helper delegation and cross-account/session isolation. A read-only production catalog review confirmed the project, 19 existing customer-view columns, stable UUID/property ownership, protected view flags, the existing account helper and absence of the saved table. The actual current view definition matches the preserved migration-007 projection; the proposal includes a view-definition drift fingerprint and stops if it changes. No listing contents or production writes were involved. This catalog check is not hosted execution validation: production migration application and read-only verification have now succeeded, as recorded in the receipt. Authenticated browser acceptance follows the application deployment.

## API routes

All are handled by the existing root Pages Function; no additional public endpoint or browser Supabase client is introduced.

| Method and route | Result |
| --- | --- |
| `GET /api/property-finder/saved-properties/ids` | Current user's saved UUIDs and total, bounded to 500 |
| `GET /api/property-finder/saved-properties?cursor=…` | Up to 20 saved entries with current eligible property or null; total and next cursor |
| `PUT /api/property-finder/saved-properties/:listingId` | Idempotent save of a currently eligible listing |
| `DELETE /api/property-finder/saved-properties/:listingId` | Idempotent removal owned by the signed user |

Mutations require the exact trusted Origin; all requests reject cross-site/foreign-origin use. UUIDs and cursor structure are validated; unknown query parameters and **all nonempty request bodies** are rejected/cancelled, so there is no browser ownership field or unbounded JSON ingestion. Mutations are bodyless; browsers send the same-origin Origin header automatically. Invalid sessions fail closed before storage. Authenticated quota/rate failures use safe 409/429 responses; 429 includes Retry-After: 60. No internal SQL/provider messages escape. All responses, including denials, disable browser/CDN caching and expose no CORS grant. The existing public Directus property pages are unchanged.

## Frontend behavior

The existing Finder card adds a 44px keyboard-accessible heart with aria-pressed/aria-busy and an explicit save/remove label. Outline/filled state comes from the server-loaded saved IDs. Mutations update immediately, disable controls while in flight, roll back errors and display actionable feedback. Serialization and idempotent PUT/DELETE prevent duplicate/rapid concurrent writes. Basic/non-paying viewers get a Premium link, never saved-data access. Synthetic fixtures have no save action.

`/account/` adds a full-width Saved Properties section with the same cards, total count, a useful empty state and 20-item Load More pagination. Removed/unavailable items have a minimal disclosure and a removal control. Basic/unpaid accounts see: “Save your favourite properties and access them anytime with a Premium membership.” Premium accounts cannot use it while rollout is disabled; administrators can after approval/deployment.

State is not persisted in browser storage. Refresh/navigation reads the private database again; focus/pageshow and same-origin change notifications refresh state. Logout invalidates pending responses and clears IDs/cards; a late mutation failure cannot restore a previous account's state. Current data is fetched on each saved-page request instead of caching historical property snapshots. Supabase refresh uses the existing secure cookie/refresh flow. No map, saved-search, Stripe or refund implementation is included.

## Complete static CMS export and review

Before any deployment run the established full `npm run build`, including CMS asset downloads. Independently verify all 25 properties, 2 accommodations, 377 CMS images, 418 public assets, existing page URLs/content/navigation and four-column footer. Stage the complete regenerated `out/`; never publish partial output. The approved release includes the source, immutable migration, tests, documentation and complete regenerated export.


## Validation record

Local validation passed **142 automated tests**, TypeScript and ESLint for all 19 changed TypeScript files. Tests exercise real asymmetric JWT validation, all three membership migrations in local PostgreSQL, private role/helper grants, Basic/unpaid/revoked/expired denial, per-user/session isolation, stable IDs across sessions/price changes, idempotent writes, hidden/deleted/unpublished tombstones, keyset pagination, quotas/rates, restrictive portal RLS target eligibility, read-only-role compatibility and optimistic UI rollback. Replaying the proposal fails transactionally without overwriting existing bookmarks.

The final full CMS build and production Pages Functions compilation passed. Independent export checks verified 25 properties, 2 accommodations, 377 CMS images, 418 public assets, 67 CMS text fields, all 48 baseline HTML paths and 433 internal references. The static-export security guard passed for 259 text artifacts, and changed/new files passed private-runtime-value/file-path scans. No interactive save/remove browser acceptance is claimed. Production migration 003 was explicitly approved, applied and verified; original Auth/crawler/membership/administrator data and policies remained unchanged. Final database verification compared the restricted reader with its own pre-migration baseline of 143 rows, not the broader BYPASSRLS-owner view. Production UI acceptance is recorded separately after deployment.
