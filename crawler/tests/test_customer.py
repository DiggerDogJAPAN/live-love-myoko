from contextlib import redirect_stdout
from dataclasses import replace
from datetime import timedelta
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from myoko_property_crawler.adapters.base import CrawlBatch
from myoko_property_crawler.adapters.myoko_akiya_bank import MyokoAkiyaBankAdapter
from myoko_property_crawler.changes import State, reconcile
from myoko_property_crawler.cli import main
from myoko_property_crawler.customer import customer_properties, customer_property, is_customer_eligible
from myoko_property_crawler.models import AvailabilityStatus, ListingStatus
from myoko_property_crawler.storage import load_state, save_state
from .helpers import DAY_ONE, DAY_TWO, FIXTURES


class CustomerEligibilityTests(unittest.TestCase):
    def setUp(self):
        self.adapter = MyokoAkiyaBankAdapter()
        self.html = (FIXTURES / "myoko_akiya_bank" / "initial.html").read_text(encoding="utf-8")
        self.prop = self.adapter.parse_html(self.html, DAY_ONE, complete=True).batch.properties[0]

    def test_only_both_active_statuses_are_eligible(self):
        for publication in ListingStatus:
            for availability in AvailabilityStatus:
                prop = replace(self.prop, listing_status=publication, availability_status=availability)
                expected = publication == ListingStatus.ACTIVE and availability == AvailabilityStatus.ACTIVE
                with self.subTest(publication=publication, availability=availability):
                    self.assertEqual(is_customer_eligible(prop), expected)
                    self.assertEqual(len(customer_properties([prop])), int(expected))
                    if not expected:
                        with self.assertRaisesRegex(ValueError, "not eligible"):
                            customer_property(prop)

    def test_unknown_and_restricted_source_labels_override_active_flags(self):
        for label in ("商談中", "内覧受付終了", "成約済", "売却済", "登録取消", "募集終了", "要確認", "不明",
                      "未成約", "新着 商談中", "NEW 内覧受付終了", "値下げ 受付停止", "viewing_closed",
                      "Under negotiation", "Viewing Registration Closed", "Active?", "募集中（条件あり）"):
            prop = replace(self.prop, source_status_ja=label)
            with self.subTest(label=label):
                self.assertFalse(is_customer_eligible(prop))
                self.assertEqual(customer_properties([prop]), [])
                with self.assertRaises(ValueError):
                    customer_property(prop)

    def test_only_known_unrestricted_labels_are_allowed(self):
        for label in (None, "", " \n ", "募集中", "新着", "値下げ", "NEW", "Price Reduced", "新着 値下げ", "NEW 値下げ Price Reduced"):
            with self.subTest(label=label):
                self.assertTrue(is_customer_eligible(replace(self.prop, source_status_ja=label)))

    def test_foreign_sources_are_excluded(self):
        prop = replace(self.prop, source_key="other_agency")
        self.assertFalse(is_customer_eligible(prop))
        self.assertEqual(customer_properties([prop]), [])

    def test_unmapped_places_are_not_availability_restrictions(self):
        self.assertTrue(self.prop.unmapped_locations)
        self.assertTrue(is_customer_eligible(self.prop))

    def test_eligible_projection_keeps_attribution_and_card_values(self):
        display = customer_property(self.prop)
        self.assertEqual(display["source_attribution"], "Source: Myoko Akiya Bank")
        self.assertEqual(display["status"], "Active")
        self.assertEqual(display["asking_price_jpy"], self.prop.asking_price_jpy)
        self.assertEqual(display["thumbnail_url"], self.prop.main_image_url)
        self.assertEqual(display["original_pdf_url"], self.prop.original_listing_url)

    def test_active_to_restricted_and_back_uses_successive_html_observations(self):
        for label in ("商談中", "内覧受付終了", "成約済", "登録取消"):
            with self.subTest(label=label):
                first = self.adapter.parse_html(self.html, DAY_ONE, complete=True).batch
                state = reconcile(State(), first).state
                self.assertEqual(len(customer_properties(state.properties)), 1)
                restricted = self.adapter.parse_html(self.html.replace('>NEW</td>', '>' + label + '</td>'), DAY_TWO, complete=True).batch
                state = reconcile(state, restricted).state
                self.assertEqual(customer_properties(state.properties), [])
                self.assertEqual(len(state.properties), 3)
                restored = self.adapter.parse_html(self.html, DAY_TWO + timedelta(days=1), complete=True).batch
                state = reconcile(state, restored).state
                self.assertEqual(len(customer_properties(state.properties)), 1)
                prop = next(p for p in state.properties if p.source_property_id == self.prop.source_property_id)
                self.assertEqual(prop.first_discovered_at, DAY_ONE)
                self.assertEqual(prop.availability_status, AvailabilityStatus.ACTIVE)
                self.assertIsNone(prop.source_status_ja)

    def test_every_excluded_availability_can_return_after_active_confirmation(self):
        for unavailable in AvailabilityStatus:
            if unavailable == AvailabilityStatus.ACTIVE:
                continue
            with self.subTest(availability=unavailable):
                initial = replace(self.prop, availability_status=unavailable)
                state = reconcile(State(), CrawlBatch("myoko_akiya_bank", DAY_ONE, (initial,))).state
                self.assertEqual(customer_properties(state.properties), [])
                active = replace(self.prop, last_checked_at=DAY_TWO)
                state = reconcile(state, CrawlBatch("myoko_akiya_bank", DAY_TWO, (active,))).state
                self.assertEqual(len(customer_properties(state.properties)), 1)

    def test_missing_record_is_hidden_and_returns_after_observed_reappearance(self):
        state = reconcile(State(), CrawlBatch("myoko_akiya_bank", DAY_ONE, (self.prop,))).state
        state = reconcile(state, CrawlBatch("myoko_akiya_bank", DAY_TWO, (), complete=True)).state
        self.assertEqual(customer_properties(state.properties), [])
        self.assertEqual(len(state.properties), 1)
        returned = replace(self.prop, last_checked_at=DAY_TWO + timedelta(days=1))
        state = reconcile(state, CrawlBatch("myoko_akiya_bank", returned.last_checked_at, (returned,))).state
        self.assertEqual(len(customer_properties(state.properties)), 1)

    def test_partial_absence_keeps_previously_confirmed_active_record(self):
        state = reconcile(State(), CrawlBatch("myoko_akiya_bank", DAY_ONE, (self.prop,))).state
        state = reconcile(state, CrawlBatch("myoko_akiya_bank", DAY_TWO, (), complete=False)).state
        self.assertEqual(len(customer_properties(state.properties)), 1)
        self.assertEqual(state.properties[0].last_checked_at, DAY_ONE)

    def test_cli_export_is_offline_and_never_modifies_internal_records(self):
        state = reconcile(State(), self.adapter.parse_html(self.html, DAY_ONE, complete=True).batch).state
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            output_path = Path(directory) / "customer.json"
            save_state(path, state)
            before = path.read_bytes()
            with patch("socket.socket", side_effect=AssertionError("No live crawl")):
                self.assertEqual(main(["export-customer", "--state", str(path), "--output", str(output_path)]), 0)
                output = io.StringIO()
                with redirect_stdout(output):
                    self.assertEqual(main(["export-customer", "--state", str(path)]), 0)
            self.assertEqual(json.loads(output.getvalue()), json.loads(output_path.read_text()))
            self.assertEqual(len(json.loads(output.getvalue())), 1)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(load_state(path), state)
