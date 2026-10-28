# Phase 4B-1 — PostgreSQL validation and hardening

Reviewed 27 October 2026 (Japan time). **Real PostgreSQL execution is blocked by the absence of a local runtime.** The independent Python compatibility, static validation, prepared security-test and migration-safety work is complete. No database was connected, installed, started, created or modified.

## Environment and required setup

Discovery found none of `psql`, `postgres`, `initdb`, `pg_ctl`, `pg_isready`, `docker`, `podman` or `colima` on PATH. The usual Postgres.app, Docker.app, OrbStack.app, Homebrew PostgreSQL/libpq locations and user Docker CLI locations were absent. No PostgreSQL sockets were found in `/tmp` or `/private/tmp`. Discovery made no database connections. The existing `pglast` library is a syntax parser, not a server.

Database execution stopped at that point, as requested. To proceed later, supply an existing suitable environment or approve setup of **PostgreSQL 15+ with UTF8 and the psql client**, or a running Docker environment with an available compatible PostgreSQL image. Installation/image acquisition and starting an otherwise unavailable service were not performed. An isolated temporary cluster is required, not merely another database on a shared cluster: the schema creates cluster-wide roles.

The test operator needs a disposable local superuser to create stand-in roles and impersonate test session identities. Use a database named `myoko_schema_test_<suffix>`, a local Unix socket or loopback endpoint, and no Supabase connection string. For a container, use its local socket from inside the disposable container rather than weakening the test's local-server guard.

## Files changed

| Files | Change |
| --- | --- |
| `src/myoko_property_crawler/normalize.py`, `models.py` | Shared municipality vocabulary now includes `飯綱町` / `Iizuna Town`; existing canonical values remain valid. |
| `tests/test_geography.py` | Six regression tests for normalization, model validation, JSON/reconciliation compatibility, old municipalities, unknowns and Kurohime's area classification. |
| `sql/local/000_test_roles.sql` | Prepared guarded local-only role setup, with no broad object grants and no modification of existing roles. |
| `sql/tests/002_security_hardening_checks.sql` | Prepared synthetic role, RLS, constraint, privacy, reactivation and price-retry tests; all fixture writes end in ROLLBACK. |
| `sql/validation-order.json` | Explicit staged validation order with SHA-256 checksums. No SQL execution is implemented by this manifest. |
| `tools/schema_checks.py`, `tests/test_schema.py` | Parse the expanded scripts, validate order/checksums/paths, and inspect role identities and absence of extra grants. |
| `MANIFEST.in` | Include the JSON validation manifest in source distributions. |
| Root README, SQL README, database design/migration/access documents, this report | Current results, setup blocker, role differences, ordered validation and rollback limits. |

The proposed schema and its production-role grants are unchanged. No extraction, customer filtering, prices, thumbnail handling or PDF references were changed. Live JSON files remain unchanged.

## Prepared SQL and security coverage

The ordered plan is:

1. `sql/local/000_test_roles.sql`: local test setup only, not a production migration.
2. `sql/001_proposed_schema.sql`: fresh schema/role proposal.
3. `sql/tests/001_contract_checks.sql`: original rollback-based contract cases.
4. `sql/tests/002_security_hardening_checks.sql`: stronger rollback-based role and integrity cases.

Checksums pin each file's reviewed content, and the static tool rejects stale hashes, duplicate paths or files escaping the workspace. No executor runs the plan. Do not use directory glob order or run local bootstrap SQL as a Supabase migration.

| Identity or concern | Prepared assertion | Runtime result |
| --- | --- | --- |
| Anonymous visitor (`anon`) | Deny customer view and private records. | Not executed |
| Signed-in customer (`authenticated`) | Login alone grants neither inventory nor logs; subscription access remains server-gated. | Not executed |
| Restricted backend reader | Read only eligible display rows, observe active RLS, deny private tables/logs, omit UUID/source ID/raw status columns, deny writer escalation and row-security bypass. | Not executed |
| Crawler writer | Retain/read all statuses, write valid price events, reject event retries, deny deletes, source approval/configuration edits and history rewrites. | Not executed |
| Elevated service stand-in | BYPASSRLS does not substitute for schema/object privileges. | Not executed |
| Eligibility | Exclude negotiation, viewings closed, sold, withdrawn, missing, unknown availability and contradictory raw labels. | Not executed |
| Transitions | Active → negotiation hides a row; confirmed active and missing → observed active restore visibility without deleting internal data. | Not executed |
| Integrity | Required indexes and forced RLS, negative price, infinite area, impossible dates, time ordering, source-mismatched foreign keys, run identity and price-event uniqueness. | Not executed |

**No broad grants were added to make tests pass.** The local bootstrap refuses pre-existing application roles/schemas and unexpected targets. Synthetic rows use ordinary source flags solely to exercise production eligibility; all fixture inserts/updates are inside rollback transactions. No saved live records are used as database test fixtures.

The original test file used `SET LOCAL ROLE`, which is useful for current-role checks but leaves the privileged session identity unchanged. The new tests use `SET SESSION AUTHORIZATION`, assert both identities and then try privilege escalation. This removes a misleading privilege-test shortcut; it is **not** evidence that the tests have passed on a server. The original small contract file remains as a baseline.

## Ordinary PostgreSQL versus Supabase

- Ordinary PostgreSQL does not provision Supabase's role/JWT infrastructure. Local stand-ins reproduce role names and the important service-role bypass attribute, not Supabase Auth, PostgREST, JWT claims, API defaults, connection pooling or subscription entitlement. Supabase uses `authenticator` to switch into the JWT-selected role; `anon`, `authenticated` and `service_role` have different purposes. [Supabase role reference](https://supabase.com/docs/guides/database/postgres/roles).
- A local test superuser can impersonate session identities. Supabase's managed `postgres` account is not a full superuser, so local bootstrap/impersonation commands must not be assumed deployable there. They are explicitly separate from the schema proposal. Review actual managed-role memberships and provisioning permissions before any eventual deployment. [Supabase superuser limitations](https://supabase.com/docs/guides/database/postgres/roles-superuser).
- PostgreSQL superusers and BYPASSRLS roles bypass row security; ordinary table owners normally do too unless forced. Therefore customer checks cannot be performed only as an administrator. Table-level operations such as TRUNCATE are outside RLS, which is why object grants are also restricted. [PostgreSQL row security](https://www.postgresql.org/docs/15/ddl-rowsecurity.html).
- Supabase's elevated service role bypasses RLS and must not be the customer-reader identity. The prepared local test explicitly checks object-grant denial even for that stand-in. Real Supabase API exposure/default grants and subscription enforcement still need a separately authorized later validation; none was attempted. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Migration safety findings

The core proposal remains one unapplied fresh-install file. It is not idempotent and must not be rerun over an existing deployment. Its content is now pinned by the validation manifest. Once first applied, retain that file/hash and add subsequent numbered migrations instead of silently editing the applied definition.

Both local bootstrap and the schema file commit their own transactions. The two check files roll back their **own fixtures**, not previously committed schemas/roles. A failure in a later file therefore does not undo earlier files. An outer `psql --single-transaction` does not make these embedded commits disappear. Roles are cluster-wide and survive dropping only a test database. Dispose of a dedicated test cluster after review; never automatically drop shared roles or application schemas.

After data exists, dropping schemas/tables, truncating history, destructive column/type conversions or changing identity mappings cannot be safely reversed merely by reversing DDL. Retain a verified database backup and UUID/source mapping. Restoring only an old JSON snapshot can lose newer database-only history. The existing rollback plan now states these limits explicitly and uses access disablement/backup restoration rather than automatic destructive cleanup.

## Verification results

- **122 Python tests pass**: the original 111 plus six geographic regressions and five additional static plan/security-test checks. These do not execute a database.
- Parsed **62 proposal statements**, **6 local-setup statements**, **62 prepared integration-test statements**, and **17 PL/pgSQL bodies** across setup/tests. Successful parsing does not verify catalog binding, constraints at execution time, grants, RLS, query plans or managed Supabase behaviour.
- The read-only eligibility simulation still matches **34 internal / 20 eligible saved records**. The existing customer export stays at 20. Live snapshot and customer files were not rewritten.
- **PostgreSQL integration tests executed: 0. SQL/RLS runtime result: unverified.** No available local environment existed; no service was installed or started to work around that restriction.

Run the available offline checks from the project root:

```sh
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -t . -v
PYTHONPATH=src .venv/bin/python -m tools.validate_schema
```

## Outstanding decisions

Provide/approve an isolated PostgreSQL environment, then execute the prepared order with explicit local target details and fail-fast psql settings. Resolve any real execution failures without weakening privileges, confirm all role cases and rollback behaviour, and record the exact server version/results. Only after that should a separate phase authorize Supabase provisioning, target-role review and subscription-aware server implementation. No Supabase/Stripe connection, live crawl, website/Directus modification, scheduling, deployment, commit or push occurred here.
