from dataclasses import replace
from email.message import Message
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError

from myoko_property_crawler.adapters.myoko_akiya_bank import INDEX_URL, MyokoAkiyaBankAdapter
from myoko_property_crawler.changes import State, reconcile
from myoko_property_crawler.cli import main
from myoko_property_crawler.live import HTMLClient, ROBOTS_URL, _NoRedirect, crawl_live
from myoko_property_crawler.models import ListingStatus
from myoko_property_crawler.storage import load_state, save_state
from .helpers import DAY_ONE, FIXTURES

HTML = (FIXTURES / "myoko_akiya_bank" / "initial.html").read_text(encoding="utf-8")
UPDATED = (FIXTURES / "myoko_akiya_bank" / "updated.html").read_text(encoding="utf-8")
ROBOTS = "User-agent: *\nDisallow: /kana/\n"


class Response(io.BytesIO):
    def __init__(self, url, text, content_type):
        super().__init__(text.encode("utf-8"))
        self.url, self.status = url, 200
        self.headers = Message()
        self.headers["Content-Type"] = content_type + "; charset=utf-8"
        self.headers["Content-Length"] = str(len(text.encode("utf-8")))

    def geturl(self):
        return self.url


def transport(robots=ROBOTS, html=HTML):
    opener = Mock()
    opener.open.side_effect = [Response(ROBOTS_URL, robots, "text/plain"), Response(INDEX_URL, html, "text/html")]
    return HTMLClient(opener=opener), opener


class TransportTests(unittest.TestCase):
    def test_only_robots_and_single_index_are_requested(self):
        client, opener = transport()
        self.assertEqual(client.fetch_index(), HTML)
        self.assertEqual([call.args[0].full_url for call in opener.open.call_args_list], [ROBOTS_URL, INDEX_URL])
        self.assertIn("MyokoPropertyCrawler", opener.open.call_args.args[0].get_header("User-agent"))

    def test_media_urls_are_rejected_before_request(self):
        client, opener = transport()
        with self.assertRaises(ValueError):
            client._read("https://www.city.myoko.niigata.jp/fs/photo.jpg", 100, "image/jpeg")
        opener.open.assert_not_called()

    def test_robots_disallow_prevents_index_request(self):
        client, opener = transport("User-agent: *\nDisallow: /myoko-life/\n")
        with self.assertRaisesRegex(ValueError, "disallows"):
            client.fetch_index()
        self.assertEqual(opener.open.call_count, 1)

    def test_missing_or_malformed_robots_is_not_permission(self):
        client, opener = transport("<html>Access denied</html>")
        with self.assertRaises(ValueError):
            client.fetch_index()
        self.assertEqual(opener.open.call_count, 1)

    def test_http_access_denial_is_not_retried(self):
        client, opener = transport()
        opener.open.side_effect = HTTPError(ROBOTS_URL, 403, "Forbidden", None, None)
        with self.assertRaises(HTTPError):
            client.fetch_index()
        self.assertEqual(opener.open.call_count, 1)

    def test_http_rate_limit_is_not_retried(self):
        client, opener = transport()
        opener.open.side_effect = [Response(ROBOTS_URL, ROBOTS, "text/plain"), HTTPError(INDEX_URL, 429, "Rate limited", None, None)]
        with self.assertRaises(HTTPError):
            client.fetch_index()
        self.assertEqual(opener.open.call_count, 2)

    def test_redirects_are_never_followed(self):
        with self.assertRaisesRegex(ValueError, "redirect"):
            _NoRedirect().redirect_request(None, None, 302, "", None, "https://other.invalid/")

    def test_robots_delay_is_respected_without_sleeping_in_test(self):
        client, _ = transport("User-agent: *\nCrawl-delay: 2\nDisallow: /kana/\n")
        with patch("myoko_property_crawler.live.time.sleep") as sleep:
            client.fetch_index()
            sleep.assert_called_once_with(2)

    def test_excessive_delay_stops_the_bounded_run(self):
        client, opener = transport("User-agent: *\nCrawl-delay: 120\n")
        with self.assertRaises(ValueError):
            client.fetch_index()
        self.assertEqual(opener.open.call_count, 1)

    def test_wrong_content_type_is_rejected(self):
        client, opener = transport()
        opener.open.side_effect = [Response(ROBOTS_URL, ROBOTS, "text/plain"), Response(INDEX_URL, HTML, "application/pdf")]
        with self.assertRaisesRegex(ValueError, "content type"):
            client.fetch_index()

    def test_truncated_http_body_is_rejected(self):
        response = Response(INDEX_URL, HTML, "text/html")
        response.headers.replace_header("Content-Length", str(len(HTML.encode("utf-8")) + 10))
        client, opener = transport()
        opener.open.side_effect = [Response(ROBOTS_URL, ROBOTS, "text/plain"), response]
        with self.assertRaisesRegex(ValueError, "Incomplete HTTP"):
            client.fetch_index()

    def test_oversized_body_is_rejected(self):
        client, _ = transport(html="x" * 1_000_001)
        with self.assertRaisesRegex(ValueError, "size limit"):
            client.fetch_index()

    def test_bad_client_configuration_is_rejected(self):
        for kwargs in ({"timeout": 0}, {"timeout": 61}, {"timeout": float("nan")}, {"user_agent": "bad\nagent"}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                HTMLClient(**kwargs)


class LiveRunTests(unittest.TestCase):
    def test_live_run_builds_html_only_properties(self):
        client, _ = transport()
        result = crawl_live(State(), client=client)
        self.assertTrue(result.complete)
        self.assertEqual(result.reconciliation.discovered, 3)
        self.assertTrue(all(p.land_area_sqm is None for p in result.reconciliation.state.properties))

    def test_unexpected_large_drop_is_partial_without_absence_changes(self):
        state = reconcile(State(), MyokoAkiyaBankAdapter().parse_html(HTML, DAY_ONE, complete=True).batch).state
        client, _ = transport(html=UPDATED)
        result = crawl_live(state, client=client)
        self.assertFalse(result.complete)
        self.assertTrue(result.warnings)
        self.assertEqual(result.reconciliation.marked_not_found, 0)

    def test_small_drop_marks_not_found_but_never_sold(self):
        base = MyokoAkiyaBankAdapter().parse_html(HTML, DAY_ONE, complete=True).batch
        extra = replace(base.properties[0], source_property_id="extra", original_listing_url=INDEX_URL + "extra.pdf")
        state = reconcile(State(), replace(base, properties=base.properties + (extra,))).state
        client, _ = transport()
        result = crawl_live(state, client=client)
        self.assertTrue(result.complete)
        self.assertEqual(result.reconciliation.marked_not_found, 1)
        missing = next(p for p in result.reconciliation.state.properties if p.source_property_id == "extra")
        self.assertEqual(missing.listing_status, ListingStatus.NOT_FOUND)

    def test_cli_failed_live_run_preserves_state(self):
        state = reconcile(State(), MyokoAkiyaBankAdapter().parse_html(HTML, DAY_ONE, complete=True).batch).state
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            save_state(path, state)
            before = path.read_bytes()
            client, _ = transport(html="<html><body>Challenge required</body></html>")
            with patch("myoko_property_crawler.cli.HTMLClient", return_value=client), patch("sys.stderr", new=io.StringIO()):
                self.assertEqual(main(["crawl-live", "--state", str(path)]), 2)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(load_state(path), state)

    def test_cli_live_dry_run_creates_no_state_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "nested" / "state.json"
            client, _ = transport()
            with patch("myoko_property_crawler.cli.HTMLClient", return_value=client), patch("sys.stdout", new=io.StringIO()):
                self.assertEqual(main(["crawl-live", "--state", str(path), "--dry-run"]), 0)
            self.assertFalse(path.parent.exists())
