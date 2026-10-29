# SUUMO and Rakusumu — historical geographic and duplicate review

Superseded by the later approved [Myoko/Shinano activation](portal-myoko-shinano-activation.md). The following records the earlier broad-scope review and hold.

Reviewed 29 October 2026 (Japan time). **Both portals are disabled and inaccessible to the restricted customer reader. No commit, push or activation is approved.**

The initial production imports completed before the later geographic hold request. They remain intact: SUUMO 261 records; Rakusumu 203. The hold disables only these sources and uses an additional restrictive-reader RLS condition. Migration 007 has not been reversed, and no property rows or histories were deleted. The original 218 municipal records and 113 customer-visible rows remain unchanged.

## Definitions

- Discovered counts actual main-inventory cards, including land cards mixed into SUUMO new-house searches.
- Eligible means verified covered municipality, residential building-sale evidence and no recognized or unknown restriction, before duplicate review.
- Excluded includes land, uncertain building/status and unverified geography; duplicate holds are shown separately.
- Duplicate holds below count otherwise eligible listings withheld by conservative review. All portal listings are currently withheld regardless.
- Remaining unique candidates have no unresolved higher-priority match under the implemented checks; they are **not a guarantee of unique physical properties**. Missing municipal areas/addresses can prevent matching. No source identities were merged.

## SUUMO

| Municipality | Discovered | Eligible before duplicates | Excluded | Eligible duplicate holds | Remaining unique candidates |
| --- | ---: | ---: | ---: | ---: | ---: |
| Myoko | 17 | 15 | 2 | 0 | 15 |
| Joetsu | 244 | 223 | 21 | 36 | 187 |
| Shinano Town | 3 | 3 | 0 | 1 | 2 |
| Iizuna Town | 11 | 11 | 0 | 3 | 8 |
| Outside coverage | 0 | 0 | 0 | 0 | 0 |
| Unverified location | 0 | 0 | 0 | 0 | 0 |
| **Total** | 275 | 252 | 23 | 40 | 212 |

### Index coverage

- `https://suumo.jp/chukoikkodate/niigata/sc_myoko/`: 13 unique cards, 1 checked page(s).
- `https://suumo.jp/chukoikkodate/niigata/sc_joetsu/`: 201 unique cards, 11 checked page(s).
- `https://suumo.jp/chukoikkodate/nagano/sc_kamiminochigun/`: 14 unique cards, 1 checked page(s).
- `https://suumo.jp/ikkodate/niigata/sc_myoko/`: 4 unique cards, 1 checked page(s).
- `https://suumo.jp/ikkodate/niigata/sc_joetsu/`: 43 unique cards, 3 checked page(s).
- `https://suumo.jp/ikkodate/nagano/sc_kamiminochigun/`: 0 unique cards, 1 checked page(s).

## Rakusumu

| Municipality | Discovered | Eligible before duplicates | Excluded | Eligible duplicate holds | Remaining unique candidates |
| --- | ---: | ---: | ---: | ---: | ---: |
| Myoko | 13 | 11 | 2 | 1 | 10 |
| Joetsu | 190 | 184 | 6 | 33 | 151 |
| Shinano Town | 0 | 0 | 0 | 0 | 0 |
| Iizuna Town | 0 | 0 | 0 | 0 | 0 |
| Outside coverage | 0 | 0 | 0 | 0 | 0 |
| Unverified location | 2 | 0 | 2 | 0 | 0 |
| **Total** | 205 | 195 | 10 | 34 | 161 |

### Index coverage

- `https://www.rakusumu.com/sale/area/list/3?area%5B%5D=15217&area%5B%5D=15222&sort=NEW`: 11 unique cards, 1 checked page(s).
- `https://www.rakusumu.com/sale/area/list/4?area%5B%5D=15217&area%5B%5D=15222&sort=NEW`: 194 unique cards, 10 checked page(s).

## Why SUUMO Myoko differs from the original search

The original reference was for **used houses in Myoko only**: its permitted city-page equivalent returned exactly **13** house cards. The broader implementation included used and new houses across all four requested municipalities. Myoko contributes 13 used houses plus 2 new-house listings: **15 house listings**, with no duplicate IDs or current duplicate-review holds. Its new-house index has 4 cards, but 2 are land and excluded. Thus Myoko has 17 discovered cards, 15 eligible house candidates and 2 excluded land cards—not 261 houses.

The remaining SUUMO house records are Joetsu 232, Shinano 3 and Iizuna 11. Total: 261. The six indices expose 275 cards, including 14 excluded land cards. Individual detail addresses, not search URLs, establish the split of the shared Shinano/Iizuna county index.

## Geographic checks and pagination

Every imported portal property was reparsed from its cached individual HTML detail using the current local code. Stable ID, original URL, municipality, address, price, areas, construction date, type, transaction, status, Japanese status label and permitted image URL agree with production. Municipality matching is anchored to the property address; agent-office addresses, navigation text and nearby-city mentions cannot establish coverage. Unknown municipality stops a new complete snapshot for review, and cannot become eligible.

SUUMO uses the permitted canonical city paths, preserving category and city in each pagination link and accepting only the page parameter. The supplied JJ010FJ001 endpoint remains robots-disallowed and was not crawled. Only `#js-bukkenList` cards are inventory; recommendations elsewhere are ignored. Archive totals and unique IDs reconcile for every page. No duplicate cards inflated the accepted snapshots.

Rakusumu retains exact `area[]=15217&area[]=15222` filters and `sort=NEW` on every page. Default ordering produced an overlapping ID across pages; that acquisition failed before any writes. The explicit new-listings sort produced 11 new-house cards plus 194 used-house cards over 1 + 10 pages, with no repeated IDs. The source currently exposes no Shinano/Iizuna area options; no unsupported Nagano coverage is inferred.

Two Rakusumu detail pages publish English addresses, one with a municipality spelling error. They are **unverified geography**, not proven outside coverage, and were not imported: `00200-200291` and `00200-200231`. The initial crawl/run summaries called all rejected locations “outside_coverage”; this audit corrects that classification without rewriting historical run summaries. Zero explicitly outside-coverage properties were found in the accepted scoped snapshot. These two need verified structured readings before a future complete Rakusumu activation; no romanization or corrected address has been invented. Their raw detail evidence is retained privately in the review data.

## Duplicate review

There are **63 candidate pairs**. Evidence: 33 full-address plus both-area matches, and 30 locality/price plus both-area matches. Similar price and neighbourhood alone never establish a match. Candidate priority retains municipal listings first, then SUUMO, then Rakusumu; this avoids mutually suppressing both portals on repeated runs. No source rows/UUIDs/URLs are merged or deleted.

- iizuna_akiya_bank + suumo: 1 pairs.
- joetsu_akiya_bank + rakusumu: 1 pairs.
- joetsu_akiya_bank + suumo: 9 pairs.
- rakusumu + rakusumu: 3 pairs.
- rakusumu + suumo: 27 pairs.
- shinano_akiya_bank + suumo: 1 pairs.
- suumo + suumo: 21 pairs.

76 imported portal rows carry pending-review flags (42 SUUMO, 34 Rakusumu). Of those, 74 would otherwise be eligible (40 + 34); the other 2 were already held for status/type uncertainty. With these holds, 212 SUUMO + 161 Rakusumu = **373 remaining eligible candidates**, all still hidden pending approval. Physical uniqueness is provisional, especially against Myoko records lacking detailed land/building measurements.

Private per-property evidence and candidate source URLs are in Git-ignored `data/portal-geographic-review.json`. Query private crawler metadata only with authorised backend credentials; it is not exposed to the website reader.

## Production hold and consistency

- Migration 007 remains applied with checksum `c6fddde66ee23544e9474fe7438011067575ebababb972278f05516d8a18894d`. Its file was not changed after application.
- The operational hold is documented in `sql/operations/hold_property_portals.sql`; it matches the additional production policy condition and the two disabled source flags. No private-column grant was added.
- Restricted-reader direct source and original-URL lookups return zero portal rows. Every SQL pagination page was checked: 113 distinct municipal listings in total, zero portals. Private table access is denied.
- Both source-specific IDs and all 464 imported records remain stored. No portal price changes occurred during first/repeat snapshot imports; historical tables remain intact.
- All four municipal sources remain enabled. Their 218 property rows match the pre-import fingerprint, and their 113 public results remain unchanged.
- The workflow still schedules only the original four sources at 06:17 JST. Portal changes are uncommitted, and neither portal is enabled on GitHub.
- Hosted anonymous requests and the expired saved Access-token requests redirect to sign-in (302), including source/page/offset query variants. A fresh authenticated hosted-API payload still requires a refreshed Access token; this is not reported as completed. The same production reader/database contract was tested directly.

## Website handoff after later approval

Source identifiers: `suumo`, `rakusumu`; attributions: `Source: SUUMO`, `Source: Rakusumu`. No new public API fields are needed. Existing `thumbnail_url` uses the original host URL, never rehosted content. SUUMO requires exact host `img01.suumo.com`, path `/jj/resizeImage`, bounded `src/w/h` query and image/listing identity checks. Rakusumu requires exact host `www.rakusumu.com`, `/images/{agency}/{listing}/img_{listing}_G_...` and the optional numeric `u` query. Floor-plan `_M_` paths are excluded. Sample HEAD checks succeeded with external Referer; no image bodies were downloaded. Website image allowlists remain untouched.

The current hosted API has a 500-property safety ceiling. The reviewed candidate projection would be 113 + 373 = 486, close to that ceiling; website Codex should address server pagination before future growth. This is a handoff concern, not authorization to edit the website here.

Activation remains paused until geographic/duplicate review and an explicit follow-up approval. Do not restore the portal reader policy, enable source flags or add portal workflow matrix entries merely by replaying migration 007.
