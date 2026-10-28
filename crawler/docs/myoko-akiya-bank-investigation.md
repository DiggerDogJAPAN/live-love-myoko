# Myoko City Akiya Bank — Phase 2 investigation

> Historical Phase 2 report. In Phase 3 the user confirmed permission for this project and requested HTML-only live collection. The current implementation no longer reads reviewed PDF projections, persists thumbnail URL references and source availability, and has a bounded live fetcher. See [Phase 3 operation](phase3-live-crawler.md) for current behaviour. The evidence below records the earlier investigation, not a current approval gate.

Reviewed **27 October 2026 (Japan time)**. Outcome: **live automated collection and commercial reuse remain unresolved; the implemented adapter accepts synthetic local fixtures only.** No full live crawl was performed.

## 1. Website structure and available facts

The [housing index](https://www.city.myoko.niigata.jp/myoko-life/house/) itself contains sale cards grouped by 新井地域, 妙高高原地域 and 妙高地域, followed by a rental section. These are in-page sections, not separate index pages. No next-page control was observed. Cards expose property number, locality, sale price, status badges, a PDF detail link and an optional thumbnail. New/reduced-price news appears above the inventory. The adapter selects cards rather than interpreting the news as inventory. This is an observation of the inspected page, not a guarantee about future pagination. [Source: housing index](https://www.city.myoko.niigata.jp/myoko-life/house/).

Direct HTML inspection found `h3#arai`, `h3#myokokougen`, `h3#myoko`, `.bukken-list > .item`, two `tr.info` rows, and `.address`, `.price`, `.pdf` and `.pic` cells. Split PDF links can repeat the same URL. There was no separate individual HTML detail page among the sampled links: individual details were PDFs.

Two individual PDF references were inspected as text, without saving the PDFs or extracting their images:

- [No.537 detail PDF](https://www.city.myoko.niigata.jp/fs/2/9/8/8/2/3/_/537shosaijoho.pdf), four pages.
- [No.214 detail PDF](https://www.city.myoko.niigata.jp/fs/2/6/0/0/9/4/_/214%E8%A9%B3%E7%B4%B0%E6%83%85%E5%A0%B1_240813.pdf), four pages.

| Requested fact | Observed availability and extraction decision |
| --- | --- |
| ID and URL | `No.` on the card; use its PDF URL as the original individual listing URL. Stable source ID remains authoritative across PDF revisions. |
| Japanese title | No independent title in sampled cards; combine the actual number and locality into a factual label, rather than inventing marketing text. |
| Asking price | Sale card and PDF; keep JPY integer, unknown as null. Disagreement requires review. Rentals are excluded. |
| Municipality / area | Myoko source coverage; card locality. Regional section retained separately in audit output. |
| Address | PDF field `空家の所在地（住居表示）`; sampled values are localities such as 田口/田町, not necessarily street addresses. |
| Land / building area | PDF `敷地面積` / `延床面積`; square metres may be followed by a tsubo equivalent. |
| Construction | PDF Japanese era and/or Gregorian year; source-reported age can be stale. Do not calculate an age from an incomplete date. |
| Floor plan | `間取り` can refer to another sheet; retain null when only a diagram/reference is provided. |
| Parking | PDF `駐車場`; plain text can contain both form alternatives without revealing the selected choice. Require a reviewed value or null. |
| Type | Do not assume a type from an attractive picture or a layout; unknown unless explicitly supported by the reviewed facts. |

The PDF text streams separate headings from values and include form alternatives. Consequently the adapter does **not** pretend a linear text extraction is a reliable PDF field mapper. Detail fixtures are explicitly labelled, reviewed factual projections tied to a property number and exact PDF reference URL. A URL match does not verify a remote file's contents or revision; future ingestion needs content hashes and observation times. The fixtures demonstrate normalization; automatic layout extraction, OCR and floor-plan interpretation remain unimplemented. [Evidence: No.537](https://www.city.myoko.niigata.jp/fs/2/9/8/8/2/3/_/537shosaijoho.pdf), [No.214](https://www.city.myoko.niigata.jp/fs/2/6/0/0/9/4/_/214%E8%A9%B3%E7%B4%B0%E6%83%85%E5%A0%B1_240813.pdf).

## 2. Robots, terms and relevant restrictions

**Robots:** [exact URL](https://www.city.myoko.niigata.jp/robots.txt). A direct, ordinary read-only request returned **HTTP 200** and this body:

```text
User-agent: *
Disallow: /kana/
Disallow: /mobile/
Disallow: /calendar/
Disallow: /.voice/
```

The observed directives do not disallow `/myoko-life/house/` or the sampled `/fs/` PDF paths. No crawl-delay directive was present. This is a robots-path finding, not permission for commercial aggregation or reproduction. The web reader could not retrieve robots.txt and the first sandbox request failed DNS; the successful ordinary network request established the result. No alternate identity, proxy or anti-bot bypass was used.

**Linking terms:** [このホームページについて](https://www.city.myoko.niigata.jp/site/about.html), section `リンクについて`. Relevant excerpt: 「トップページ以外へのリンクは原則として禁止します。」 The page generally allows homepage links but restricts deeper links, requires city-site attribution and rejects framing. The planned per-property/PDF links therefore need clarification or permission; being able to read a URL does not resolve its publication terms.

**Copyright:** [著作権](https://www.city.myoko.niigata.jp/site/copyright.html). Relevant excerpt: 「妙高市の許可なく無断で複製・転用することはできません。」 The notice covers text, photographs and other content, subject to its stated statutory exceptions. This investigation did not establish a suitable permission basis for copying descriptions, publishing photographs, or translating protected prose into a subscription product.

**Open data:** [妙高市オープンデータ](https://www.city.myoko.niigata.jp/docs/983.html), especially `注意`. Relevant excerpt: 「このライセンスは、このページ内の対象データにのみ適用されます。」 Its CC-BY provisions apply to the listed datasets, not automatically to all city content. Akiya listing photographs/descriptions were not identified as a licensed dataset in that catalogue. Do not apply that licence to the housing index by assumption.

The [Akiya programme guide](https://www.city.myoko.niigata.jp/myoko-life/file/akiyaseido.pdf) describes registration, information sharing and owner/buyer introductions. The housing index requires registration for viewings. Public reading did not require authentication in this sample; that does not authorize accessing registered-user information or reproduce commercial-use permission. No CAPTCHA or authentication barrier was bypassed. The city describes itself as an information/coordination service, not the negotiating real-estate broker.

## 3. Suitability for live automation

| Question | Result |
| --- | --- |
| Is the inspected housing path robots-disallowed? | No, in the retrieved robots snapshot. |
| Was an explicit blanket ban on every automated request established? | No. This limited review is not a guarantee that no other conditions apply. |
| Is the proposed commercial collection/publication scope sufficiently clear? | **No — unresolved.** Reuse and deep-link restrictions need resolution. |
| Is a live adapter or scheduled crawl enabled? | **No.** Only original synthetic local bundles are accepted; no fetcher exists. |

The appropriate engineering decision under the task's fallback is to complete offline development while leaving live use disabled. This is a scope/permission assessment, not a claim that robots alone grants rights or that all factual data is necessarily protected.

New items carry news/NEW markers. Negotiation and viewing-closure badges are visible. A single inspection cannot establish the city's exact deletion/archive process or whether removed PDFs persist. Absence is therefore only `not_found` after an explicitly complete, validated snapshot; it never proves sale or withdrawal. Explicit sold/withdrawn label handling is tested using invented cases, not asserted as an observed removal feed.

## 4. Photographs

Index cards have image `src` references in `.pic`; inspected filenames included `.jpg`, `.JPG` and `.png`. These extensions suggest JPEG/PNG; binary MIME types, dimensions, availability and original-resolution versions were **not tested**, because no photo URLs were requested. One actual thumbnail reference identified in the HTML was:

```text
https://www.city.myoko.niigata.jp/fs/2/9/8/8/2/2/_/537_300.jpg
```

This is evidence identifying a URL, not an image asset or permission to embed it. PDF text also refers to other sheets; embedded visual content was not rendered, extracted or republished. The copyright notice provides no established permission for the planned photograph use. Clarify city/owner/photographer rights, hotlinking and commercial display separately.

The adapter returns the first card thumbnail reference as **audit-only** `image_candidate_url`. It always leaves normalized `main_image_url` null and image permission `unknown`. Japanese descriptions are likewise not extracted or stored. No photographs, original PDFs, or copied city HTML pages were committed as fixtures.

## 5. Implementation and verification

Added:

- `src/myoko_property_crawler/adapters/myoko_akiya_bank.py`: source policy, structural card parser, reviewed detail normalization and fixture coverage validation. There is no network code.
- `tests/fixtures/myoko_akiya_bank/`: original initial/updated HTML, JSON manifests, labelled detail projections and fixture provenance README. Numbers 900001–900003 and `/fs/fixture-only/` paths are invented.
- `tests/test_myoko_akiya_bank.py`: 29 source-specific tests.
- This investigation report.

Updated `cli.py` with `--source myoko_akiya_bank`, `adapters/__init__.py`, documentation and `MANIFEST.in` to include the new fixture formats in source distributions. The normalized `Property` model, reconciliation engine and proposed database SQL were reused without changes. No new dependencies were added.

The new source scope is consistently **sale listings across all three regions**. The CLI receives a local JSON manifest rather than a URL. Completeness requires explicit caller intent, original-fixture markers, independent expected IDs, all three section/list groups, matching reviewed detail files, and no detected pagination. Truncated HTML, unknown statuses, conflicting duplicates, mismatched PDF references, unreadable supplied details and index/detail price conflicts fail before persistence. Missing detail input may be used only in partial mode, with unknown values left null.

**65 automated tests pass: all 36 original tests plus 29 new tests.** They cover Japanese full-width values/eras, unknowns, duplicate facts and badge conflicts, price history/replays, explicit withdrawal/sale, partial versus verified complete absence, malformed/error pages, coverage gaps, pagination, rental exclusion, local path restrictions, image suppression and state preservation on failure. Adapter/CLI tests block network sockets.

The original model's `active` means a published listing, not guaranteed availability. `商談中` and `内覧受付終了` stay `active`, while their raw labels and `under_negotiation` / `viewing_closed` availability are returned in `source_observations`. These audit observations are printed by the CLI but **not persisted in the existing property JSON schema**. A subscription product must not present `active` alone as available for viewing; durable availability fields require a later schema decision.

## 6. Limits and outstanding decisions

- City permission/clarification for automated factual collection, commercial reuse, retention, attribution, translations and deep links remains outstanding. Robots should be rechecked before any later live activity.
- Image use is unapproved. No photo collection/display path is enabled.
- Raw PDF layout parsing is not implemented or validated. Labelled synthetic projections are not evidence of production extraction accuracy. Scans, selection marks and diagrams require another plan.
- There is no verified live removal feed or historical archive behaviour. An independent inventory in synthetic fixtures is a testing device, not a production completeness detector.
- No rental normalization, concurrency, rate-limit policy, live scheduling or production fetch transport is implemented.
- The old single-writer JSON limitation remains. The SQL was not run and no Supabase connection was created.

## 7. Recommended next steps

1. Obtain a written scope decision from the city's Akiya programme contact listed on the housing page, addressing low-frequency automation, factual fields, commercial English service use and individual PDF links. Resolve photographs/descriptions separately; a facts-only feed or city-provided export would simplify extraction. **No message was sent on your behalf.**
2. Agree on persistent source availability/provenance fields before integrating this data into subscription search. Decide how negotiations, viewing closure, stale source ages and null prices should appear to subscribers.
3. With permitted samples, validate layout-aware PDF extraction or use a reviewed structured city feed. Preserve unknowns when selections or diagrams cannot be resolved.
4. Once permission and extraction scope are settled, approve a small bounded live validation and define completeness, user agent/contact, request ceilings, retries and cadence. A full crawl still requires further approval.

Love Live Myoko, Directus and Supabase were not changed. GitHub Actions, paid translation calls, deployment and GitHub pushes were not enabled.
