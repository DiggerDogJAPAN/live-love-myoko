# Architecture

```text
robots.txt → fixed HTML index → sale-card adapter → normalized Property
  → duplicate checks + snapshot validation → reconciliation → atomic internal JSON
  → explicit customer export → customer JSON without internal IDs
```

`live.HTMLClient` is the sole network boundary. It permits just two fixed HTTPS URLs: the city's robots.txt and housing index. It never follows PDF links, image references, scripts, iframes or redirects. Robots denial or retrieval failure prevents index collection; malformed responses, unexpected content types, truncated/oversized bodies, HTTP denials/rate limits and timeouts fail the run. Identifying user-agent configuration is supported; no authentication or bypass exists. Each run makes at most one request to each allowed URL, with no retries.

`MyokoAkiyaBankAdapter.parse_html` parses the component between the sale heading and rental heading, avoiding unrelated CMS markup. The same extraction is used for original local HTML fixtures and live responses. It validates region groups, card wrappers and both info rows. Unknown statuses and conflicting duplicates fail closed. Complete mode also requires a closed page and rejects detected pagination or an empty inventory. Legacy local JSON manifests are index wrappers only; their old PDF projections are no longer read.

Original listing numbers form internal `(source_key, source_property_id)` identity. PDF URLs may change while identity remains stable. A real source card has a stray link to another property: multiple distinct PDF references are accepted only if exactly one filename starts with the current property number followed by a nondigit/end boundary. Otherwise ambiguity stops collection. URLs are only recorded, never fetched.

Price normalization uses exact JPY integers and existing Unicode/decimal helpers. No facts are inferred from descriptions or images. Exact addresses, areas in square metres, construction, layouts and parking remain null. The source's neighbourhood goes in `area`, with an optional exact mapped `area_en`; `region_ja` and `region_en` are separate. `locations.py` holds reviewed mappings. Unknown place names retain Japanese and persist in `unmapped_locations` for review.

Publication (`listing_status`) is separate from `availability_status`. Negotiations and viewing closure remain published while recording the restriction. `source_status_ja` preserves the Japanese label from the most recent observed card. Missing records in a complete snapshot become `not_found`, availability becomes unknown, and the previous Japanese status remains historical evidence. They are never inferred sold. Reappearance replaces these with current card evidence.

`crawl_live` requests a structurally complete parse, then checks for a drop larger than 25% of previously active source IDs. A large drop downgrades the batch to partial and emits a warning; absent records retain their old status/check timestamp. Zero inventories and structurally broken pages fail rather than infer disappearance. These checks reduce risk but cannot prove that the city's own published inventory is complete.

`changes.reconcile` is a pure whole-batch operation with source watermarks, monotonic observations, stable discovery dates, duplicate checks and idempotent price events. A price event requires both adjacent prices to be known and different. An unknown price is null, never zero. Explicit sold/withdrawn records remain terminal when absent. Source IDs are not automatically merged across agencies.

`storage.save_state` atomically replaces version-1 local JSON. New Phase 3 fields have defaults so old records still load; legacy availability defaults to unknown rather than inventing historical restrictions. CLI writers use a nonblocking advisory lock held over load/reconcile/write (and live fetching). Export reads see either the old or new complete state. Python callers that write directly must serialize themselves. macOS/Linux are supported.

`customer.is_customer_eligible` centrally requires a Myoko record with both publication and availability active, and no unknown/restricted source status label. Empty labels and known unrestricted new/price-reduction badges are allowed; other labels fail closed. `customer_properties` is the collection export, and `customer_property` also enforces eligibility directly. The CLI delegates filtering to this module. Negotiating, viewing-closed, terminal, missing and unknown records stay in internal state but cannot enter the feed. Later successful observations replace status evidence, so reactivation is reflected on the next export without deletion/recreation.

The projection never serializes the internal record wholesale or reuses internal titles. Prices, thumbnails, PDF links and exact source attribution are unchanged. Resource URLs keep their original filenames; use labelled links rather than exposing filenames as display titles. Internal CLI summaries include IDs for operations and must not be used as customer payloads.

Translation API interfaces remain disabled/mock only. No database, scheduler, website integration or deployment is present. Phase 4A updates `sql/001_proposed_schema.sql` as a fresh-install proposal matching current fields plus requested observation/history metadata. The [database design](database-design.md) defines private tables, restricted role/view access, translation caching and a future subscription-aware server path. It is not applied; current Python/JSON behaviour is unchanged. Only SQL/PLpgSQL parsing and static contract checks have run, not database execution.
