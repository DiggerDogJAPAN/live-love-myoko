# Phase 4B-3 — Supabase pre-migration security review

Reviewed **27 October 2026 (Japan time)**. **Ready for an explicitly approved rollback-only validation rehearsal. Persistent migration remains conditional on that rehearsal passing.** No migration, role grant, fixture insert or other database change was executed during this review.

## Evidence and existing project

The Session Pooler was inspected using the existing private environment file and trusted CA with `sslmode=verify-full`. PostgreSQL reports **17.11 / UTF8**, `postgres` as actor/session actor and `transaction_read_only=on`. Only fixed SELECT catalog queries and transaction-local safety settings were issued, then rolled back. Helpers were inspected, not invoked. No credential values, stored authentication hashes or property data were queried. The pooler authentication function's source references the authentication catalog; reading that source is not executing it or selecting authentication records.

No crawler schema, property API schema, application roles or application tables exist yet. The observed non-system schemas remain `auth`, `extensions`, `graphql`, `graphql_public`, `pgbouncer`, `public`, `realtime`, `storage`, and `vault`. The 44 relations are recognized platform/extension objects. Default privileges and existing role memberships were inspected; nothing was widened or revoked.

The user confirmed these **dashboard settings** (not inferred from an empty SQL setting):

| Setting | Confirmed value |
| --- | --- |
| Data API | Enabled |
| Exposed schemas | `graphql_public`, `public` |
| Extra search path | `public`, `extensions` |
| Exposed tables | None available |
| Exposed functions | 0 of 1 exposed |
| Automatically expose new tables | Disabled |
| Max rows / pool size | 1,000 / Automatic |

Neither `crawler` nor `property_api` is exposed or on the API extra search path. Preserve these settings. A row limit is not an access control. Even if exposure is accidentally changed, the proposal gives `anon`, `authenticated` and `service_role` no application schema/table/function grants and gives `authenticator` no application role membership. This is static defense in depth, not a claim that uncreated objects have passed live REST/GraphQL tests. The existing Realtime publication is not an all-tables publication; application tables must not be added to it.

## Helper review

All nine previously unresolved definitions and their effective access were reviewed. `sql/supabase/reviewed-helpers.json` records exact definition hashes, owners, ACLs, search paths and seven event triggers; it contains no source bodies or secrets. Changes trigger a new review, rather than being allowed merely because names are familiar. `tools.review_supabase_security` keeps raw definitions in an owner-only Git-ignored local artifact and prints only allowed metadata/hashes. The final read-only inspection matched the reviewed baseline.

| Helpers | Finding and migration impact |
| --- | --- |
| `public.rls_auto_enable` / `ensure_rls` | Security-definer owned by `postgres`, pinned `pg_catalog` search path, quoted `%I.%I` identifiers. Enabled event trigger only considers newly created tables in `public`, and catches/logs errors. It does **not** protect our custom schemas; explicit ENABLE/FORCE RLS is retained on every application table. Default PUBLIC execute exists, but this is an event-trigger function, not an ordinary customer-query RPC. No permission to create public objects was found for `anon` or `authenticated`. Leave the helper unchanged. |
| `pgbouncer.get_auth` | Security-definer owned by `supabase_admin`, empty pinned search path, parameterized authentication-catalog lookup. Anonymous/authenticated/authenticator/service roles have neither schema usage nor execute. Its privileged purpose requires preserving the platform ACL. Never invoke it in application tests or modify it. |
| `extensions.pgrst_ddl_watch`, `pgrst_drop_watch` | Invoker event-trigger functions with empty pinned search paths. Notify PostgREST to reload schema after supported DDL/drop events; do not grant application access. Leave unchanged. |
| `grant_pg_cron_access`, `grant_pg_graphql_access`, `grant_pg_net_access` | Invoker event triggers with empty pinned search paths, scoped to named extension creation. Our proposal creates no extensions, so their grant branches are not part of the migration. Do not copy their broad extension-specific grants into our schemas. |
| `set_graphql_placeholder`, `graphql_public.graphql` | The event trigger restores a placeholder on extension removal. Current GraphQL function is an invoker placeholder that returns an extension-disabled error, not a property resolver. Its missing fixed search path is a platform hardening consideration, not an observed elevated data-reading path. Do not change platform functions in this migration. |

The automatic-RLS helper resembles Supabase's documented example but differs in identifier quoting and swallowed errors. The review uses the actual definition, not an assumption of exact template equivalence. Hashes detect future drift; they are not an assurance about future platform updates.

## Proposed schema security

- All six tables have ENABLE and FORCE RLS. The two application roles are NOLOGIN, NOSUPERUSER, NOCREATEROLE, NOCREATEDB, NOREPLICATION, NOBYPASSRLS and NOINHERIT. No production login credentials or application role memberships are provisioned.
- The customer view is `security_invoker=true, security_barrier=true`. It and property RLS use the same fail-closed eligibility helper: both statuses active and only recognized unrestricted Japanese/source badges. Negotiation, viewing closure, sold, withdrawn, missing, unknown availability and contradictory raw labels are excluded. It now explicitly excludes synthetic sources as well as relying on source RLS.
- The explicit projection excludes UUIDs, source listing numbers, identity tokens, raw Japanese status labels, descriptions, permission evidence and crawl/history metadata. Upstream PDF/thumbnail filenames can still contain listing numbers; they remain approved URL fields, not dedicated identifier fields.
- Reader has usage only on `property_api`, SELECT on the safe view, narrowly listed base-column privileges required by invoker views and execute on the eligibility helper. It has no usage on `crawler`, no create privileges, no write rights and no identifiers in its base-column allowlist. Raw status labels are required internally by the predicate but are not view columns. Do not add private-schema usage or base-table API access later without reviewing this boundary.
- Writer can access internal records and insert/update observations, but cannot delete/truncate, edit source approval/rights fields, create schema objects or alter immutable history entries. Its unrestricted internal visibility is intentional; it is not a customer role.
- No application SECURITY DEFINER functions are proposed. The only application helper is an immutable SQL invoker with catalog-bound SQL body, pinned `pg_catalog` search path and explicit PUBLIC/anonymous/authenticated/service execute revocation. There is no dynamic SQL in the application helper.
- Existing managed defaults apply to their stated owners/schemas. The proposal uses private schemas, owner-specific defaults and explicit final revokes, including PostgreSQL 17 table privileges, rather than relying on platform defaults. Every future table/helper needs the same explicit privilege review. No project-wide default privileges are changed.
- Administrators remain trusted: actual `postgres` and `service_role` have BYPASSRLS. FORCE RLS does not constrain a BYPASSRLS actor, and an administrator can change grants/definitions. Do not use these identities for website queries or claim their successful SELECTs prove RLS.

## Subscription boundary — not implemented yet

**The view does not itself authenticate a person or validate a subscription.** It is a restricted backend interface. An anonymous visitor and any ordinary `authenticated` database user are denied, including a subscriber attempting direct access. Claiming `is_subscribed=true` in JWT/GUC/client input cannot grant this role or change these policies. The privileged backend reader can query without a user token; its credential is a trusted capability and must never reach visitors.

The intended customer path is: Cloudflare Pages Function/Worker verifies a real session and authoritative server-held entitlement → uses a separate restricted NOBYPASSRLS backend identity → parameterized safe-view query → explicitly allowed response fields. Authentication/entitlement failures, expiry, cancellation and provider outages must fail closed; paid responses require private/no-store caching and must not enter static builds. No reader identity may also SET ROLE to writer/admin or receive their memberships.

That backend and entitlement source do not exist yet. Consequently **subscription enforcement is not verified end to end and customer launch is blocked**, even if database RLS tests later pass. Adding a caller-controlled session variable, trusting a checkout redirect or granting reader membership to `authenticated` would not fix that gap. A direct browser-to-Supabase subscription design would require a separate reviewed entitlement/RPC architecture; none is silently introduced here.

## Corrections made locally

1. Pin migration search path to `pg_catalog` and apply transaction-local lock/statement timeouts of 5/60 seconds. Object references remain explicitly schema-qualified.
2. Add `AND NOT s.synthetic` to the customer view for independent source filtering, including when a privileged operator queries the view. Real crawler behavior is unchanged.
3. Correct the PostgreSQL 17 synthetic test harness: observed `createrole_self_grant` is empty. A non-superuser creator normally receives ADMIN membership with SET/INHERIT false. The test now validates actor/version, empty tables, safe role attributes, creator ADMIN memberships and platform role-switch rights before any fixture/role-grant changes. It then grants **only** the two application role switches to `postgres`, with `INHERIT FALSE, SET TRUE`, **inside the final-ROLLBACK test transaction**. It creates no logins, grants nothing to customer/API roles and does not change the bootstrap superuser's automatic ADMIN grant. Unexpected privileges cause a stop, not blanket repair.
4. Extend planned tests for private-field denial, synthetic source hiding, forged subscription claims, authenticated private-table denial and service-role grant denial. All source/property cases are invented; no live JSON import exists.
5. Add fixed read-only security inspection and exact helper/ACL/event-trigger drift detection. Refresh both local and remote SQL checksum manifests.
6. Generate a single-transaction rollback-only rehearsal locally, so role/schema creation, temporary role-switch grants and test rows can all be validated before any persistent migration.

## Controlled procedure requiring approval

The first requested approval should cover **only the complete generated rollback rehearsal**, not persistent migration or production credentials:

```text
data/supabase-rollback-rehearsal-0291b9647bdf.sql
SHA-256: 0291b9647bdf60c00e9264c242b0183f3faede5ce1c4d7daa449011a969cbcfb
106 statements; exactly one BEGIN and one final ROLLBACK; no COMMIT.
```

1. Recheck target/reference, verified TLS, exact helper baseline, dashboard exposure and fresh-install conflicts. Verify `sql/supabase/validation-order.json` checksums; review the complete generated SQL. Stop on drift, conflicting objects or nonempty application tables.
2. With explicit approval, use the intended project's SQL Editor/admin session to run the entire rehearsal as one script, never selected fragments. It creates only the two proposed schemas/roles, six application tables and fictional tests; preserves platform objects and settings; finally rolls everything back. On any failed statement, issue ROLLBACK/close the session and stop. No automatic grant widening or real-data retry is allowed. Ordinary server audit/log records are not undone by transaction rollback.
3. Read-only verification after rehearsal must confirm no application schemas, roles, role memberships or fixture rows remain, and platform metadata is unchanged. Inspect assertions/results and the exact role switches, not just exit success or administrator row counts. Managed SQL execution remains unproven until this step is actually run.
4. Only after the rehearsal passes, request separate approval for persistent `sql/001_proposed_schema.sql`. This file commits the schema and two NOLOGIN roles; PostgreSQL's creator ADMIN memberships are expected cluster-wide effects. It grants no website access. Do not apply local bootstrap scripts or run an SQL directory glob.
5. The standalone synthetic script may then be approved/run in an empty installed schema. It rolls back fixture rows and temporary administrator SET memberships, but does not undo the separately committed migration. Verify exact grants and absence of fixture residue afterwards.
6. Provisioning production identities, importing real records, wiring a backend, subscriptions or scheduling are later separately authorized work. Verify actual independent backend/writer sessions before customer access: administrator SET ROLE tests can always RESET ROLE to their privileged session and cannot prove that a real restricted login lacks that escape route.

Before commit, aborting the enclosing transaction reverses schema/role creation. After persistent migration, dropping populated tables/history loses data; require backups, dependency review and explicit destructive rollback approval. Never drop platform objects or use an indiscriminate DROP CASCADE/OWNED across the project. Existing migration/rollback documentation still applies.

### Synthetic role and entitlement matrix

| Test identity/context | Expected outcome |
| --- | --- |
| `anon` | View/private access denied; no application grants/memberships. |
| `authenticated`, unsubscribed | View/private access denied. |
| `authenticated`, self-claimed or actual subscribed | Still no direct SQL/API reader access; forged claim cannot change eligibility or grants. |
| Trusted backend after real session + entitlement verification | Restricted reader may return only eligible, nonsynthetic safe-view fields. SQL suite simulates the reader; actual subscription verification requires future backend tests. |
| Restricted reader | Two eligible fictional records; all unavailable/ambiguous/synthetic cases hidden; IDs/raw labels absent; no private schema usage or writes. |
| `service_role` | Application access denied by missing grants/schema usage despite BYPASSRLS. Never use as the customer identity. |
| Crawler writer | Internal unavailable records retained, source approvals immutable, delete forbidden; active → negotiation hidden → confirmed active visible. |
| Administrator | Setup/inspect only; not evidence of customer RLS or entitlement enforcement. |

Also cover duplicate source identity and price-event retries, pending-verification missing state, exact Myoko attribution and safe role attributes. Before public launch add HTTP tests for invalid/expired sessions, unsubscribed/expired/cancelled users, forged claims, unavailable rows, private-field injection, direct REST/GraphQL/RPC attempts, stale shared caches, SQL injection/pagination limits and role reset on pooled connections. No auth accounts, credentials, Stripe objects or website routes are created by this phase.

## Verification, files and decision

**159 Python tests pass** (145 previous plus 14 new review/hardening/rehearsal tests). Static parsing validates 65 proposal statements, 62 existing local checks/16 procedural bodies, six local bootstrap statements/one body, and 43 remote test statements/11 bodies. The generated rehearsal parses as 106 statements/11 procedural bodies. Checksums and transaction boundaries are tested. Static checks are not execution or proof of RLS/query-planner behavior.

Saved JSON state remains **34 internal / 20 eligible**, with unchanged state SHA-256 `6be170225ed596d471b1833e0ed6b01a5165e0a64b8b549b7a9b200772ba7e22`. Extraction, pricing, image/PDF links and filtering were not changed.

Changed/added files: `sql/001_proposed_schema.sql`, both `validation-order.json` manifests, `sql/supabase/001_synthetic_validation.sql`, `sql/supabase/reviewed-helpers.json`, `tools/supabase_preflight.py`, `tools/review_supabase_security.py`, `tools/prepare_supabase_rehearsal.py`, `tools/schema_checks.py`, `tests/test_schema.py`, `tests/test_supabase_preflight.py`, `tests/test_supabase_security_review.py`, README and linked database docs. Private review/rehearsal artifacts remain Git-ignored under `data/`. The private environment file was not modified.

**Decision:** ready for approval of a controlled rollback rehearsal. Existing helpers and confirmed Data API settings present no identified conflict with that rehearsal. Persistent installation depends on its successful PostgreSQL execution; public/customer access additionally depends on a built and tested entitlement-enforcing backend and independent restricted credentials. No database changes or real imports were made; no website/Directus changes, credentials, deployment, commits or pushes occurred.

Primary references: [Supabase custom-schema exposure](https://supabase.com/docs/guides/api/using-custom-schemas), [Supabase automatic-RLS event trigger](https://supabase.com/docs/guides/database/postgres/event-triggers), [PostgreSQL 17 invoker view permissions](https://www.postgresql.org/docs/17/sql-createview.html), [PostgreSQL 17 creator ADMIN/SET defaults](https://www.postgresql.org/docs/17/role-attributes.html), [role membership options](https://www.postgresql.org/docs/17/role-membership.html). The database observations above are direct read-only findings; the dashboard settings are the user's confirmation.
