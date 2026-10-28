"""Phase 3 supersedes the Phase 2 PDF-projection contract with HTML-only facts."""
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import replace
import io
import json
from pathlib import Path
import re
import shutil
import tempfile
import unittest
from unittest.mock import patch

from myoko_property_crawler.adapters.myoko_akiya_bank import MyokoAkiyaBankAdapter
from myoko_property_crawler.changes import DuplicateConflict, State, reconcile
from myoko_property_crawler.cli import main
from myoko_property_crawler.customer import customer_property
from myoko_property_crawler.locations import english_location
from myoko_property_crawler.models import AvailabilityStatus, ListingStatus, Property
from myoko_property_crawler.storage import load_state, save_state, state_lock
from .helpers import DAY_ONE, DAY_TWO, FIXTURES


class MyokoAdapterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name) / "bundle"
        shutil.copytree(FIXTURES / "myoko_akiya_bank", self.directory)
        self.adapter = MyokoAkiyaBankAdapter()

    def initial(self, complete=True):
        return self.adapter.crawl(self.directory / "initial.html", DAY_ONE, complete=complete)

    def updated(self, complete=True):
        return self.adapter.crawl(self.directory / "updated.html", DAY_TWO, complete=complete)

    def change(self, old, new):
        path = self.directory / "initial.html"
        text = path.read_text(encoding="utf-8")
        self.assertIn(old, text)
        path.write_text(text.replace(old, new), encoding="utf-8")

    def card(self):
        text = (self.directory / "initial.html").read_text(encoding="utf-8")
        return re.search(r'  <div class="item">.*?\n  </div>', text, re.DOTALL)[0]

    def test_extracts_only_card_facts_without_network_or_pdf_details(self):
        with patch("socket.socket", side_effect=AssertionError("No media or network")):
            prop = self.initial().properties[0]
        self.assertEqual(prop.asking_price_jpy, 12500000)
        self.assertEqual(prop.source_property_id, "900001")
        self.assertEqual(prop.source_key, "myoko_akiya_bank")
        self.assertEqual(prop.source_agency_name, "Myoko Akiya Bank")
        self.assertEqual((prop.region_ja, prop.region_en), ("新井", "Arai"))
        self.assertTrue(prop.main_image_url.endswith("900001.jpg"))
        self.assertTrue(prop.original_listing_url.endswith("900001.pdf"))
        self.assertNotIn("900001", prop.title_ja)
        for name in ("address", "land_area_sqm", "building_area_sqm", "construction_date", "building_age_years",
                     "floor_plan", "parking", "description_ja", "description_en"):
            with self.subTest(name=name):
                self.assertIsNone(getattr(prop, name))

    def test_legacy_manifest_no_longer_reads_or_requires_pdf_projection(self):
        path = self.directory / "initial.json"
        manifest = json.loads(path.read_text())
        manifest["details"] = {"900001": {"path": "/never/read/this.pdf"}}
        path.write_text(json.dumps(manifest), encoding="utf-8")
        self.assertEqual(self.adapter.crawl(path, DAY_ONE, complete=True), self.initial())

    def test_location_mappings_are_exact_and_unknowns_are_flagged(self):
        for japanese, english in {"妙高高原": "Myoko Kogen", "新井": "Arai", "妙高": "Myoko",
                                  "赤倉": "Akakura", "関山": "Sekiyama", "田口": "Taguchi"}.items():
            self.assertEqual(english_location(japanese), english)
        self.assertIsNone(english_location("田口付近"))
        unknown = self.initial().properties[0]
        self.assertEqual(unknown.unmapped_locations, ("架空地区甲",))
        self.assertEqual(customer_property(unknown)["location_display"], "架空地区甲")
        self.change("架空地区甲", "田口")
        known = self.initial().properties[0]
        self.assertEqual((known.area, known.area_en), ("田口", "Taguchi"))
        self.assertEqual(known.unmapped_locations, ())

    def test_publication_availability_and_japanese_status_persist(self):
        batch = self.initial()
        negotiating, closed = batch.properties[1:]
        self.assertTrue(all(p.listing_status == ListingStatus.ACTIVE for p in batch.properties))
        self.assertEqual(negotiating.availability_status, AvailabilityStatus.UNDER_NEGOTIATION)
        self.assertEqual(negotiating.source_status_ja, "商談中")
        self.assertEqual(closed.availability_status, AvailabilityStatus.VIEWINGS_CLOSED)
        self.assertEqual(closed.source_status_ja, "内覧受付終了")
        state = reconcile(State(), batch).state
        path = self.directory / "state.json"
        save_state(path, state)
        self.assertEqual(load_state(path), state)
        for unavailable in (negotiating, closed):
            with self.assertRaisesRegex(ValueError, "not eligible"):
                customer_property(unavailable)

    def test_price_withdrawal_absence_and_replay(self):
        result = reconcile(reconcile(State(), self.initial()).state, self.updated())
        self.assertEqual(len(result.price_changes), 1)
        self.assertEqual((result.price_changes[0].old_price_jpy, result.price_changes[0].new_price_jpy), (12500000, 11000000))
        props = {p.source_property_id: p for p in result.state.properties}
        self.assertEqual(props["900002"].listing_status, ListingStatus.WITHDRAWN)
        self.assertEqual(props["900002"].availability_status, AvailabilityStatus.WITHDRAWN)
        self.assertEqual(props["900003"].listing_status, ListingStatus.NOT_FOUND)
        self.assertEqual(props["900003"].availability_status, AvailabilityStatus.UNKNOWN)
        self.assertEqual(props["900003"].source_status_ja, "内覧受付終了")
        with self.assertRaisesRegex(ValueError, "not eligible"):
            customer_property(props["900003"])
        self.assertEqual(props["900001"].first_discovered_at, DAY_ONE)
        self.assertEqual(reconcile(result.state, self.updated()).state, result.state)

    def test_partial_does_not_infer_absence(self):
        result = reconcile(reconcile(State(), self.initial()).state, self.updated(complete=False))
        absent = next(p for p in result.state.properties if p.source_property_id == "900003")
        self.assertEqual(absent.listing_status, ListingStatus.ACTIVE)
        self.assertEqual(absent.last_checked_at, DAY_ONE)
        self.assertEqual(result.marked_not_found, 0)

    def test_exact_duplicates_collapse(self):
        card = self.card()
        self.change(card, card + card)
        result = reconcile(State(), self.initial())
        self.assertEqual(result.duplicates_ignored, 1)
        self.assertEqual(len(result.state.properties), 3)

    def test_conflicting_duplicates_are_rejected(self):
        card = self.card()
        self.change(card, card + card.replace("１，２５０万円", "９００万円"))
        with self.assertRaises(DuplicateConflict):
            self.initial()

    def test_conflicting_badges_are_rejected(self):
        card = self.card()
        self.change(card, card + card.replace("NEW", "商談中"))
        with self.assertRaises(DuplicateConflict):
            self.initial()

    def test_same_url_different_ids_rejected(self):
        self.change("/900002.pdf", "/900001.pdf")
        with self.assertRaises(DuplicateConflict):
            self.initial()

    def test_stray_pdf_link_requires_exact_listing_number_prefix(self):
        self.change('<a class="icon-pdf"', '<a href="/fs/wrong/9000010.pdf">詳細情報</a><a class="icon-pdf"')
        self.assertTrue(self.initial().properties[0].original_listing_url.endswith("/900001.pdf"))

    def test_two_matching_pdf_revisions_are_ambiguous(self):
        self.change('<a class="icon-pdf"', '<a href="/fs/900001-other.pdf">詳細情報</a><a class="icon-pdf"')
        with self.assertRaisesRegex(ValueError, "unambiguous"):
            self.initial()

    def test_news_and_rentals_are_excluded(self):
        self.change("<h2>売り物件情報</h2>", "<p>No.900001 値下げ: １万円</p><h2>売り物件情報</h2>")
        self.change('<h2 id="kashi">貸し物件情報</h2>', '<h2 id="kashi">貸し物件情報</h2><div class="bukken-list">' +
                    self.card().replace("１，２５０万円", "月額５万円") + '</div>')
        batch = self.initial()
        self.assertEqual(len(batch.properties), 3)
        self.assertEqual(batch.properties[0].asking_price_jpy, 12500000)

    def test_unknown_price_and_missing_image_are_null(self):
        self.assertIsNone(self.initial().properties[1].asking_price_jpy)
        self.assertIsNone(self.initial().properties[2].main_image_url)

    def test_unknown_or_negated_status_rejected(self):
        self.change('>NEW</td>', '>未成約・要確認</td>')
        with self.assertRaises(ValueError):
            self.initial()

    def test_explicit_sold_is_preserved(self):
        self.change('>NEW</td>', '>成約済</td>')
        prop = self.initial().properties[0]
        self.assertEqual(prop.listing_status, ListingStatus.SOLD)
        self.assertEqual(prop.availability_status, AvailabilityStatus.SOLD)

    def test_error_truncation_and_missing_boundary_fail_closed(self):
        path = self.directory / "initial.html"
        html = path.read_text(encoding="utf-8")
        for text in ("<html><body>Access denied</body></html>", html[:-30], html.replace('id="kashi"', 'id="different"')):
            path.write_text(text, encoding="utf-8")
            with self.subTest(text=text[:20]), self.assertRaises(ValueError):
                self.initial()

    def test_missing_region_fails_completeness(self):
        self.change('id="myoko"', 'id="unknown"')
        with self.assertRaises(ValueError):
            self.initial()

    def test_changed_wrapper_does_not_silently_drop_cards(self):
        self.change('class="item"', 'class="new-card"')
        with self.assertRaises(ValueError):
            self.initial()
        self.change('class="info"', 'class="new-info"')
        with self.assertRaises(ValueError):
            self.initial()

    def test_pagination_rejects_completeness(self):
        self.change("</body>", '<a rel="next" href="?page=2">次へ</a></body>')
        with self.assertRaisesRegex(ValueError, "Pagination"):
            self.initial()
        self.assertFalse(self.initial(complete=False).complete)

    def test_empty_complete_snapshot_is_not_mass_removal(self):
        html = '<html><body><h2>売り物件情報</h2>' + ''.join(
            '<h3 id="' + region + '"></h3><div class="bukken-list"></div>' for region in ("arai", "myokokougen", "myoko"))
        html += '<h2 id="kashi">貸し物件情報</h2></body></html>'
        with self.assertRaisesRegex(ValueError, "Empty inventory"):
            self.adapter.parse_html(html, DAY_ONE, complete=True)

    def test_external_image_host_rejected(self):
        self.change("/fs/fixture-only/_/900001.jpg", "https://other.invalid/photo.jpg")
        with self.assertRaises(ValueError):
            self.initial()

    def test_legacy_state_defaults_are_backward_compatible(self):
        data = self.initial().properties[0].to_dict()
        for name in ("area_en", "region_ja", "region_en", "unmapped_locations", "availability_status", "source_status_ja"):
            data.pop(name)
        restored = Property.from_dict(data)
        self.assertEqual(restored.availability_status, AvailabilityStatus.UNKNOWN)
        self.assertEqual(restored.unmapped_locations, ())

    def test_customer_output_has_exact_attribution_without_internal_fields(self):
        prop = replace(self.initial().properties[0], title_ja="No.900001", title_en="Internal ID 900001")
        display = customer_property(prop)
        self.assertEqual(display["source_attribution"], "Source: Myoko Akiya Bank")
        self.assertNotIn("900001", display["title"])
        self.assertFalse({"source_property_id", "source_key", "id", "identity_token"} & display.keys())
        with self.assertRaises(ValueError):
            customer_property(replace(prop, source_key="other"))

    def test_state_lock_prevents_overlapping_writers(self):
        with state_lock(self.directory / "state.json"):
            with self.assertRaisesRegex(ValueError, "Another crawler"):
                with state_lock(self.directory / "state.json"):
                    self.fail("Second writer acquired lock")

    def test_cli_exports_only_published_records_and_cannot_overwrite_state(self):
        path = self.directory / "state.json"
        state = reconcile(reconcile(State(), self.initial()).state, self.updated()).state
        save_state(path, state)
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(main(["export-customer", "--state", str(path)]), 0)
        self.assertEqual(len(json.loads(output.getvalue())), 1)
        with redirect_stderr(io.StringIO()):
            self.assertEqual(main(["export-customer", "--state", str(path), "--output", str(path)]), 2)
        self.assertEqual(load_state(path), state)
