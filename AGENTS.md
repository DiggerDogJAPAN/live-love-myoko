<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Production static CMS deployments

Every production deployment must regenerate the complete CMS-backed website using the established `npm run build` workflow, including its CMS asset-download step, and publish the complete tracked `out/` directory through GitHub to Cloudflare Pages. A successful framework build or fixed page count alone does not prove CMS completeness. Independently inventory all current published CMS properties/accommodations; verify their URLs, titles, descriptions, featured/gallery images and existing static routes/assets in the export. Compare against the previous production export where practical. Stop before deploying if required CMS content or assets are missing. Preserve Directus configuration/data and all private credentials.
