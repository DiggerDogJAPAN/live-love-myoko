from dataclasses import replace
from datetime import datetime
from decimal import Decimal
import unittest

from myoko_property_crawler.models import ContentPermission, Property, canonical_url
from myoko_property_crawler.normalize import normalize_municipality, parse_area_sqm, parse_price_jpy
from .helpers import initial_batch


class NormalizationTests(unittest.TestCase):
    def test_prices(self):
        for raw, expected in [("１，２００万円", 12000000), ("1億2,500万円", 125000000),
                              ("0.5万円", 5000), ("12,345円", 12345), ("0円", 0),
                              ("相談", None), ("価格応相談", None), ("", None)]:
            with self.subTest(raw=raw):
                self.assertEqual(parse_price_jpy(raw), expected)

    def test_ambiguous_prices_rejected(self):
        for raw in ("1,000〜2,000万円", "月額8万円", "約1,000万円", "-100円", "0.1円", "NaN", "万円"):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_price_jpy(raw)

    def test_areas(self):
        for raw in ("１２３．４５㎡", "123.45 m²", "123.45平米"):
            self.assertEqual(parse_area_sqm(raw), Decimal("123.45"))
        self.assertIsNone(parse_area_sqm("不明"))
        for raw in ("100坪", "0㎡", "-5㎡", "50〜60㎡"):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_area_sqm(raw)

    def test_municipalities(self):
        self.assertEqual(normalize_municipality("妙高市"), "Myoko")
        self.assertEqual(normalize_municipality("上越市"), "Joetsu")
        self.assertEqual(normalize_municipality("信濃町"), "Shinano Town")
        with self.assertRaises(ValueError):
            normalize_municipality("長野市")

    def test_url_normalization_preserves_listing_parameters(self):
        self.assertEqual(canonical_url("https://EXAMPLE.invalid/detail?id=42&utm_source=x#photo"),
                         "https://example.invalid/detail?id=42")
        for raw in ("javascript:alert(1)", "/listing", "https://user:password@example.invalid"):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                canonical_url(raw)

    def test_property_round_trip(self):
        prop = initial_batch().properties[0]
        self.assertEqual(Property.from_dict(prop.to_dict()), prop)

    def test_model_validation(self):
        prop = initial_batch().properties[0]
        for values in ({"asking_price_jpy": -1}, {"asking_price_jpy": True},
                       {"building_area_sqm": Decimal("NaN")}, {"building_area_sqm": Decimal("Infinity")},
                       {"construction_date": "2023-02-29"}, {"construction_date": "1998-13"},
                       {"last_checked_at": datetime(2026, 10, 27)}, {"source_property_id": " "},
                       {"listing_status": "probably_sold"}, {"municipality": "Nagano"},
                       {"main_image_url": ""}, {"content_rights_basis": " "}):
            with self.subTest(values=values), self.assertRaises((ValueError, TypeError)):
                replace(prop, **values)

    def test_content_requires_rights(self):
        prop = initial_batch().properties[0]
        with self.assertRaises(ValueError):
            replace(prop, description_permission=ContentPermission.UNKNOWN)
        with self.assertRaises(ValueError):
            replace(prop, main_image_url="https://example.invalid/photo.jpg")
        with self.assertRaises(ValueError):
            replace(prop, content_rights_basis=None)
        permitted = replace(prop, main_image_url="https://example.invalid/photo.jpg",
                            image_permission=ContentPermission.SYNTHETIC)
        self.assertIsNotNone(permitted.main_image_url)
