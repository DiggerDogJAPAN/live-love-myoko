# Membership migration compatibility and recovery

> Historical report: counts, rollout state and Cloudflare Access references below describe that earlier operation. Current production uses Supabase Auth only; the owner has removed both Finder Access applications. Follow the [current deployment checklist](property-finder-deployment-checklist.md) and preserve these migration/release facts as evidence.

Reviewed 29 October 2026. **The revised migrations were subsequently applied and verified in production at 17:22 JST on 29 October.** See [the application receipt](property-finder-membership-migration-results.md). Application configuration and code deployment remain unchanged; no accounts or memberships were created and no Git commit/push was performed. The design/local-validation discussion below records the review preceding that application.

## Revised ownership model

The earlier proposals incorrectly assumed a custom helper owner could receive Auth schema access and install Auth RLS policies. Production's managed `auth` schema belongs to `supabase_admin`; its tables belong to `supabase_auth_admin`. The existing `postgres` administrator has Auth reads and RLS bypass but lacks schema grant authority and membership of the managed owner roles. The first local fixtures missed these restrictions.

Revised [001](../sql/proposals/001_finder_membership_foundation.sql) and [002](../sql/proposals/002_finder_accounts.sql) use Supabase's [documented postgres-owned SECURITY DEFINER pattern](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema):

- The existing `postgres` owns the new private schema, tables and helpers. No helper-owner role is created/elevated. Its existing RLS-bypass capability is checked, never granted to an application role.
- Private tables retain enabled/forced RLS with no public policies. Public/browser/service/crawler access is explicitly revoked, including permissions from existing global object defaults. Only the restricted website login receives schema USAGE and helper EXECUTE, not CREATE, ownership, direct table reads or writes.
- Helpers are fixed SQL SELECTs, STABLE and SECURITY DEFINER, with `search_path=pg_catalog`, `row_security=on`, fully qualified names and UUID parameters. No dynamic SQL or Auth email/password/token fields are exposed. Every future helper must explicitly revoke default execution permissions too.
- No Auth grants, Auth ownership changes or Auth RLS policies are added. Standard foreign keys from **postgres-owned application tables** to `auth.users(id)` use its existing REFERENCES privilege. These create normal FK dependencies, not custom-role access to managed Auth.
- JWT issuer/signature/audience/role/session checks, verified-claim lookup arguments, live Auth/session checks, account disabling/bans/deletion, private administrator roles and active/paid/date-valid tier checks remain authoritative. Both helper versions now also require verified email. No bypass, metadata-based role or payment seed exists.

Helper names, parameters, result columns and schema versions remain unchanged; Phase 1/2 TypeScript authorization needs no adapter or weaker permission path. Reader identity checks, verified TLS, read-only transactions, Cloudflare Access and rollout flags remain unchanged. Paid customer access stays disabled.

Both scripts are one-time transactions with lock/statement timeouts. 001 checks the existing administrator, database creation rights, safe reader, expected roles and Auth read/reference prerequisites before creating objects. 002 requires the revised postgres-owned/RLS-enabled 001 objects and pinned helper configuration. Partial/legacy installations are not automatically replaced or repaired. Crawler migrations, property data/view/grants and postgres global defaults are untouched.

## Validation and its limits

Read-only catalog inspection of **Myoko Property Finder**, reference `fgdoqsepihlzfqlqymet`, database `postgres`, PostgreSQL 17.11, confirmed all eight required Auth columns/types, postgres SELECT rights and `auth.users(id)` REFERENCES rights. The preceding preflight confirmed existing BYPASSRLS, managed ownership separation and the restricted reader. No Auth user data or migration DDL was accessed to obtain those results. Prerequisite confirmation is **not hosted execution validation**.

PGlite executes the actual revised SQL as a non-superuser postgres with existing Auth reads/reference rights but no Auth ownership, managed-role membership or Auth schema grant authority. Separate platform roles own Auth objects. Permissive global defaults test that private-object revocations work.

Tests compare pre/post Auth/property schema/table/column ACLs, owners, RLS, policies, memberships, role attributes, defaults, view definitions and original data. They check zero seeded memberships/admins; fixed helper ownership/search paths; denied public/service/crawler reads/writes/execution; reader escalation denial; temporary-table/JWT-setting spoof resistance; actual SQL snapshots through Basic/Premium/admin authorization; expired/revoked/unverified/disabled denial; and clean rollback with missing prerequisites or wrong migration order.

This is a closer PostgreSQL permission simulation, **not a full hosted Supabase rehearsal**. Managed event triggers, extensions and service upgrades are not reproduced. The owner elected to skip the disposable hosted project test; passing locally does not establish successful hosted execution. Any later approved application must stop on its first error or missing-privilege warning, roll back an uncommitted transaction and avoid improvised grants/repairs.

Validation result: **104/104 tests passed, including 10 migration tests**, with TypeScript and changed-file ESLint passing. Managed Auth deletion and private FK cascades were tested locally without changing unrelated property rows. No frontend/runtime source changed in this compatibility revision, and the tracked static export was left untouched.

## Backup investigation

Existing private Finder SQL/catalog backups were checksum-verified during preflight. The latest inspected directory is `crawler/data/backups/008-20261029T031304664588Z/` (29 October, 12:16 JST). They cover `crawler`/`property_api`, property/history data and permissions; **they omit Auth data and are insufficient as sole recovery evidence**.

No authenticated Supabase dashboard/Management API session is available here to inspect this project's plan, completed backups or PITR window. At review time a full hosted restore point was unconfirmed. Before application, the owner confirmed completed physical backups dated 27/28 October with Restore available; PITR is not enabled. No complete dump/restore rehearsal was run, tools installed, add-on enabled or password changed.

**Simplest reliable option:** open the existing project's **Database → Backups**. If a recent completed full-database backup is already restorable, record its timestamp, retention/deadline, restore availability and acceptable data-loss window. This avoids hand-rebuilding managed Auth. If PITR already exists, record the actual recoverable interval and a point immediately before a future migration. A schedule, enabled toggle or incomplete job is not recovery proof. Do not click Restore or enable a paid add-on now.

Supabase documents managed daily backups for paid plans and manual exports for free projects; newer physical backups may be restorable without being downloadable. Database backups include database Auth records, but Storage file contents and provider configuration need separate consideration. Review custom login-password restoration requirements for the chosen method. [Official backup documentation](https://supabase.com/docs/guides/platform/backups).

**If no suitable managed restore point exists:** obtain a private logical backup using the existing postgres administrator connection and a compatible PostgreSQL/Supabase CLI client, retaining verify-full TLS and keeping credentials out of arguments/logs. The [supported recovery workflow](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) needs roles, application schema and data exports—not a bare schema dump. Check actual coverage: managed Auth DDL is intentionally omitted from the CLI schema dump; the data export must include users, identities, sessions and related Auth tables. Restore logically into a compatible target's existing managed Auth schema, not by blindly overwriting platform objects/owners.

Retain all crawler/property/history data, membership/role data if present, view/functions/RLS/grants/defaults and role memberships, plus Auth data at a consistent snapshot. Store encrypted/private files outside Git with hashes, project/version/timestamp and table coverage. Validate restoration into a compatible isolated target before treating a logical export as recoverable. A matching-version PostgreSQL custom archive is another option with a reviewed managed-schema restore plan; an archive listing/checksum alone does not prove restoration.

## Dashboard actions for the owner

1. Select **Myoko Property Finder**, reference `fgdoqsepihlzfqlqymet`.
2. In **Database → Backups**, confirm a completed backup's time and restoration availability, or the actual PITR interval. If neither is usable, arrange the complete private logical export before requesting production application again.
3. Keep `finder_security` outside exposed Data API schemas. Do not grant custom Auth access or managed-role membership; this revision requires neither.
4. Completed: the separately approved migrations were applied after backup confirmation. Do not rerun them. Migrations do not activate authentication, assign administrators or enable paid access.

Email confirmation/SMTP, exact callback allowlists and optional Google OAuth remain separate Phase 2 setup in [the authentication handoff](property-finder-authentication.md); none needs changing just to review these migrations.
