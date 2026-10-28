# Adding a source website

## 1. Review before implementation

Start with [source-review-template.md](source-review-template.md). Record the exact agency/host, intended public listing paths, target municipalities, robots.txt, terms and other published access conditions with review times and evidence. Review the applicable user agent and path rules, not just whether a robots file exists. Read the pages with low-volume, ordinary access. If terms are unavailable or ambiguous, record that uncertainty and resolve it before enabling collection. Robots permission alone does not authorize reproduction or reuse.

Check access requirements and restrictions before fetching samples. Stop for CAPTCHA, authentication requirements, anti-bot challenges, paywalls, rate-limit blocks or other access controls; do not bypass them. Record any explicit request limits and approved collection cadence. Confirm whether automated collection, storage, translation, attribution, image linking and publication are permitted separately. Contact the agency or seek an appropriate review if the basis is unclear. Do not save third-party photographs or full descriptions as fixtures without a suitable lawful basis. Original synthetic fixtures are the default.

Myoko Akiya Bank has a bounded HTML-only live fetcher under the user's explicit Phase 3 permission. Its [earlier investigation](myoko-akiya-bank-investigation.md) remains historical evidence; it is not a requirement to ask for permission again for this authorized source. Other future live sources need a source review and an authorized collection scope before enabling network access. The synthetic example source remains offline.

## 2. Build an offline adapter

1. Create `src/myoko_property_crawler/adapters/<source_key>.py` with a stable `SourcePolicy` and a `crawl(Path, checked_at, *, complete=False)` method matching the protocol in `adapters/base.py`.
2. Create original synthetic fixtures that reproduce only the structural conventions needed for extraction, or use reviewed permitted material with its rights basis recorded. Include missing/optional values, multiple pages where relevant, duplicates and malformed records. Do not download photos.
3. Extract all required source information, use the normalization helpers where their assumptions apply, and create `Property` instances. Use `None` for unknowns. Never invent an English title, age, price or municipality. Keep the source ID stable between runs; document URL canonicalization specific to the source.
4. Map explicit source status evidence carefully. A search-result omission is not a sold listing. Leave descriptions and image URLs empty unless their usage has a documented permitted basis. Record the permission and basis in every populated record.
5. Return a source-specific `CrawlBatch` with a timezone-aware timestamp and `complete=False` by default. Any extraction error should fail the batch or make it explicitly partial; never silently skip errors and claim completeness.
6. Add tests asserting extracted content, normalized values, missing values, duplicate conflicts and partial-snapshot behaviour. Run the shared test suite. Do not simply copy the synthetic `fixture-complete` marker as a live completeness mechanism.
7. Register fixture adapters explicitly in the CLI's `--source` choices and dispatch, with CLI tests. Current fixture choices are `example` and `myoko_akiya_bank`. The separate `crawl-live` command is restricted to Myoko's robots/index URLs. Do not make it an arbitrary-URL downloader; add a reviewed transport allowlist and source-specific completeness tests for another live source.

Tests can start from this pattern:

```python
from datetime import datetime, timezone
from pathlib import Path

from myoko_property_crawler.adapters.example import ExampleFixtureAdapter
from myoko_property_crawler.changes import State, reconcile

batch = ExampleFixtureAdapter().crawl(
    Path("tests/fixtures/initial.html"),
    datetime(2026, 10, 27, tzinfo=timezone.utc),
    complete=True,
)
result = reconcile(State(), batch)
assert result.discovered == 3
```

## 3. Future live integration review

Before implementing a fetcher, agree on allowed hosts and redirects, public paths, user-agent identification/contact, per-source cadence, concurrency, timeouts, retry/backoff, response-size limits and request ceilings. Refresh robots/terms evidence when it changes and periodically thereafter. Explicitly define the source-wide coverage that allows a complete run. Handle challenges and denied access by stopping, recording failure and preserving existing records.

Keep transport, parsing and persistence separate. Verify new adapters against permitted samples before a bounded authorized live check. Phase 3's Myoko collector reads just the one HTML inventory and stores resource references; it never fetches PDFs or photographs. Scheduling, database writes and website publication remain future work.
