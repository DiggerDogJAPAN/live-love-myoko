This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Maintenance URL redirect

The site remains a static export. `/management/` contains the combined management
and maintenance content; the old Maintenance page has been removed.

The website is hosted on Cloudflare Pages. `public/_redirects` defines permanent
HTTP 301 redirects from `/maintenance` and `/maintenance/` to `/management`.
Next.js copies this static asset to `out/_redirects` during export; no Apache
or Nginx configuration is needed.

Deploy a **fresh** `out/` export so the old `maintenance/` directory and its
HTML/RSC files are absent. Before deployment, confirm `out/_redirects` contains
the rules from `public/_redirects`.

After deployment, verify both old URLs return HTTP `301` with
`Location: /management` and that following each redirect reaches the combined
Management page. Live redirect verification remains pending deployment.

## Property Finder

- [Production deployment checklist](docs/property-finder-deployment-checklist.md):
  GitHub → Pages, production secrets, Hyperdrive and Access confirmations required
  before pushing.

- Landing page: `/property-finder/`.
- `npm run dev` serves the labelled synthetic directory at
  `/property-finder/search/` until live access is configured.
- Production exports an access-checking shell with no inventory. The same-origin
  Cloudflare Pages API verifies Access JWTs and an admin allowlist before using
  the dedicated PostgreSQL reader against the restricted customer view.
- The dedicated reader is provisioned and its connection is stored in private
  `.dev.vars`. Real listings still require a verified Access administrator session.
  The crawler's administrator credentials are never used by the website.
- This database requires its existing Supabase CA. Use `npm run finder:dev:trusted`
  after a build: the launcher configures Wrangler's local Hyperdrive emulator with
  verified TLS and the CA without writing credentials to configuration or logs.
  Production uses the configured hosted Hyperdrive binding.
- Run `npm run finder:check` for the focused synthetic API/security checks.
- [Setup guide](docs/property-finder-phase-2.md): exact Access dashboard steps,
  runtime bindings, database provisioning and local/live preview instructions.
  The reader was provisioned on 28 October 2026. The SQL in
  `sql/provision-property-finder-reader.sql` is retained for reference; do not rerun
  it against the existing reader.

Existing Properties listings and Management services remain separate. Stripe,
registration and paid subscription access are not implemented in this phase.
