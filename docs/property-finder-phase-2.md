# Property Finder: secure live-data setup

The dedicated `property_finder_web_reader` login was provisioned on **28 October
2026 (Japan time)**. Its connection is stored only in owner-readable, Git-ignored
`.dev.vars`. The existing verified administrator connection was used only for
provisioning and verification; the website uses the restricted login exclusively.
The owner has configured the Access application and local issuer/audience/admin
bindings. Browser Access authentication is still required for live API requests.
Synthetic development remains available at port 3000.

## Request path and files

The Next.js site remains a static Cloudflare Pages export. The exported search
page is an empty access-checking shell. After hydration it fetches the same-origin
`GET /api/property-finder/properties` with credentials and `cache: no-store`.

`functions/api/property-finder/[[path]].ts` runs separately as a Pages Function;
static export does not prevent using Pages Functions. A separate Worker, CORS
endpoint and Supabase public Data API are unnecessary.

- `server/property-finder/access.ts`: verifies the Cloudflare Access JWT using the
  team's rotating public signing keys, RS256, exact issuer/audience, required
  expiration and individual identity. An exact server-held admin email allowlist
  is checked separately. Identity/email headers alone are never trusted.
- `server/property-finder/database.ts`: `pg` uses its supported `pg-cloudflare`
  transport with Workers TCP sockets. TLS is mandatory with trusted certificate
  verification and the actual database hostname explicitly supplied for identity
  verification (`expectedServerHostname` in Workers, `servername` in Node).
  Connection-string SSL overrides and administrator usernames are rejected.
- Every query runs in a read-only transaction with `SET LOCAL ROLE
  crawler_customer_reader`, a query timeout and an explicit column projection from
  `property_api.customer_properties`. There are no base-table reads or writes.
- Responses are private/non-cacheable, have no CORS grant and contain only display
  fields and their derived count. There are no JWTs/credentials in browser storage,
  static listings, raw database errors or publicly cached responses.
- `PropertyFinderAccess.tsx` renders loading, sign-in, failure and authorized states.
  `PropertyFinderDirectory.tsx` retains existing filters, sorting and Load More.
  Returning to the tab rechecks access; denied/error responses clear the directory.

The current customer view has no property type, publication date or image-rights
flag. Those values stay null, so the type/newest filters are hidden for this feed
and images use placeholders. `last_checked_at` is not treated as a listing date.
Myoko Akiya Bank's documented Myoko City coverage supplies its municipality;
other sources are not guessed. Prices, original PDF links and English/Japanese
location fallbacks come from the customer view. Unavailable rows are excluded by
both the view and the API's active-status checks. Counts are never hardcoded.

The authorized snapshot is bounded to 500 rows; a larger result fails closed
instead of silently truncating. Add authenticated server pagination before the
inventory grows beyond this bound. Stripe is not connected: the server-side
`requireFinderEntitlement` boundary currently allows approved admins only.

## 1. Dedicated PostgreSQL login (provisioned; reference steps)

1. Confirm you are in the dedicated **Myoko Property Finder** Supabase project.
   Use its SQL Editor or your existing private administrator psql session **only
   to perform provisioning**, never as the website connection.
2. Review and execute `sql/provision-property-finder-reader.sql` once. It creates
   `property_finder_web_reader` with no superuser, creation, replication or RLS
   bypass privileges. Its only application membership is the existing
   `crawler_customer_reader`, with explicit SET permission and no inheritance.
   The existing view, tables, RLS policies, crawler and Data API exposure are unchanged.
3. Set a unique generated password. In interactive psql use
   `\password property_finder_web_reader`; alternatively run a password-setting
   statement privately in the SQL Editor. Do not save that statement or password
   in source control, terminal arguments, chat or logs.
4. In Supabase's project **Connect** dialog, use the **Session pooler** hostname
   and port **5432** (or the verified direct database hostname if reachable).
   Use database `postgres`, your new password, and the dedicated username:
   - Session pooler: `property_finder_web_reader.<actual-project-ref>`
   - Direct connection: `property_finder_web_reader`
   Percent-encode URI username/password characters. The independently configured
   project reference must match the intended project. Only Supabase direct/session
   pooler hostnames and this dedicated username are accepted by the code.
5. Reconnect as the new login, with TLS **verify-full**, and verify:

   ```sql
   BEGIN READ ONLY;
   SET LOCAL ROLE crawler_customer_reader;
   SELECT current_user, count(*) FROM property_api.customer_properties;
   ROLLBACK;
   ```

   Confirm it returns the eligible count from the live database. Separately verify
   selecting `crawler.properties` by name is denied and the reader cannot write.
   Do not grant private-schema USAGE, writer/admin memberships or broader table access
   to make a failing check pass. Review existing role/view provisioning instead.
6. Leave `crawler` and `property_api` outside the Supabase Data API's exposed
   schemas. Do not grant `anon`, `authenticated` or `service_role` new privileges.

Verification with the real restricted login returned **20 eligible listings**.
Direct internal-table reads, writes through the view, writer/admin/service-role
assumption and RLS bypass were denied. All 34 internal rows and the customer view
definition remained unchanged.

This project's session-pooler certificate uses **Supabase Root 2021 CA**, which is
not in the default Node/Workers browser trust store. The existing trusted CA is
preserved in local `FINDER_LOCAL_CA_FILE`. The launcher below supplies this CA to
Wrangler's supported local Hyperdrive emulator with `sslmode=verify-full` and
`sslrootcert`. No TLS verification is disabled.

Before a hosted deployment, configure Cloudflare Hyperdrive with the existing CA
and **verify-full** origin verification, and supply its `FINDER_HYPERDRIVE` binding.
The API supports this binding and verifies the dedicated database session identity.
`wrangler.jsonc` now binds `FINDER_HYPERDRIVE` to `myoko-property-finder`
(`d2e1e9cc5947483f8747b8e84ccaf57b`) on the existing `livelove` Pages project.
All five required Production settings are present: four plaintext values match
local configuration and the database URI is an encrypted secret whose value cannot
be read back. Hyperdrive's origin credentials were updated from private `.dev.vars`
with the owner's authorization and the saved reader username/project suffix were
verified. The same credentials can read the eligible view while internal-table
reads, writes, privileged role changes and RLS bypass are denied. The existing CA,
verify-full TLS and disabled caching were preserved.
See the [Git-connected deployment checklist](property-finder-deployment-checklist.md).
The local CA file path is not transferred to production; hosted Hyperdrive uses
the already uploaded CA certificate. No deployment is needed for local emulation.

## 2. Cloudflare Access (configured by the owner; reference steps)

1. Open **Cloudflare dashboard → Zero Trust → Access controls → Applications →
   Add an application → Self-hosted**.
2. Create the administrator application for the actual site hostname, normally
   `love-live-myoko.com`, with **Path `api/property-finder/*`**. Include other hostnames
   that will serve the API (for example `www`) in the same application if used.
   The public homepage/landing page need not be protected.
3. Add an **Allow** policy with **Include → Emails** containing only the actual
   administrator/developer email addresses. Configure a real identity provider or
   Access one-time PIN login. Do not use Everyone, a Bypass policy or a shared
   service token. Save the application.
4. Open the application's **Configure → Additional settings** and copy its
   **Application Audience (AUD) Tag**. Record your actual team domain as
   `https://<your-team-name>.cloudflareaccess.com`. Neither value has been invented
   or filled into this repository.
5. Keep the application enabled before allowing any live API traffic. The function
   independently verifies the assertion and denies requests through alternate
   hostnames, preview URLs or direct origins that lack a valid authorized JWT.
   A different Access application's audience will not pass this check.
6. Visiting `/api/property-finder/login` performs Access sign-in, then the verified
   function redirects only to `/property-finder/search/`. There is no arbitrary
   return URL or client-side entitlement switch.

## 3. Configure Pages runtime bindings

Open **Workers & Pages → existing website Pages project → Settings → Variables
and Secrets → Add**. Select the intended **Production/Preview** environment and
set these bindings (encrypt them, especially the database URI and admin list):

| Binding | Value |
| --- | --- |
| `FINDER_ACCESS_TEAM_DOMAIN` | Actual HTTPS Access team domain, without a path |
| `FINDER_ACCESS_AUD` | Actual application audience tag |
| `FINDER_ADMIN_EMAILS` | Comma-separated approved individual emails |
| `FINDER_DATABASE_PROJECT_REF` | Independently confirmed Supabase project reference |
| `FINDER_DATABASE_URL` | Dedicated read-only login URI; optional `?sslmode=verify-full` only |

Never put these in `NEXT_PUBLIC_*`, source code, static JSON or the frontend build.
No Supabase anon/service-role API key is needed. Keep unrelated Directus bindings.

`wrangler.jsonc` enables `nodejs_compat`, defines `out` as the static assets folder,
and names the verified existing `livelove` Pages project. Runtime secrets are not
included in this configuration file. GitHub → Pages remains the deployment path;
commit the freshly built export because the existing Pages build command is blank.

## 4. Local preview and later deployment

**Now, with no live credentials:**

```sh
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/property-finder/search/` for synthetic fixtures. They
remain conspicuously labelled and never stand in for real listings.

**Cloudflare Pages preview with verified local Hyperdrive emulation:**

```sh
npm run build
# .dev.vars already contains the configured bindings. Do not overwrite it.
# FINDER_LOCAL_CA_FILE points to the existing trusted Supabase CA PEM.
npm run finder:dev:trusted
```

`http://127.0.0.1:8788/property-finder/search/` exercises the exported access shell
and actual Pages Function. The launcher uses `wrangler pages dev` and the existing
`wrangler.jsonc`, so the runtime receives `FINDER_HYPERDRIVE`. It constructs
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_FINDER_HYPERDRIVE` in the child
process environment from the restricted reader URI plus `sslmode=verify-full`
and the local `sslrootcert` path. Do not put that credential in `wrangler.jsonc`,
terminal arguments or a tracked file. Wrangler's emulator verifies the remote
certificate and hostname with Node TLS; the same API authentication, reader
identity checks, read-only transaction, restricted role and SQL run in workerd.

This is local emulation: it connects to Supabase directly and does not exercise
hosted Hyperdrive pooling or its deployed CA configuration. Wrangler disk logs
are disabled and console output is redacted. `.dev.vars` and `.wrangler` remain
Git-ignored. Loading unrelated Next.js `.env` files is disabled.

The previous custom standalone workerd preview omitted the Hyperdrive binding
and took the direct database branch. Its macOS TLS stack rejected the pooler
certificate with error `-67901` despite the supplied private CA, producing
`503 directory_unavailable` after successful Access authentication and before SQL.
Replacing that preview with supported Wrangler emulation fixed the local failure;
the production API and its security checks needed no changes.

For browser-based **live local** testing after setup, serve this local Pages
runtime through an authenticated Cloudflare Tunnel on a stable development
hostname and protect its `api/property-finder/*` paths with Access. Configure that
application's actual team domain/AUD/admin list in `.dev.vars`, then open the
Tunnel hostname and use **Administrator Sign In**. Access supplies the signed
header to the local function. There is no localhost authentication bypass or
manually shared preview token. For an API-only check, a genuine short-lived assertion obtained through
`cloudflared access login` may be supplied in `Cf-Access-Jwt-Assertion` to the
localhost API. Keep the assertion private; do not paste it in commands/logs or
share it. A direct localhost browser does not automatically receive the Access
header from the Cloudflare-protected production domain.

The `FINDER_PREVIEW_MODE=live` Next development
setting can show the access shell, but `next dev` alone does not serve Pages APIs.

**After configuration and review:** commit and push through the existing
**GitHub → Cloudflare Pages automatic builds** workflow so the repository-root
`functions/` directory is compiled with the static export. Do not switch to a
Wrangler-based deployment or direct upload.
Do not upload just `out/` through dashboard drag-and-drop. Check the deployment's
Functions list includes `/api/property-finder/*`. Verify authenticated allowed
users can load the directory, missing/forged/expired identities and non-admins are
denied, the eligible count comes from the view, original links/emails match rows,
and responses are not cached. Recheck the existing Maintenance redirect.

Database reader provisioning and actual restricted database reads are complete.
No crawler application code, table/view definition, RLS policy or Data API exposure
was changed. Full browser preview requires an authenticated Access-protected route
to the local runtime, as described above. Final hosted verification should use the
existing GitHub → Pages workflow and a genuine administrator Access session; do
not create a public probe endpoint or weaken Access for testing. No deployment,
commit or push was performed for the local HTTP 503 fix.

## Checks

`npm run finder:check` runs five focused synthetic security/integration checks:
real JWT signatures/claims, denial before database access, private responses,
view projection/listing actions/filtering, and strict reader/TLS configuration.
These five checks are synthetic. Separate live database checks now confirm the
provisioned reader's eligible count, denials and verified TLS. A genuine
Access-authenticated request through the corrected local Pages runtime returned
HTTP 200 and 20 eligible properties. Missing and forged assertions returned HTTP
401 without data; private no-store caching and property-specific listing/enquiry
actions passed. No authentication bypass or substitute identity was used.

References: [Cloudflare PostgreSQL support](https://developers.cloudflare.com/workers/tutorials/postgres/),
[Hyperdrive local development](https://developers.cloudflare.com/hyperdrive/configuration/local-development/),
[Access JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
[Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/),
[Pages secrets](https://developers.cloudflare.com/pages/functions/bindings/),
[PostgreSQL 17 role membership](https://www.postgresql.org/docs/17/sql-grant.html).
