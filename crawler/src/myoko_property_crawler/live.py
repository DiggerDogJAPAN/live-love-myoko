"""Bounded HTTP transport: only robots.txt and the one HTML index may be fetched."""

from dataclasses import dataclass, replace
from datetime import datetime, timezone
import time
import math
from typing import Optional
from urllib.request import build_opener, HTTPRedirectHandler, Request
from urllib.robotparser import RobotFileParser

from .adapters.myoko_akiya_bank import INDEX_URL, MyokoAkiyaBankAdapter
from .changes import State, reconcile, ReconcileResult
from .models import ListingStatus

ROBOTS_URL = "https://www.city.myoko.niigata.jp/robots.txt"
USER_AGENT = "MyokoPropertyCrawler/0.3 (HTML-only property index)"


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Unexpected redirect; crawl stopped without following it")


class HTMLClient:
    def __init__(self, *, timeout: float = 20, user_agent: str = USER_AGENT, opener=None):
        if not math.isfinite(timeout) or timeout <= 0 or timeout > 60:
            raise ValueError("Timeout must be between 0 and 60 seconds")
        if not user_agent.strip() or "\n" in user_agent or "\r" in user_agent:
            raise ValueError("Invalid user agent")
        self.timeout = timeout
        self.user_agent = user_agent
        self.opener = opener if opener is not None else build_opener(_NoRedirect())

    def _read(self, url: str, limit: int, content_type: str) -> str:
        if url not in {INDEX_URL, ROBOTS_URL}:
            raise ValueError("Transport permits only robots.txt and the HTML index")
        request = Request(url, headers={"User-Agent": self.user_agent, "Accept": content_type,
                                        "Accept-Encoding": "identity"})
        with self.opener.open(request, timeout=self.timeout) as response:
            if response.status != 200 or response.geturl() != url:
                raise ValueError("Unexpected HTTP response; no snapshot applied")
            if response.headers.get_content_type() != content_type:
                raise ValueError("Unexpected response content type")
            if response.headers.get("Content-Encoding", "identity").lower() != "identity":
                raise ValueError("Unexpected compressed response")
            data = response.read(limit + 1)
            if len(data) > limit:
                raise ValueError("Response exceeds size limit")
            length = response.headers.get("Content-Length")
            if length is not None and int(length) != len(data):
                raise ValueError("Incomplete HTTP response body")
            return data.decode(response.headers.get_content_charset() or "utf-8")

    def fetch_index(self) -> str:
        robots_text = self._read(ROBOTS_URL, 65536, "text/plain")
        if not any(line.strip().lower().startswith("user-agent:") for line in robots_text.splitlines()):
            raise ValueError("Robots response has no user-agent rules; review required")
        rules = RobotFileParser()
        rules.parse(robots_text.splitlines())
        if not rules.can_fetch(self.user_agent, INDEX_URL):
            raise ValueError("Robots disallows this crawler; index not fetched")
        delay = rules.crawl_delay(self.user_agent) or 0
        rate = rules.request_rate(self.user_agent)
        if rate:
            delay = max(delay, rate.seconds / rate.requests)
        if delay > 60:
            raise ValueError("Robots request interval exceeds this bounded run; stopping")
        if delay:
            time.sleep(delay)
        return self._read(INDEX_URL, 1_000_000, "text/html")


@dataclass(frozen=True)
class LiveResult:
    reconciliation: ReconcileResult
    complete: bool
    warnings: tuple


def crawl_live(state: State, *, client: Optional[HTMLClient] = None) -> LiveResult:
    html = (client if client is not None else HTMLClient()).fetch_index()
    batch = MyokoAkiyaBankAdapter().parse_html(html, datetime.now(timezone.utc), complete=True).batch
    warnings = []
    previous = {p.source_property_id for p in state.properties
                if p.source_key == batch.source_key and p.listing_status == ListingStatus.ACTIVE}
    current = {p.source_property_id for p in batch.properties}
    # A structurally valid but unexpectedly depleted index is not proof of mass removal.
    if previous and len(previous - current) / len(previous) > 0.25:
        warnings.append("More than 25% of prior listings are absent; treated as partial, with no absence changes. Review the source.")
        batch = replace(batch, complete=False)
    return LiveResult(reconcile(state, batch), batch.complete, tuple(warnings))
