# Property Finder visitor areas

Reviewed 29 October 2026. This change is limited to Finder presentation and its read-only API projection. No crawler code, database records, schema, permissions, addresses or source location values are changed.

## Reviewed grouping of the current 16 neighbourhoods

The source bank already assigns each listing to a regional section, retained as `region_en` / `region_ja` in the restricted customer view. Use that existing regional evidence rather than guessing a municipality or area from a neighbourhood spelling.

| Visitor area | Neighbourhoods | Listings |
| --- | --- | --- |
| Arai | Ishizukacho (石塚町), Kyozukacho (経塚町), Hakusancho (白山町), Oizumo (小出雲), Hidanomori (美守), Kurihara (栗原), Gakkocho (学校町), Kamibaba (上馬場), Kagomachi (籠町), Asahicho (朝日町), Chuocho (中央町), Yukimori (雪森), Tsukioka (月岡) | 16 |
| Myoko Kogen | Sekigawa (関川), Suginosawa (杉野沢), Taguchi (田口) | 3 |

The third source region, Myoko (妙高), remains supported for future eligible listings; it has none of the current 19. It is never relabelled Arai. Other agencies/municipalities and missing/conflicting region evidence retain their existing location fallback until reviewed. The original release required municipal regional evidence; the cross-source normalization below now supplies reviewed locality geography independently of source metadata.

## Finder presentation

The reviewed regional rule from commit `784d763` is restored for Myoko Akiya Bank listings. Cards, titles, photograph alt labels and enquiries use `Arai (Hakusancho)` or `Myoko Kogen (Taguchi)`. Reviewed locality geography now takes precedence over missing or unrelated source region tags; unreviewed localities retain explicit municipal regional evidence or an honest fallback.

`propertyArea` retains the existing municipality/locality selection values, such as `Myoko (Hakusancho)`. `propertyDisplayArea` and `propertyLocation` supply the corrected label. The dropdown uses an explicit stable `value` and the geographic display label; selection and keyword matching also recognize the corrected labels. The API retains the original `municipality`, `area`, `neighbourhood`, Japanese and regional fields. Derived titles, labels, filter matching and image alt text use the same reviewed normalization. Existing English municipality/locality keys stay stable.

Approved SUUMO and Rakusumu listings in Myoko have no bank regional metadata. Their Japanese and English names now share the reviewed canonical location dictionary below. Conflicting actual locality names retain a neutral fallback. Unreviewed readings are never invented; this presentation rule does not change stored addresses, municipality, source identifiers or portal eligibility.

Finder has no separate local property-detail route: its original-listing action opens the source PDF. Those links and source pages are unchanged. The shared Finder title/location formatters apply to any Finder detail presentation that uses them; unrelated CMS property pages are intentionally untouched.

The API already selects the regional columns from the restricted view; no query, stored record or database change is needed. Access, Hyperdrive, TLS, eligibility, photos, original links, database grants and Next.js static export remain unchanged. Unknown/conflicting regional labels are not silently assigned to Arai.

## Validation and deployment

Focused tests exercise every reviewed neighbourhood, the 16/3 split, all 16 neighbourhood options and stable filter values, original Japanese retention, neighbourhood keyword matching, image/link preservation, price sorting, outside-Arai cases and missing/conflicting region fallbacks. Existing authentication, reader identity, thumbnail and placeholder tests remain part of the same suite.

Run TypeScript, Finder-scoped ESLint, `npm run finder:check`, the existing production build and Pages Function compilation before committing. As in the previous owner-approved deployment, unrelated pre-existing repository-wide lint debt is left untouched. The fresh tracked `out/` export is published through the existing GitHub main → Cloudflare Pages workflow; do not use a direct upload or change deployment settings.


## Cross-source Japanese/English normalization — 29 October 2026

A restricted read-only audit of the eligible view found **140 listings**: Myoko 44, Shinano 10, Joetsu 73 and Iizuna 13. All six crawler sources were inspected (including the supplemental Iizuna attribution). Myoko has 27 distinct neighbourhoods: the original 16 above plus these 11 newly reviewed portal localities:

| Original Japanese | Canonical English | Verified area |
| --- | --- | --- |
| 上百々 | Kamidodo | Arai |
| 吉木 | Yoshiki | Arai |
| 姫川原 | Himegawara | Arai |
| 東雲町 | Shinonomecho | Arai |
| 柳井田町 | Yanaidacho | Arai |
| 栄町 | Sakaecho | Arai |
| 田切 | Tagiri | Myoko Kogen |
| 錦町 | Nishikicho | Arai |
| 長森 | Nagamori | Arai |
| 高柳 | Takayanagi | Arai |
| 葎生字江端 | Moguro | Myoko — verified former village area |

The city’s [official address/readings register](https://www.city.myoko.niigata.jp/docs/801.html) separates Arai, Myoko Kogen and the former Myoko village. Its [school-area register](https://www.city.myoko.niigata.jp/docs/18.html) and [collection-area register](https://www.city.myoko.niigata.jp/docs/43910.html) corroborate the Arai/Kogen assignments. The city also gives the [Kamidodo reading explicitly](https://www.city.myoko.niigata.jp/fs/2/8/3/3/4/8/_/511Shosaijoho.pdf).

**Geographic exception:** Moguro is genuinely in the separate former Myoko village, confirmed by [Japan Post’s former/current municipality record](https://www.post.japanpost.jp/cgi-zip/zipcode.php?city=1152170&id=58394&pref=15). It must not be moved to Arai or Myoko Kogen. `Myoko (Moguro)` is an explicit reviewed area, not a fallback derived from Myoko City. The original `字江端` suffix remains in `areaJa` and Japanese keyword search; the dropdown groups at the verified neighbourhood level. Sekiyama remains supported in the same former-village area, although none of the current visible records uses it.

The Shinano portal locality `野尻山桑` displays as `Shinano (Nojiri / Yamakuwa)`. It remains distinct from Nojiri rather than falsely treating a named subarea as a spelling duplicate. The town identifies [Yamakuwa separately from Nojiri](https://www.town.shinano.lg.jp/docs/517.html) and locates its [Yamakuwa facility in the Nojiri postal area](https://www.town.shinano.lg.jp/institution/shisetsu/facility066/). Existing verified Joetsu, Iizuna and Shinano English names are retained, with Japanese aliases scoped to their municipality.

`src/lib/property-finder/locations.ts` is the shared reviewed dictionary. Japanese names, reviewed romanization variants, full-width forms, `大字` prefixes and chome variants resolve to one canonical neighbourhood. No fuzzy prefix matching or automatic Japanese reading/area guess is performed. Existing `Myoko (EnglishName)` option values remain stable; Japanese legacy selections and corrected display-area selections also match across municipal and portal records. Municipalities stay independent of display areas. Japanese and English keyword searches both work even when a source supplied only one language.

Dropdowns, card titles/eyebrows and enquiries use the same formatter. No property/source identity, original Japanese field, photograph URL, disclosure, price or link is rewritten. No crawler, database, permission or authentication code is part of this release. The pending membership work remains uncommitted and excluded; the production static export is rebuilt from the released website plus only this fix.

Regression tests audit all 27 Myoko names, cross-source canonical keys and deduplication, both language directions, municipality isolation, Kogen classification, the legitimate former-village exception, unchanged original fields, card/enquiry labels and all existing filters/sorting/security/image checks.

Release verification: 67 production-source tests passed; the full working-tree suite including the pending membership implementation also passed 99 tests. TypeScript, changed-file lint, the normal 41-page production build and Pages Functions compilation passed. The regenerated export contains the new dictionary and passed the artifact guard (220 text artifacts). A pre-deployment check of all 140 visible location rows produced 61 English location options, including 27 for Myoko; all canonical filters matched their expected labels. Myoko's 44 listings resolve to 37 Arai, 6 Myoko Kogen and 1 verified former-village Myoko listing. Unreviewed membership pages/routes/source files are excluded from the release.
