# Original Myoko-style HTML fixtures

These are invented test properties 900001–900003. `/fs/fixture-only/` URLs are
references only and must never be fetched or published as real inventory.
No city photographs, PDFs, full HTML pages or copied descriptions are stored.

The card structure follows the inspected `.bukken-list > .item`, regional
headings, `tr.info`, `.address`, `.price`, `.pdf` and `.pic` conventions. The
second snapshot reduces one price, explicitly withdraws another property and
omits the third. These cases test safe interpretation, not real property events.

Phase 3 reads only HTML. PDF fact projection files have been removed; land,
building, construction, layout and parking fields stay null. The two JSON files
are optional legacy index wrappers with synthetic inventory metadata. Their
old `details` content, if supplied, is ignored and never opened.

The fictional neighbourhoods intentionally have no English mapping and must be
returned in Japanese with review flags. Image URLs are persisted as strings;
tests block network access and do not open the image or PDF paths.
