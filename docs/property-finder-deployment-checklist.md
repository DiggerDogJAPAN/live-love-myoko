# Private Property Finder deployment — dashboard confirmation

**Deployment workflow stays GitHub → Cloudflare Pages automatic builds.**
No Wrangler deployment, direct upload, new Pages project, domain change, SSR,
Next.js API route or Node.js hosting service is required. `output: 'export'`
remains enabled. The static site is `out/`; the API is a separate Pages Function
compiled from `functions/` at repository root.

Local preflight passes: 41 static pages, TypeScript, five focused tests, targeted
lint (zero errors/four existing homepage image warnings), Pages Functions
compilation, local asset/link checks, redirects/SEO preservation and public
artifact scans excluding secrets and synthetic inventory. Account inspection
confirms the existing project and required production settings below. Deployment
uses the reviewed source and generated export committed to `main`.

## 1. Existing Pages project and Git build settings

Open **Workers & Pages → existing Love Live Myoko Pages project → Settings**.
Confirm/report these non-secret settings:

- Existing **Pages project name: `livelove`** (`wrangler.jsonc.name` now matches).
- Connected GitHub repository: **DiggerDogJAPAN/live-love-myoko**.
- Production branch: **main**, with automatic deployments enabled.
- Build root: **repository root** (blank/default or `/`), containing `package.json`
  and the sibling `functions/` directory.
- Build output directory: **out**.
- Current **build command: blank**. The existing workflow publishes the committed
  static export and compiles root `functions/`; do not replace this with a new build
  adapter or runtime.

The repository already tracks generated `out/` assets. If the established Pages
build publishes that tracked export, preserve that method and include a freshly
verified export in the upcoming commit. If Pages instead runs `npm run build`,
preserve it only with working existing Directus build bindings: its CMS download
step must reach a real remote CMS, not the local `127.0.0.1:8057` used on this Mac.
Do not substitute an SSR framework adapter, `.next`, `next start`, OpenNext or
`next-on-pages` for the existing static build.

Git-connected Pages automatically compiles a repository-root `functions/`
directory. Its source must be committed with the static export; a static-only
artifact upload is not the deployment method. After deployment, confirm the
Functions list includes `/api/property-finder/*`. Local Wrangler compilation
already confirms this route is generated.

## 2. Production runtime variables/secrets

The latest read-only inspection confirms **all five settings below are present in
Production**. The four plaintext settings match local `.dev.vars`; the database
URI is stored as an encrypted secret, so its value cannot be read back or compared.
In **Workers & Pages → livelove → Settings → Variables and Secrets → Production**,
keep these settings. Copy any corrections privately from `.dev.vars`; do not post
their values in chat or commit the file.

| Name | Required value |
| --- | --- |
| `FINDER_ACCESS_TEAM_DOMAIN` | Configured HTTPS Access team domain |
| `FINDER_ACCESS_AUD` | **API** application's AUD, protecting `/api/property-finder/*` |
| `FINDER_ADMIN_EMAILS` | Exactly `info@myokoworks.com` |
| `FINDER_DATABASE_PROJECT_REF` | Dedicated Myoko Property Finder project reference |
| `FINDER_DATABASE_URL` | Provisioned restricted reader URI from local `.dev.vars` |

Encrypt the values, especially the database URI. Keep existing unrelated website
bindings. Do not set `NODE_ENV=development` or use `NEXT_PUBLIC_*` for credentials.
`FINDER_LOCAL_CA_FILE` is local-only and must not be copied as a hosted file path.

## 3. Required production database connection: Hyperdrive

The database certificate is signed by **Supabase Root 2021 CA**. The local launcher
uses Wrangler's Hyperdrive emulator with `verify-full` and `sslrootcert` supplied
privately via the environment. This does not exercise the hosted connector.
Production uses the **FINDER_HYPERDRIVE** binding with its uploaded CA.

In **Cloudflare → Hyperdrive → Create configuration** (or inspect an existing
appropriate configuration):

1. Select **PostgreSQL**. Use only the restricted connection from `.dev.vars`,
   never the crawler administrator. Keep its database/host/port/user unchanged.
2. Use **Server certificates → Verify full (`verify-full`)** and the existing
   **Supabase Root 2021 CA** PEM referenced by local `FINDER_LOCAL_CA_FILE`.
3. **Disable query caching**. Do not use plaintext, `require` alone, `verify-ca`
   alone or disable certificate/hostname verification.
4. Save only once the origin connection validation succeeds. Record the resulting
   Hyperdrive configuration ID; it is a resource identifier, not a password.

If the CA is not yet in Cloudflare's certificate store, the documented one-time
upload is:

```sh
npx wrangler login
npx wrangler cert upload certificate-authority --ca-cert "/actual/path/from/FINDER_LOCAL_CA_FILE" --name property-finder-supabase-ca
```

This manages a CA certificate, **not a code deployment**. GitHub → Pages remains
the deployment path. The certificate file is public CA material; never put a DB
password/connection URI on the command line.

The local `wrangler.jsonc` now declares this resource binding for the existing
project, to be applied by the future Git-connected Pages deployment:

| Field | Value |
| --- | --- |
| Binding name | `FINDER_HYPERDRIVE` |
| Configuration name | `myoko-property-finder` |
| Configuration ID | `d2e1e9cc5947483f8747b8e84ccaf57b` |

This is a Hyperdrive resource binding, not a plaintext variable/secret. Do not add
`FINDER_HYPERDRIVE` under Variables and Secrets. No remote Pages binding change
has been made yet.

**Reader credentials verified on 28 October 2026:** the existing Hyperdrive origin
was updated from private `.dev.vars` with the owner's authorization. Its saved
username is `property_finder_web_reader.<project-ref>`, matching the dedicated
Supabase session pooler connection. The host/port/database, uploaded CA
(`property-finder-supabase-ca`), `verify-full` and disabled caching were preserved.
The same restricted credentials passed verified-TLS database checks: 20 eligible
rows; internal-table access, writes, privileged role changes and RLS bypass denied.
No credentials or listing contents were logged. The Pages Function uses
Cloudflare's internal binding connection; Hyperdrive verifies the origin TLS chain
and hostname. The API also checks the real database session is the dedicated reader
before reading data. A genuine Access-authorized production request remains the
end-to-end verification after the Git-connected deployment. The local Pages API
has passed a genuine Access-authenticated HTTP check: 20 eligible properties,
with missing/forged assertions denied. The old custom preview's macOS direct-TLS
failure was resolved by using Wrangler's supported Hyperdrive emulator; no
production authentication, SQL, permissions or TLS settings were weakened.

## 4. Access applications — inspect, do not automatically change policies

In **Zero Trust → Access controls → Applications**, verify the existing policies:

- The private directory application covers apex `/property-finder/search*`,
  including its trailing slash, `index.html` and RSC payload paths.
- The API application covers apex `/api/property-finder/*`.
- Both allow **only info@myokoworks.com**, with no broader Allow/Bypass policy.
- The public `/property-finder/` landing page and homepage stay outside those paths.
- Additional `www` entries can remain, but app sign-in links and the API's final
  sign-in redirect now explicitly use **https://love-live-myoko.com**.

Unauthenticated public checks already confirm Access redirects on both private
routes. Their application audiences differ, and the API audience matches local
`FINDER_ACCESS_AUD`. This is supported: the edge validates the search application's
session; the API independently validates **only its own** application JWT and the
admin allowlist. Do not put the search audience into the API setting or accept
unrelated application audiences as a workaround. Full-page links into the private
search route allow the normal Access browser challenge instead of an intercepted
Next.js client-side transition.

## 5. Deployment checks

Report only:

1. Existing Pages project name, current build command, root/output and branch.
2. All five Production variables are present; admin email is exact; API AUD is used.
3. Hyperdrive is validated with the restricted reader, existing CA, verify-full and
   caching disabled; its **configuration ID** and binding name.
4. Both existing Access applications allow only the required email.

After the reader, production variables and local checks pass, commit the reviewed
source/export and push normally to `main`. Let the existing
Git-connected Pages workflow deploy it. Then verify the resulting Pages deployment,
public pages, Access sign-in, genuine authorized API/listing actions and denial of
unauthenticated access. No public paid launch or Stripe integration is included.

References: [Pages Functions with Git](https://developers.cloudflare.com/pages/functions/get-started/),
[Pages Hyperdrive bindings](https://developers.cloudflare.com/pages/functions/wrangler-configuration/#hyperdrive),
[Hyperdrive verify-full with custom CA](https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/).
