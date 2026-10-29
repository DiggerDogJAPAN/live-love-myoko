# Production membership migrations — applied 29 October 2026

Applied to **Myoko Property Finder**, project `fgdoqsepihlzfqlqymet`, database `postgres`, PostgreSQL 17.11, using the existing administrator and verified TLS. The owner confirmed that automatic physical backups dated 27/28 October were completed with Restore available. PITR is not enabled. Restorability evidence was the owner's dashboard confirmation; no backup was restored or new backup service configured.

| Applied SQL | Database commit time (JST) | SHA-256 |
| --- | --- | --- |
| `sql/proposals/001_finder_membership_foundation.sql` | 29 October 2026, 17:22:46 | `d60cd8af083a6b1d4cbe0b433fef4f328947746c62c60d944c46fc948a3d27d1` |
| `sql/proposals/002_finder_accounts.sql` | 29 October 2026, 17:22:53 | `ad0cc6a2b9704633a479bc3a139912e48e158aef15e90c0e2fb5affc56206003` |

These were separate database transactions, applied in order. The exact reviewed statements were executed with their transaction wrappers managed by the database driver. Each transaction checked private object security and protected state before commit. No migration failed and no repair, partial rerun or role-membership change was attempted. Source SQL bytes remain unchanged to retain the approved checksums; their original review-only comments are historical. **Do not rerun either one-time migration.** The existing crawler migration ledger was not modified.

## Installed

- Private `finder_security` schema, `memberships` and `account_roles`, owned by the existing `postgres` administrator.
- Enabled and forced RLS on both tables, with zero public/allow policies. Direct table/column privileges remain denied to browser, service, crawler and website-reader roles.
- Fixed postgres-owned `membership_snapshot(uuid,uuid)` and `account_snapshot(uuid,uuid)` helpers. Their stored SELECT bodies match the approved SQL; both are STABLE/SECURITY DEFINER with `search_path=pg_catalog` and `row_security=on`.
- Only the website reader receives the delegated schema USAGE/helper EXECUTE privileges. It receives no private table access, writes, schema CREATE or owner-role membership.
- Separate customer/administrator roles and Basic/Premium subscription state are supported. **Both tables contain zero rows:** no administrator assignments, paid entitlements or test accounts were created.
- No custom grants, RLS policies or ownership changes on managed Auth objects. Standard application-table foreign keys use postgres's existing Auth reference privileges.

## Verification

Preflight confirmed the exact project/database, existing administrator capabilities, required Auth columns/read/reference privileges and safe website-reader role. Initial verification assumptions about administrator RLS visibility and role impersonation were corrected using read-only checks before any DDL: the administrator sees 560 view rows because it bypasses reader RLS; the actual restricted customer role sees 140. No permissions were changed to facilitate verification.

Before/after fingerprints matched for all existing crawler table contents, the property view, Auth/property schema/table/column ACLs and owners, existing RLS policies, role attributes/memberships and global defaults. Preserved internal counts: 682 properties, 6 sources, 22 crawl runs, 0 price changes, 1 status change, 0 translations and 6 crawler migration-ledger rows.

An independent connection using the real website-reader login and verify-full TLS verified:

- Both helpers can be executed; unknown user/session UUIDs return no rows.
- Direct reads of both private tables are denied.
- Attempts to assume `postgres` or `crawler_writer` are denied.
- The normal `crawler_customer_reader` property view still returns **140 listings**.

Catalog checks confirm anonymous/authenticated/service/authenticator/crawler roles have no private schema usage, helper execution or private table/column privileges. The crawler writer's original INSERT/UPDATE permissions remain present; DELETE and schema CREATE remain denied. Existing writer policies/grants and data fingerprints are unchanged. No crawler or test write was run. Production administrator/session test accounts were not created; positive lifecycle cases remain covered by the 104 local tests.

## Application state and next steps

Customer paid listing access remains disabled. The uncommitted Phase 1/2 implementation is not deployed; existing Cloudflare Access administrator authentication and application configuration are unchanged. No Git commit, push or deployment was performed for these database migrations.

Subsequent owner update: email registration/confirmation, Resend SMTP/sender/templates, the exact `https://love-live-myoko.com/api/auth/callback` redirect, 3600-second access expiry and refresh protection are configured. Real email/browser acceptance remains pending deployment. The website still needs its server publishable key/cookie-signing secret and a separately approved authentication deployment; Google is optional and remains disabled until configured/tested. Any real administrator assignment must be a separate explicit operator action; billing and paid-access activation remain later phases. See [the Phase 2 deployment checklist](property-finder-authentication-deployment.md).

Private operational receipt: `/private/tmp/finder-membership-production-operation.json`. It contains checksums, commit times, verification summaries and fingerprints, not credentials or property inventory.
