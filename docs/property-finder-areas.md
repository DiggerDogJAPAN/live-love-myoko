# Property Finder visitor areas

Reviewed 28 October 2026. This change is limited to Finder presentation and its read-only API projection. No crawler code, database records, schema, permissions, addresses or source location values are changed.

## Reviewed grouping of the current 16 neighbourhoods

The source bank already assigns each listing to a regional section, retained as `region_en` / `region_ja` in the restricted customer view. Use that existing regional evidence rather than guessing a municipality or area from a neighbourhood spelling.

| Visitor area | Neighbourhoods | Listings |
| --- | --- | --- |
| Arai | Ishizukacho (石塚町), Kyozukacho (経塚町), Hakusancho (白山町), Oizumo (小出雲), Hidanomori (美守), Kurihara (栗原), Gakkocho (学校町), Kamibaba (上馬場), Kagomachi (籠町), Asahicho (朝日町), Chuocho (中央町), Yukimori (雪森), Tsukioka (月岡) | 17 |
| Myoko Kogen | Sekigawa (関川), Suginosawa (杉野沢), Taguchi (田口) | 3 |

The third source region, Myoko (妙高), remains supported for future eligible listings; it has none of the current 20. It is never relabelled Arai. Other agencies/municipalities and missing/conflicting region evidence retain their existing location fallback until reviewed. No universal “Hakusancho means Arai” name-based rule is added.

## Finder presentation

`propertyArea`, `propertyTitle` and `propertyLocation` in the Finder model share one regional rule. Cards, area-filter options, filter matching, titles, photograph alt labels and enquiry text use the same broad labels. The API exposes `area` as the visitor-facing label and retains `neighbourhood`, `areaJa` and region metadata separately. Keyword matching still recognizes original English/Japanese neighbourhoods, while area dropdowns present only Arai and Myoko Kogen for the current inventory.

Finder has no separate local property-detail route: its original-listing action opens the source PDF. Those links and source pages are unchanged. The shared Finder title/location formatters apply to any Finder detail presentation that uses them; unrelated CMS property pages are intentionally untouched.

The API only selects two additional columns already available through the restricted view; its transaction is read-only. Access, Hyperdrive, TLS, eligibility, photos, original links, database grants and Next.js static export remain unchanged. Unknown/conflicting regional labels are not silently assigned to Arai.

## Validation and deployment

Focused tests exercise every reviewed neighbourhood, the 17/3 split and two dropdown choices, original Japanese retention, neighbourhood keyword matching, image/link preservation, price sorting, outside-Arai cases and missing/conflicting region fallbacks. Existing authentication, reader identity, thumbnail and placeholder tests remain part of the same suite.

Run TypeScript, Finder-scoped ESLint, `npm run finder:check`, the existing production build and Pages Function compilation before committing. As in the previous owner-approved deployment, unrelated pre-existing repository-wide lint debt is left untouched. The fresh tracked `out/` export is published through the existing GitHub main → Cloudflare Pages workflow; do not use a direct upload or change deployment settings.
