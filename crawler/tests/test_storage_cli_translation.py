from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from myoko_property_crawler.changes import State, reconcile
from myoko_property_crawler.cli import main
from myoko_property_crawler.storage import load_state, save_state
from myoko_property_crawler.translation import DisabledTranslator, MockTranslator, translate_property
from .helpers import DAY_ONE, DAY_TWO, FIXTURES, initial_batch, updated_batch


class StorageTests(unittest.TestCase):
    def test_round_trip_includes_price_history_and_watermarks(self):
        state = reconcile(reconcile(State(), initial_batch()).state, updated_batch()).state
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "nested" / "state.json"
            self.assertEqual(load_state(path), State())
            save_state(path, state)
            self.assertEqual(load_state(path), state)
            self.assertIn("妙高", path.read_text(encoding="utf-8"))

    def test_corrupt_or_unknown_version_is_not_silently_reset(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            for text in ('{"version": 99}', "not JSON", "[]", '{"version": 1, "properties": null}'):
                path.write_text(text, encoding="utf-8")
                with self.assertRaises(ValueError):
                    load_state(path)

    def test_atomic_replace_failure_preserves_old_file_and_cleans_temp(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            save_state(path, State())
            before = path.read_bytes()
            with patch("myoko_property_crawler.storage.os.replace", side_effect=OSError("simulated failure")):
                with self.assertRaises(OSError):
                    save_state(path, reconcile(State(), initial_batch()).state)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(list(Path(directory).iterdir()), [path])


class TranslationTests(unittest.TestCase):
    def test_disabled_provider_leaves_english_empty(self):
        prop = initial_batch().properties[0]
        self.assertEqual(translate_property(prop, DisabledTranslator()), prop)

    def test_mock_only_returns_authored_translations(self):
        prop = initial_batch().properties[0]
        translator = MockTranslator({prop.title_ja: "Sample Myoko house", prop.description_ja: "Fictional test house."})
        translated = translate_property(prop, translator)
        self.assertEqual(translated.title_en, "Sample Myoko house")
        self.assertEqual(translated.description_en, "Fictional test house.")
        self.assertEqual(translator.translate("unknown text").provider, "mock")
        self.assertIsNone(translator.translate("unknown text").text)
        with self.assertRaises(ValueError):
            translator.translate(prop.title_ja, target_language="fr")


class CliTests(unittest.TestCase):
    def invoke(self, arguments):
        output = io.StringIO()
        errors = io.StringIO()
        with patch.dict("os.environ", {"MYOKO_TRANSLATION_PROVIDER": "disabled"}), redirect_stdout(output), redirect_stderr(errors):
            code = main(arguments)
        return code, output.getvalue(), errors.getvalue()

    def args(self, state, fixture="initial.html", timestamp=DAY_ONE):
        return ["crawl-fixture", str(FIXTURES / fixture), "--state", str(state),
                "--checked-at", timestamp.isoformat(), "--complete"]

    def test_end_to_end_demo_is_offline_and_replay_safe(self):
        with tempfile.TemporaryDirectory() as directory, patch("socket.socket", side_effect=AssertionError("Network access forbidden")):
            path = Path(directory) / "state.json"
            code, output, errors = self.invoke(self.args(path))
            self.assertEqual((code, errors), (0, ""))
            self.assertEqual(json.loads(output)["discovered"], 3)
            code, output, errors = self.invoke(self.args(path, "updated.html", DAY_TWO))
            self.assertEqual((code, errors), (0, ""))
            summary = json.loads(output)
            self.assertEqual(summary["marked_not_found"], 1)
            self.assertEqual(summary["price_changes"][0]["new_price_jpy"], 11000000)
            before = path.read_bytes()
            self.assertEqual(self.invoke(self.args(path, "updated.html", DAY_TWO))[0], 0)
            self.assertEqual(path.read_bytes(), before)

    def test_dry_run_does_not_create_state(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "nested" / "state.json"
            code, output, _ = self.invoke(self.args(path) + ["--dry-run"])
            self.assertEqual(code, 0)
            self.assertTrue(json.loads(output)["dry_run"])
            self.assertFalse(path.parent.exists())
            self.assertEqual(self.invoke(self.args(path))[0], 0)
            before = path.read_bytes()
            code, output, _ = self.invoke(self.args(path, "updated.html", DAY_TWO) + ["--dry-run"])
            self.assertEqual(code, 0)
            self.assertEqual(len(json.loads(output)["price_changes"]), 1)
            self.assertEqual(path.read_bytes(), before)

    def test_utc_z_timestamp_is_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            args = self.args(path)
            args[args.index("--checked-at") + 1] = "2026-10-27T00:00:00Z"
            self.assertEqual(self.invoke(args)[0], 0)
            self.assertEqual(load_state(path).source_checked_at["example"], DAY_ONE)

    def test_failed_extraction_preserves_state(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            self.assertEqual(self.invoke(self.args(path))[0], 0)
            before = path.read_bytes()
            broken = Path(directory) / "broken.html"
            broken.write_text('<article data-listing data-id="broken">', encoding="utf-8")
            code, _, errors = self.invoke(["crawl-fixture", str(broken), "--state", str(path)])
            self.assertEqual(code, 2)
            self.assertIn("Truncated", errors)
            self.assertEqual(path.read_bytes(), before)

    def test_invalid_time_and_paid_translation_config_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            args = self.args(path)
            args[args.index("--checked-at") + 1] = "2026-10-27"
            self.assertEqual(self.invoke(args)[0], 2)
            self.assertFalse(path.exists())
            with patch.dict("os.environ", {"MYOKO_TRANSLATION_PROVIDER": "paid-provider"}), redirect_stderr(io.StringIO()):
                self.assertEqual(main(self.args(path)), 2)
            self.assertFalse(path.exists())
