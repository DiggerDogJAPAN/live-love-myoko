# Property Finder visitor areas

Reviewed 29 October 2026. This change is limited to Finder presentation and its read-only API projection. No crawler code, database records, schema, permissions, addresses or source location values are changed.

## Reviewed grouping of the current 16 neighbourhoods

The source bank already assigns each listing to a regional section, retained as `region_en` / `region_ja` in the restricted customer view. Use that existing regional evidence rather than guessing a municipality or area from a neighbourhood spelling.

| Visitor area | Neighbourhoods | Listings |
| --- | --- | --- |
| Arai | Ishizukacho (石塚町), Kyozukacho (経塚町), Hakusancho (白山町), Oizumo (小出雲), Hidanomori (美守), Kurihara (栗原), Gakkocho (学校町), Kamibaba (上馬場), Kagomachi (籠町), Asahicho (朝日町), Chuocho (中央町), Yukimori (雪森), Tsukioka (月岡) | 16 |
| Myoko Kogen | Sekigawa (関川), Suginosawa (杉野沢), Taguchi (田口) | 3 |

The third source region, Myoko (妙高), remains supported for future eligible listings; it has none of the current 19. It is never relabelled Arai. Other agencies/municipalities and missing/conflicting region evidence retain their existing location fallback until reviewed. No universal “Hakusancho means Arai” name-based rule is added.

## Finder presentation

The reviewed regional rule from commit `784d763` is restored for Myoko Akiya Bank listings. Cards, titles, photograph alt labels and enquiries use `Arai (Hakusancho)` or `Myoko Kogen (Taguchi)`. The separate Myoko region stays `Myoko`, and missing or conflicting regional evidence uses the existing municipality/locality fallback. No neighbourhood-name inference is used.

`propertyArea` retains the existing municipality/locality selection values, such as `Myoko (Hakusancho)`. `propertyDisplayArea` and `propertyLocation` supply the corrected label. The dropdown uses an explicit stable `value` and the geographic display label; selection and keyword matching also recognize the corrected labels. The API retains the original `municipality`, `area`, `neighbourhood`, Japanese and regional fields. Only derived titles and image alt text change. Shinano, Joetsu and Iizuna keep their existing labels and values.

Finder has no separate local property-detail route: its original-listing action opens the source PDF. Those links and source pages are unchanged. The shared Finder title/location formatters apply to any Finder detail presentation that uses them; unrelated CMS property pages are intentionally untouched.

The API already selects the regional columns from the restricted view; no query, stored record or database change is needed. Access, Hyperdrive, TLS, eligibility, photos, original links, database grants and Next.js static export remain unchanged. Unknown/conflicting regional labels are not silently assigned to Arai.

## Validation and deployment

Focused tests exercise every reviewed neighbourhood, the 16/3 split, all 16 neighbourhood options and stable filter values, original Japanese retention, neighbourhood keyword matching, image/link preservation, price sorting, outside-Arai cases and missing/conflicting region fallbacks. Existing authentication, reader identity, thumbnail and placeholder tests remain part of the same suite.

Run TypeScript, Finder-scoped ESLint, `npm run finder:check`, the existing production build and Pages Function compilation before committing. As in the previous owner-approved deployment, unrelated pre-existing repository-wide lint debt is left untouched. The fresh tracked `out/` export is published through the existing GitHub main → Cloudflare Pages workflow; do not use a direct upload or change deployment settings.
