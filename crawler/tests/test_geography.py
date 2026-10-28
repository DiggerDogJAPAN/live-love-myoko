from dataclasses import replace
from pathlib import Path
import tempfile
import unittest

from myoko_property_crawler.changes import State, reconcile
from myoko_property_crawler.adapters.base import CrawlBatch
from myoko_property_crawler.models import Property
from myoko_property_crawler.normalize import normalize_municipality, SUPPORTED_MUNICIPALITIES
from myoko_property_crawler.storage import load_state, save_state
from .helpers import DAY_ONE, initial_batch


class GeographyCompatibilityTests(unittest.TestCase):
    def test_iizuna_japanese_and_english_normalize_to_same_canonical_value(self):
        for raw in ("飯綱町", "Iizuna Town", "  飯綱町　"):
            with self.subTest(raw=raw):
                self.assertEqual(normalize_municipality(raw), "Iizuna Town")

    def test_all_existing_municipalities_stay_compatible(self):
        original = initial_batch().properties[0]
        for japanese, canonical in (("妙高市", "Myoko"), ("上越市", "Joetsu"), ("信濃町", "Shinano Town")):
            with self.subTest(canonical=canonical):
                self.assertEqual(normalize_municipality(japanese), canonical)
                self.assertEqual(normalize_municipality(canonical), canonical)
                prop = replace(original, municipality=canonical)
                self.assertEqual(Property.from_dict(prop.to_dict()), prop)

    def test_iizuna_record_reconciles_and_round_trips_without_migration(self):
        prop = replace(initial_batch().properties[0], source_key="synthetic_iizuna",
                       municipality="Iizuna Town", address="長野県飯綱町（架空）")
        state = reconcile(State(), CrawlBatch("synthetic_iizuna", DAY_ONE, (prop,))).state
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            save_state(path, state)
            self.assertEqual(load_state(path), state)
            self.assertEqual(load_state(path).properties[0].municipality, "Iizuna Town")

    def test_model_uses_shared_configured_vocabulary(self):
        original = initial_batch().properties[0]
        self.assertEqual(SUPPORTED_MUNICIPALITIES, {"Myoko", "Joetsu", "Shinano Town", "Iizuna Town"})
        for canonical in SUPPORTED_MUNICIPALITIES:
            self.assertEqual(replace(original, municipality=canonical).municipality, canonical)

    def test_kurohime_remains_an_area_not_a_municipality(self):
        prop = replace(initial_batch().properties[0], municipality="Shinano Town", area="黒姫", area_en="Kurohime")
        self.assertEqual(Property.from_dict(prop.to_dict()).municipality, "Shinano Town")
        self.assertEqual(prop.area_en, "Kurohime")
        for invalid in ("黒姫", "Kurohime", "長野市", "Nagano"):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    normalize_municipality(invalid)
                with self.assertRaises(ValueError):
                    replace(prop, municipality=invalid)

    def test_unknown_municipality_can_still_be_null(self):
        self.assertIsNone(normalize_municipality("不明"))
        self.assertIsNone(replace(initial_batch().properties[0], municipality=None).municipality)
