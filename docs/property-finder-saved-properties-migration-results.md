# Saved Properties migration 003 — production receipt

Applied to Supabase project `fgdoqsepihlzfqlqymet`, database `postgres`, using the existing authorized PostgreSQL administrator connection with verified TLS. Completed (UTC): `2026-10-30T11:49:06.198266+00:00`.

- File: `sql/proposals/003_finder_saved_properties.sql`.
- SHA-256: `a00033a1796ba169519d66720a0cb073cfb9c6afa6254544bdaf1405458aa72d`. Preserve these source bytes; the historical proposal header does not override this execution receipt.
- Recovery: the owner confirmed a current completed backup with Restore available on 30 October 2026. The exact backup timestamp was not supplied; no dashboard restore or backup change was performed.
- Migration state before application: no saved table/helpers or view UUID column. Migrations 001/002 were already applied; neither was rerun.

## Applied and verified

Created private `finder_security.saved_properties` and `saved_property_limits`, forced RLS and no public policies. Bookmarks have only owner UUID, stable property UUID and saved timestamp, with composite primary key `(user_id, property_id)`, an owner/saved-date/UUID pagination index and Auth-user deletion cascade. Unavailable/deleted property IDs remain removable without copying private listing facts.

Created four postgres-owned fixed-search-path SECURITY DEFINER helpers. Only `saved_property_ids`, `save_property` and `remove_saved_property` receive website-reader EXECUTE; internal `check_saved_access` is not delegated. Browser/service/crawler roles receive no execution or direct saved-table privileges. The existing website login still has no direct saved-table access and retains its default read-only setting. Only scoped saved operations use explicit read-write transactions for these helpers/counters.

Appended `listing_id` to the unchanged security-invoker/barrier eligible customer view and granted the restricted customer role SELECT on the opaque UUID column. Existing columns, source/thumbnail eligibility projection, RLS policies, role attributes/memberships, original helper definitions and existing Auth/crawler/membership/administrator records were verified unchanged within the committed transaction. No memberships, roles, bookmarks, rate rows, payments or users were seeded.

After commit, a separate read-only check verified objects/constraints/indexes/privileges, the existing active administrator/live-session helper without a paid subscription, zero customer memberships and zero seeded bookmark/rate rows. The restricted website reader still returns **143 rows**, each with a non-null unique listing UUID, matching its own pre-migration baseline. Catalog counts under a BYPASSRLS owner are broader and must not be used as the customer-reader baseline. The application validates every new save target under the actual restricted role to retain restrictive portal-policy behavior.

One initial transaction was rolled back before commit because an operational verifier misclassified new index attributes as changes to existing column ACLs. The issue was reproduced in local PostgreSQL and the verifier corrected; no grant workaround or production repair was performed. A separate post-commit count check was corrected to compare like-for-like restricted-role snapshots. The migration was committed once; it was not rerun after commit. Subsequent verification was read-only.

## Next operations

Do not replay migration 003 or modify production memberships/administrator roles. Keep `FINDER_CUSTOMER_ACCESS=disabled`. Deploy the approved source with the entire fresh static CMS export through GitHub/main → Pages. A real administrator must then verify saving, refresh persistence, account cards and removing; no interactive save/remove success is asserted by database/catalog tests. See the [feature guide](property-finder-saved-properties.md).
