# Database SQL

**Current upgrade:** `migrations/002_thumbnails_english_locations.sql` is applied. It gates thumbnail display on explicit permission and preserves the view contract/eligibility. The shared-dictionary backfill changed derived English fields only; all 20 eligible listings have English names and permitted thumbnail URLs. [Upgrade results](../docs/thumbnails-english-locations.md). The SQL body runs inside the upgrade runner's single transaction; it is not an independent fresh-install script. The original installed schema file and its historical manifests remain unchanged.

**Phase 5: the initial schema is now installed permanently in the dedicated development project.** The saved inventory is imported (34 internal / 20 eligible), and actual essential database/access checks pass. See [Phase 5 operations](../docs/phase5-database.md). Do not rerun the fresh-install SQL or pre-migration rehearsal against the installed database. Earlier proposal-only statements below are historical. The static validator's `sql_executed=false` describes that offline invocation, not the installation status.

**Current Phase 4B-3:** see [security findings and rollback rehearsal approval plan](../docs/phase4b3-security-review.md). The proposal is now 65 statements; remote synthetic checks are 43 statements/11 procedural bodies. PostgreSQL 17 test-role SET rights are granted only to the administrator inside the tests' final-ROLLBACK transaction. No production memberships/credentials are created. `tools.prepare_supabase_rehearsal` generates a reviewed one-transaction schema-plus-tests artifact ending in ROLLBACK; it does not execute it. All database writes still require explicit approval.

Phase 4B-2 adds a successful **read-only** Supabase inventory; no schema or SQL test has executed. See [readiness and pending approvals](../docs/phase4b2-supabase-readiness.md). `supabase/validation-order.json` pins the future remote order: proposal, then `supabase/001_synthetic_validation.sql`. That rollback script requires empty application tables and excludes local superuser bootstrap/session-authorization operations. It still requires explicit approval and reviewed role memberships; never apply the local manifest to Supabase.

- `001_proposed_schema.sql`: fresh-install Phase 4A design for PostgreSQL 15+ / Supabase. Creates no login credentials, subscription system or role memberships. It is not an upgrade script and must not be applied in this phase.
- `tests/001_contract_checks.sql`: prepared tests for a future disposable **local** database. They insert fictional test data, exercise roles/eligibility and end in ROLLBACK. They have been parsed, not executed. Do not run them against Supabase/production.
- `local/000_test_roles.sql`: guarded local test setup only. Requires a fresh isolated cluster and a named disposable database; refuses existing roles/schemas. Not a production migration.
- `tests/002_security_hardening_checks.sql`: prepared synthetic constraints/reader/writer/RLS/reactivation tests using session identity changes, not administrator-only queries. Ends in ROLLBACK; not executed.
- `validation-order.json`: ordered file list and reviewed SHA-256 checksums. The static validator checks integrity but executes nothing. Follow local setup → proposal → contract checks → hardening checks; never apply a directory glob or treat the local setup as a Supabase migration.

Offline validation from the project root:

```sh
.venv/bin/python -m pip install -r requirements-schema.txt
PYTHONPATH=src .venv/bin/python -m tools.validate_schema
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -t . -v
```

The optional parser is a development library, not a database service/client. No SQL executor is included. Without it, the original runtime tests still run and schema tests explicitly skip with an installation instruction.

See [database architecture](../docs/database-design.md), [migration/rollback](../docs/database-migration-plan.md) and [access review](../docs/database-access-review.md). SQL execution, role behaviour and query plans remain unverified until later local database validation is authorized and available.

Phase 4B-1 repeated local discovery and found no PostgreSQL or Docker installation. No service was installed/started. **Schema/role creation commits independently; test ROLLBACK only undoes test fixtures.** Roles outlive a dropped database, so use a disposable cluster rather than a database on a shared server. Review [the current report](../docs/phase4b1-validation.md) for required setup and operations that need backups to reverse safely.
