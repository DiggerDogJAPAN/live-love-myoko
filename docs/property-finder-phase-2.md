# Property Finder — secure live-data setup

This guide describes the deployed Supabase-only application. Both old Finder Access applications have been removed by the owner. See [authentication](property-finder-authentication.md), [membership security](property-finder-membership-security.md) and the [production deployment checklist](property-finder-deployment-checklist.md). The historical Access transition is retained only in the [short rollback record](property-finder-supabase-cutover.md).

## Request path and runtime

Next.js produces a static `out/` export. The search page is a generic access-checking shell and fetches `GET /api/property-finder/properties` with same-origin credentials and no-store caching. Root Pages Functions serve Auth and Finder APIs; no browser database client, static Finder inventory, public probe endpoint or separate Worker is required.

- `authorization.ts` verifies a Supabase session, loads the version-2 private account/session snapshot and checks a server-selected permission. Private administrators need no subscription; all customer listings remain disabled by `FINDER_CUSTOMER_ACCESS=disabled`.
- `customer-auth.ts` verifies the dedicated issuer, asymmetric signature, audience, authenticated role, signed user/session IDs and expiry. Legacy proxy/email headers never authenticate.
- `membership-database.ts` calls fixed private helpers using signed identity arguments. Browser metadata cannot grant roles or payment.
- `database.ts` uses the existing restricted reader and Hyperdrive. It validates database identity and uses a read-only transaction, explicit projected fields and `SET LOCAL ROLE crawler_customer_reader` against `property_api.customer_properties`. It has no crawler/admin write credentials.
- `PropertyFinderAccess.tsx` renders loading/sign-in/denied/failure/authorized states, clears data on logout/denial and revalidates returning sessions. Directory filters, sorting, pagination and source/enquiry actions are preserved.

Eligibility, source-specific types, thumbnail permissions/fallbacks, locations and original source links remain defined by the current Finder model and restricted database view. Counts are read from the eligible view, not hardcoded. The bounded query fails closed rather than silently truncating; review authenticated server pagination before exceeding its limit.

## Existing database and TLS resources

The restricted `property_finder_web_reader` was provisioned on 28 October 2026. Connection details exist only in private local/server bindings. `sql/provision-property-finder-reader.sql` is a historical provisioning reference, not a migration to rerun. Applied membership migrations 001/002 and their authorization helpers are documented in the [production receipt](property-finder-membership-migration-results.md); do not rerun them or grant browser access to private Auth/membership tables.

The website accepts only the intended Supabase direct/session-pooler connection and dedicated reader identity. Preserve trusted TLS/hostname verification, the existing Supabase CA, timeouts, read-only SQL, restricted role, source eligibility and RLS. Hosted Hyperdrive uses `FINDER_HYPERDRIVE`, verify-full and disabled query caching. Never replace it with crawler credentials or weaken TLS to resolve connectivity failures.

## Local development

`npm run dev -- --hostname 127.0.0.1` serves clearly labelled synthetic fixtures for presentation work. Production never exports that inventory. For a compiled Pages preview use the established workflow:

```sh
npm run build
# Keep existing private .dev.vars and the trusted FINDER_LOCAL_CA_FILE.
npm run finder:dev:trusted
```

The launcher uses Wrangler's supported Hyperdrive emulator at port 8788 with the existing restricted reader and CA, without logging/writing credentials. The same Supabase authorization, reader checks and SQL run in workerd. Local emulation does not certify hosted pooling. Auth origin configuration and Secure cookies still apply; do not create a localhost identity bypass or use a legacy Access assertion as an alternative credential. Use isolated tests for flows that need a configured secure origin/provider.

Runtime binding names and production setup are maintained in the [deployment checklist](property-finder-deployment-checklist.md) and `.dev.vars.example`. Preserve local/preview Auth defaults unless explicitly configured for an approved test origin. No Access team, audience, email allowlist or tunnel protection is required by the current application.

## Verification and deployment

Run the full automated security/Auth tests, TypeScript, relevant lint, the complete CMS build/export security audit and production Functions compilation. Publish only through the established GitHub → Pages workflow with the complete regenerated `out/`; do not upload a partial static directory or manually deploy a separate API. Verify public CMS routes and cookie-free denial of Finder data, then use the existing administrator for a fresh Supabase login. Paid customer access, Stripe and Premium features remain separate work; planned Basic/Premium prices are ¥2,000/¥4,000 per month.
