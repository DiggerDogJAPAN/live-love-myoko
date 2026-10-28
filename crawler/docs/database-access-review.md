# Phase 4B security and access review checklist

**Phase 5:** actual database checks now confirm six RLS-enabled/forced tables, 34 internal/20 eligible rows, restricted-reader filtering/field projection, and anonymous/authenticated denial. Repeat sync and rollback-only price/status transitions passed. See [current results](phase5-database.md). Independent production login and subscription/backend enforcement remain next-phase work; not every historical checklist item below has been executed.

Phase 4B-3: existing helpers/ACLs/event triggers and managed role options were inspected read-only. User-confirmed Data API exposure excludes both application schemas. The [current security report](phase4b3-security-review.md) records evidence, local corrections, PostgreSQL 17 test-role handling and the approval boundary. **Runtime RLS and subscription tests remain pending**: no schema exists yet and no entitlement backend has been built. The view is restricted to a trusted backend reader, not a database subscription check.

All items are **pending runtime verification** unless explicitly labelled static. Phase 4A performed syntax/AST checks only; it did not connect to PostgreSQL/Supabase. This checklist does not imply that access has already been provisioned.

Phase 4B-1 found no suitable local runtime, so SQL execution remains stopped. Expanded session-identity/reader/writer tests and a checksum-pinned validation order are prepared, not executed. See [environment, setup and current results](phase4b1-validation.md). No existing grants were widened.

## Roles and schema boundaries

- [x] Static: base tables are private, RLS is enabled/forced on all six tables, and roles are NOLOGIN/NOBYPASSRLS without memberships.
- [x] Static: no grants to `PUBLIC`, `anon`, `authenticated` or `service_role`; no writer DELETE/TRUNCATE; no customer access to IDs, histories, cache or run logs.
- [ ] Verify actual target-server role inheritance, memberships, table ownership, defaults and RLS. Ensure future reader/writer connection identities are neither owners nor BYPASSRLS roles.
- [ ] Verify the reader can query the invoker view with its exact underlying column privileges, but cannot resolve `crawler` table names or retrieve raw source labels. It intentionally has no private-schema USAGE.
- [ ] Check Supabase exposed schemas/REST/GraphQL/Realtime and inherited/default grants. Neither custom schema is automatically exposed by this design, and changing project exposure is a separate action.
- [ ] Confirm anonymous and ordinary authenticated requests cannot read the view or base tables. A logged-in user is not automatically a subscriber.

## Eligibility and privacy

- [x] Static: the same eligibility function is referenced by RLS and the security-invoker/security-barrier view. Both active statuses plus an unrestricted known label are required.
- [x] Static: the customer projection omits source IDs/UUIDs, source keys, raw status labels, internal titles, permission evidence and crawl logs.
- [ ] Run the prepared local SQL tests, plus all status transitions and reactivation. Verify stale raw restriction labels override contradictory active flags; unknown statuses never become public.
- [ ] Verify active → negotiating/viewing-closed/sold/withdrawn/missing hides the row; an observed active reactivation restores it without deleting internal history.
- [ ] Test unauthorized column selection, relationship embedding, function/RPC access, prepared search inputs and unexpected API endpoints. Confirm the private eligibility helper is not exposed as a public RPC.
- [ ] Confirm source attribution remains **Source: Myoko Akiya Bank** for Myoko, and another agency uses its own attribution. Render resource URLs as labelled links rather than property numbers.
- [ ] Match the current snapshot's 34 internal / 20 eligible counts and compare all common display fields. Keep Japanese labels private despite the legacy local JSON's broader shape.

## Subscription-aware server path

- [ ] Choose a Cloudflare Pages Function/Worker or other backend; no paid-data or entitlement decisions belong only in the static Next.js build/browser.
- [ ] Validate session tokens server-side and use authoritative server-held subscription state; reject client-supplied payment flags, unverified JWTs and redirects claiming checkout success.
- [ ] Define Stripe event verification, replay/idempotency, expiry, cancellation and entitlement revocation before connecting Stripe. No entitlement table/provider integration is implemented in Phase 4A.
- [ ] Keep reader and writer secrets server-side and out of `NEXT_PUBLIC_*`, source files, static artifacts, logs and browser responses. Never send a Supabase service-role key to the browser.
- [ ] Use parameterized, bounded queries against the safe view, private response/cache controls and tested entitlement revocation. Fail closed when authentication, entitlement or database checks fail.

## Writes, history and operations

- [x] Static: per-source run idempotency, source-scoped identity/URL constraints, composite same-source event references and per-property/run history uniqueness are declared.
- [ ] Test concurrent source locks/retries and transaction rollback. No failed/partial acquisition may infer absence or advance last-complete metadata.
- [ ] Verify real sightings advance last-seen; missing checks do not. Preserve null legacy sighting gaps rather than fabricate a time.
- [ ] Verify known-price-only events, immutable status/price history, legacy import hashes and translation cache hit/invalidation behaviour.
- [ ] Review each source's permission/configuration records, retention/removal handling, backup/restore and operational alerts. Add new sources without auto-merging similar properties.
- [ ] Test the exact PostgreSQL/Supabase version, extension assumptions, function catalog binding, SQL regex/collation and view query plans. Static parsing alone does not establish production readiness.

# Phase 4B-2 read-only findings

The approved Session Pooler catalog inspection succeeded with verified TLS. Managed `postgres` and `service_role` have BYPASSRLS; administrator connectivity is not an RLS test. Existing platform/default grants remain untouched. No crawler schema exists yet. Review existing helper/event-trigger behavior and dashboard exposed schemas before migration, then test actual restricted roles after separate approval. See [the complete readiness report](phase4b2-supabase-readiness.md). No SQL security test has executed remotely.
