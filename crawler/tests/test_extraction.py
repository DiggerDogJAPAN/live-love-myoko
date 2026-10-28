from dataclasses import replace
from decimal import Decimal
from pathlib import Path
import tempfile
import unittest

from myoko_property_crawler.adapters.example import ExampleFixtureAdapter
from .helpers import DAY_ONE, FIXTURES, initial_batch


class ExtractionTests(unittest.TestCase):
    def test_extracts_all_municipalities_and_optional_fields(self):
        batch = initial_batch()
        self.assertTrue(batch.complete)
        self.assertEqual(len(batch.properties), 3)
        house, land, shinano = batch.properties
        self.assertEqual(house.asking_price_jpy, 12000000)
        self.assertEqual(house.land_area_sqm, Decimal("330.50"))
        self.assertEqual(house.building_area_sqm, Decimal("120.25"))
        self.assertEqual(house.construction_date, "1998-04")
        self.assertEqual(house.floor_plan, "4LDK")
        self.assertEqual(house.description_ja, "テスト用に作成した架空の住宅です。")
        self.assertIsNone(house.main_image_url)
        self.assertIsNone(land.building_area_sqm)
        self.assertEqual(shinano.municipality, "Shinano Town")
        self.assertIsNone(shinano.asking_price_jpy)
        self.assertTrue(shinano.identity[1].startswith("url:"))

    def parse(self, html, complete=False):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.html"
            path.write_text(html, encoding="utf-8")
            return ExampleFixtureAdapter().crawl(path, DAY_ONE, complete=complete)

    def test_truncated_and_invalid_records_fail(self):
        for html in ('<article data-listing data-id="1">',
                     '<article data-listing data-url="https://example.invalid/1"></article>',
                     '<article data-listing data-url="https://real.example/1"><h2 data-field="title">架空</h2></article>'):
            with self.subTest(html=html), self.assertRaises(ValueError):
                self.parse(html)

    def test_empty_snapshot_requires_explicit_completeness(self):
        with self.assertRaises(ValueError):
            self.parse("<html></html>", complete=True)
        batch = self.parse('<meta name="fixture-complete" content="true">', complete=True)
        self.assertEqual(batch.properties, ())
        self.assertFalse(ExampleFixtureAdapter().crawl(FIXTURES / "initial.html", DAY_ONE).complete)

    def test_live_policy_is_blocked(self):
        adapter = ExampleFixtureAdapter()
        adapter.policy = replace(adapter.policy, synthetic=False, live_access_approved=True)
        with self.assertRaises(ValueError):
            adapter.crawl(FIXTURES / "initial.html", DAY_ONE)
