# Phase 4B-2 — Supabase read-only readiness

Historical Phase 4B-2 snapshot. The later [Phase 4B-3 review](phase4b3-security-review.md) resolves helper/Data API questions, updates local SQL/hashes and supplies the current approval plan. The original hash/counts below describe the earlier proposal; no version has been applied.

Reviewed 27 October 2026 (Japan time). **The Session Pooler connection succeeds with certificate-chain and hostname verification enabled. No migration, role change or data write has been executed.**

## Connection findings

- `.env.supabase.local` is owner-only and excluded by `.gitignore`; the public `.env.supabase.example` is intentionally included. Ignore rules were checked using Git in a disposable temporary repository because this workspace has no Git metadata.
- The Session Pooler username embeds the same project reference as the independently configured expected reference. The expected name is `Myoko Property Finder`. PostgreSQL does not store the dashboard display name, so the reference/name association relies on the user's dashboard confirmation.
- Psycopg binary client 3.2.13 is installed in the local virtual environment; its bundled libpq is 17.6. No PostgreSQL server or service was installed. The optional dependency is pinned in `requirements-database.txt`.
- Connection uses port 5432 and `sslmode=verify-full` with the user-supplied trusted CA file. Earlier attempts failed verification; an intermediate configured path did not exist. After the path was corrected, the verified connection succeeded. Neither verification nor hostname checking was disabled.
- Server reports PostgreSQL **17.11**, database/session actor `postgres`, UTF-8, and `transaction_read_only=on`. Queries were fixed catalog reads within a read-only transaction, followed by rollback and close. No listing rows, secrets, function bodies or unrestricted role settings were queried.

The credential-free local metadata report is `data/supabase-preflight.json` (Git-ignored). It contains role/object metadata and should remain internal. Credentials and CA paths are absent from its output.

## Inventory and security findings

Observed schemas: `auth`, `extensions`, `graphql`, `graphql_public`, `pgbouncer`, `public`, `realtime`, `storage`, `vault`, plus PostgreSQL system schemas excluded from the report. There are 44 non-system relations; all are extension-owned or recognized platform-owned objects. **No public application tables or conflicting `crawler` / `property_api` schemas or crawler roles were found.**

The conservative preflight nevertheless blocks declaring the entire application inventory empty: nine non-extension functions need explicit classification. Eight are owned by `supabase_admin` in `extensions`, `graphql_public` and `pgbouncer`; their names match platform helpers. The remaining `public.rls_auto_enable` is owned by `postgres`, is security-definer and has a default ACL. Its name matches Supabase's documented automatic-RLS helper. Names/owners alone do not verify definitions or event-trigger effects; review these before applying the proposal. Do not drop, replace or broadly allowlist them to clear the check. No conflicting application table was detected, but a pristine application-function inventory is **not confirmed**.

`postgres` has CREATEROLE/schema-creation capability and BYPASSRLS, but is **not a superuser**. `service_role` also has BYPASSRLS. This administrator connection is unsuitable as proof that customer RLS works. Existing anonymous/authenticated roles are not BYPASSRLS. Managed default privileges in public/platform schemas must be preserved; create application objects only in the two private proposed schemas with explicit revokes/grants.

No SQL-visible `pgrst.db_schemas` role setting was returned. This does **not** establish that the Data API is disabled or that schemas are unexposed; confirm exposed schemas in the dashboard. Keep both application schemas outside the Data API for the initial backend-only design.

## Compatibility and adjustments

The unchanged proposal requires PostgreSQL 15+; the observed server meets that requirement. It creates two cluster-wide NOLOGIN/NOBYPASSRLS roles, two schemas, six tables, RLS policies, indexes, a restricted invoker view and its eligibility helper. It uses core UUID support and requires no extension installation. Its SHA-256 is:

```text
4a840e4fd47d0829bfb9fc1d6c1e91c9a324d220aa39a661921a75f034f3d5b1
```

No schema changes were justified by read-only inspection. **Execution and RLS remain unverified.** Local superuser/bootstrap scripts must not be sent to Supabase. A separate remote validation manifest and synthetic rollback script now exclude them. Role switching must be supported by actual managed memberships; if a test cannot SET ROLE, stop and review rather than adding broad grants. PostgreSQL 17 role creation/membership rules must be tested after approval, not assumed from CREATEROLE alone.

The proposed security-invoker view still needs its restricted reader's underlying column grants and RLS policies; the absence of base-schema USAGE is intentional. Anonymous/authenticated users receive neither this reader role nor view access. Future Cloudflare Pages Functions/Workers should verify session and authoritative subscription entitlement server-side, then query the restricted view using a separate NOBYPASSRLS backend identity. Browser code must never receive writer, administrator or service-role credentials. Static page output cannot enforce paid access by itself. No website or Stripe integration is implemented.

## Commands and approval boundary

These commands are safe now, from the project root:

```sh
.venv/bin/python -m tools.supabase_preflight --check-config
.venv/bin/python -m tools.supabase_preflight
PYTHONPATH=src .venv/bin/python -m tools.validate_schema
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -t . -q
```

The first command checks private configuration and reviewed hashes without connecting; the second performs only the read-only inventory. Neither tool can apply SQL. Avoid sourcing the environment file in a shell or putting a URI on the command line.

**Future execution plan, requiring separate explicit approval:**

1. Review existing helpers/event triggers and dashboard API exposure; rerun read-only preflight and review the exact target and checksums. Resolve all reported blockers before applying anything.
2. Approve exactly the files/order in `sql/supabase/validation-order.json`. In the intended project's SQL Editor, execute the complete `sql/001_proposed_schema.sql` file once. Its explicit transaction commits schema and role creation. Do not run a directory glob, local bootstrap or local session-authorization tests. Do not silently skip existing objects.
3. In a separate execution, run the complete `sql/supabase/001_synthetic_validation.sql` file. It first requires all six application tables to be empty, uses only invented sources/records, switches current role for denial/eligibility checks and ends in ROLLBACK. No real JSON state is read/imported. On any error, explicitly roll back that session; never continue past a failed assertion.
4. Independently verify no fixture rows remain, exact grants/RLS/view columns, and source status exclusions. Later provision separate backend/writer login identities with reviewed memberships and test fresh authenticated sessions; an administrator's SET ROLE test alone cannot prove session-level privilege isolation or subscription enforcement.

Synthetic checks cover unknown/restricted statuses, sold/withdrawn/missing, reader field restrictions, anonymous/authenticated denial, writer privilege boundaries, active → negotiation → active visibility, duplicate identity and repeated price-event rejection. They have been parsed, **not run**. Existing local hardening checks remain reserved for a disposable local superuser cluster.

Test ROLLBACK does not undo a committed schema migration. Before commit, transaction rollback can undo creation; after commit, removing populated tables/history loses data and requires backup/export and explicit authorization. Roles are cluster-wide and need dependency review before removal. Preserve platform objects and existing grants. See the existing migration/rollback plan for import and future writer requirements.

## Verification and changed files

**145 Python tests pass**, including all 122 previous tests and 23 new connectivity/plan tests. Static validation parses all 62 schema statements; the remote synthetic script parses as 33 statements and nine procedural bodies. This is not PostgreSQL execution. Saved local state remains **34 internal / 20 eligible**, with unchanged state hash and customer export; extraction/filtering behavior is untouched.

Added: `.env.supabase.example`, private ignored environment file, `requirements-database.txt`, `tools/supabase_preflight.py`, `tools/validation_manifest.py`, `tests/test_supabase_preflight.py`, `sql/supabase/validation-order.json`, `sql/supabase/001_synthetic_validation.sql`, and this report. Updated: `.gitignore`, `MANIFEST.in`, `tools/schema_checks.py` (shared checksum helper), README and SQL/migration/access documentation. No changes were made to the schema proposal, crawler runtime, live JSON state or website.

Connectivity is ready for further read-only validation. **Migration approval is still pending**, along with helper/event-trigger review, Data API exposure confirmation and real-role security execution. No database changes, real imports, live crawls, paid calls, deployment, commits or pushes occurred.

## Primary references

- [Supabase connection modes and Session Pooler](https://supabase.com/docs/guides/database/connecting-to-postgres).
- [Supabase managed roles and superuser limitations](https://supabase.com/docs/guides/database/postgres/roles-superuser).
- [Supabase event triggers and automatic RLS example](https://supabase.com/docs/guides/database/postgres/event-triggers).
- [PostgreSQL certificate-chain and hostname verification](https://www.postgresql.org/docs/current/libpq-ssl.html).
