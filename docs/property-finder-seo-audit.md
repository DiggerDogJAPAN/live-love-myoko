# Property Finder content and discoverability audit

Reviewed 31 October 2026. Scope: the public `/property-finder/` landing page, its metadata and structured data, public crawling files and contextual links. No authentication, membership authorization, alerts, crawler, database or infrastructure settings were changed.

## Content and metadata

- Myoko City is the primary focus, with nearby Joetsu, Shinano Town / Kurohime and Iizuna. Copy explains multiple local Japanese sources, the English interface, original listing links and local support without claiming comprehensive coverage.
- Existing sections, hero image, design tokens and membership/login actions are retained. The guest Explore Properties link was present in the source and was removed as requested; authenticated Browse Properties / My Account actions remain.
- Basic and Premium prices remain ¥2,000 and ¥4,000 per month. Saved Properties, conditional daily Property Alerts and the subscription launch status are explained in static HTML.
- The canonical remains `https://love-live-myoko.com/property-finder/`. Page-specific title, description, index/follow metadata, Open Graph and Twitter large-image sharing metadata use the existing 1000 × 563 hero image and descriptive alt text. Root English language metadata is unchanged.
- Contextual links lead to Why Myoko, Buying Property in Japan and local purchasing assistance, alongside the existing Membership and Our Properties links. Navigation and footer are unchanged.

## Structured data

The page reuses the site's JSON-LD graph convention and shared schema helper. New stable `#webpage`, `#service` and `#breadcrumb` identifiers reference the existing global `#organization` and `#website` entities. Myoko is explicitly the primary area; the other three coverage areas are included. No property inventory, Product, RealEstateListing, ratings, reviews, FAQ data, purchase offers or unsupported availability claims are added. JSON-LD is escaped before embedding.

## Crawling and privacy

The existing canonical and `lang="en"` were correct. There was no source sitemap and the live `/sitemap.xml` returned 404. Added static-export-compatible Next.js metadata routes:

- `/sitemap.xml`: 38 URLs covering public static pages and all currently published Directus properties/accommodations. Unpublished content, account/authentication pages, APIs and private Finder search are excluded. No fabricated modification timestamps are emitted.
- `/robots.txt`: permits public crawling, excludes API paths and advertises the sitemap. Existing Cloudflare-managed comments/policy are not changed. Private HTML pages remain crawlable so their existing noindex metadata can be read; robots rules are not an access-control mechanism.

The private `/property-finder/search/` source and its noindex/nofollow metadata are unchanged. Its export contains only the access shell. Public copy and structured data never query Supabase or expose aggregated listing records. Existing export-security validation remains in place.

## Validation

Focused landing/membership/security tests: 17 passed. TypeScript and the production build passed. Lint reported no errors and one existing unused catch-variable warning in the unchanged portion of `src/lib/schema.ts`.

`node scripts/check-property-finder-seo.mjs` validates generated metadata, static explanatory text, JSON-LD references and uniqueness, sitemap URLs, robots directives and private search noindex. All 47 other baseline HTML pages retain the same visible body content. Independent CMS verification passed for 25 properties, 2 accommodations, 67 content fields, 377 CMS images, 418 public assets and all 48 baseline HTML routes.

## Existing issue left unchanged

The global Organization entity in `src/app/layout.tsx` references `https://love-live-myoko.com/logo.png`, which returns 404. This predates the page update. No replacement logo, global business details or unrelated page metadata were changed. The new page's sharing image exists and is verified independently. This work does not promise search ranking, rich results or inclusion in AI answers.
