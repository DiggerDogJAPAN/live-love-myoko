"""Myoko City sale-card extraction. PDF and image URLs are references only."""

from dataclasses import dataclass, field
from datetime import datetime
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from typing import Dict, Iterator, List, Optional, Tuple, Union
from urllib.parse import unquote, urljoin, urlsplit

from .base import CrawlBatch, SourcePolicy
from ..changes import DuplicateConflict, deduplicate
from ..models import AvailabilityStatus, ContentPermission, ListingStatus, Property, PropertyType, canonical_url
from ..locations import REGION_NAMES, english_location
from ..normalize import UNKNOWN, clean_text, parse_price_jpy


INDEX_URL = "https://www.city.myoko.niigata.jp/myoko-life/house/"
REGIONS = {"arai", "myokokougen", "myoko"}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
MAX_FIXTURE_BYTES = 1_000_000


@dataclass
class _Node:
    tag: str
    attrs: Dict[str, str] = field(default_factory=dict)
    children: List[Union["_Node", str]] = field(default_factory=list)

    def has_class(self, value: str) -> bool:
        return value in self.attrs.get("class", "").split()

    def walk(self) -> Iterator["_Node"]:
        yield self
        for child in self.children:
            if isinstance(child, _Node):
                yield from child.walk()

    def text(self) -> str:
        return clean_text("".join(child.text() if isinstance(child, _Node) else child for child in self.children))


class _TreeParser(HTMLParser):
    """Strict sale-component parser: unclosed/mismatched markup fails the batch."""
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = _Node("root")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = _Node(tag, {key: value or "" for key, value in attrs})
        self.stack[-1].children.append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)
        elif tag == "br":
            self.stack[-1].children.append(" ")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in VOID_TAGS:
            return
        if len(self.stack) == 1 or self.stack[-1].tag != tag:
            raise ValueError("Malformed fixture HTML: mismatched " + tag)
        self.stack.pop()

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def _local_text(directory: Path, relative_path: str) -> str:
    if not isinstance(relative_path, str) or not relative_path or Path(relative_path).is_absolute():
        raise ValueError("Fixture paths must be nonempty relative local paths")
    candidate = (directory / relative_path).resolve()
    if directory.resolve() not in candidate.parents:
        raise ValueError("Fixture path escapes its bundle directory")
    with candidate.open("rb") as handle:
        data = handle.read(MAX_FIXTURE_BYTES + 1)
    if len(data) > MAX_FIXTURE_BYTES:
        raise ValueError("Fixture exceeds size limit")
    return data.decode("utf-8")


def _city_url(value: str, *, pdf: bool = False) -> str:
    url = canonical_url(urljoin(INDEX_URL, value))
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.netloc != "www.city.myoko.niigata.jp":
        raise ValueError("Source reference must remain on the city's HTTPS host")
    if pdf and not parts.path.lower().endswith(".pdf"):
        raise ValueError("Expected a PDF listing detail URL")
    return url


def _optional(raw: str) -> Optional[str]:
    value = clean_text(raw)
    return None if value in UNKNOWN or value in {"記載なし", "別シートのとおり", "別紙参照"} else value


def _property_id(raw: str) -> str:
    match = re.fullmatch(r"(?:No\.?\s*|物件番号\s*)?(\d+)", clean_text(raw), re.IGNORECASE)
    if not match:
        raise ValueError("Unsupported property number: " + raw)
    return match[1]


def _status(raw: str) -> Tuple[ListingStatus, AvailabilityStatus]:
    value = clean_text(raw).lower()
    for badge in ("price reduced", "new", "新着", "値下げ"):
        value = value.replace(badge, "")
    value = " ".join(value.split())
    if value in {"", "募集中"}:
        return ListingStatus.ACTIVE, AvailabilityStatus.ACTIVE
    if value in {"商談中", "商談中 under negotiation", "under negotiation"}:
        return ListingStatus.ACTIVE, AvailabilityStatus.UNDER_NEGOTIATION
    if value in {"内覧受付終了", "内覧受付終了 viewing registration closed", "viewing registration closed",
                 "内覧受付一時中止", "内覧受付一時中止 applications temporarily closed", "applications temporarily closed"}:
        return ListingStatus.ACTIVE, AvailabilityStatus.VIEWINGS_CLOSED
    if value in {"成約", "成約済", "成約済み", "売却済", "売却済み"}:
        return ListingStatus.SOLD, AvailabilityStatus.SOLD
    if value in {"取下げ", "取り下げ", "登録取消", "登録取り消し", "掲載終了", "募集終了"}:
        return ListingStatus.WITHDRAWN, AvailabilityStatus.WITHDRAWN
    raise ValueError("Unrecognized listing status: " + raw)


@dataclass(frozen=True)
class FixtureInspection:
    batch: CrawlBatch
    observations: Tuple[dict, ...]


class MyokoAkiyaBankAdapter:
    policy = SourcePolicy(
        "myoko_akiya_bank", INDEX_URL, synthetic=False,
        robots_review_url="https://www.city.myoko.niigata.jp/robots.txt",
        terms_review_url="https://www.city.myoko.niigata.jp/site/about.html",
        reviewed_at="2026-10-27",
        access_notes="User confirmed permission in Phase 3. HTML sale cards only; check robots on every live run.",
        live_access_approved=True,
    )

    def crawl(self, path: Path, checked_at: datetime, *, complete: bool = False) -> CrawlBatch:
        return self.inspect_fixture(path, checked_at, complete=complete).batch

    def inspect_fixture(self, path: Path, checked_at: datetime, *, complete: bool = False) -> FixtureInspection:
        directory = path.resolve().parent
        text = _local_text(directory, path.name)
        expected = None
        if path.suffix.lower() == ".json":
            # Compatibility with Phase 2 manifests. No detail files are read.
            manifest = json.loads(text)
            if not isinstance(manifest, dict) or manifest.get("synthetic") is not True:
                raise ValueError("Expected a synthetic local fixture manifest")
            text = _local_text(directory, manifest.get("index"))
            if complete:
                if manifest.get("complete") is not True:
                    raise ValueError("Fixture is not declared complete")
                expected = manifest.get("expected_listing_ids")
                if not isinstance(expected, list) or not all(isinstance(i, str) for i in expected):
                    raise ValueError("Expected an independent fixture inventory")
        result = self.parse_html(text, checked_at, complete=complete)
        if expected is not None and (len(set(expected)) != len(expected) or
                                    set(expected) != {p.source_property_id for p in result.batch.properties}):
            raise ValueError("Fixture inventory does not match extracted listings")
        return result

    def parse_html(self, html: str, checked_at: datetime, *, complete: bool = False) -> FixtureInspection:
        if len(html.encode("utf-8")) > MAX_FIXTURE_BYTES:
            raise ValueError("HTML exceeds size limit")
        start = re.search(r"<h2\b[^>]*>\s*売り物件情報\s*</h2\s*>", html, re.IGNORECASE)
        if start is None:
            raise ValueError("No sale inventory heading; refusing an empty/error page")
        end = re.search(r'''<h2\b[^>]*\bid=["']kashi["'][^>]*>''', html[start.end():], re.IGNORECASE)
        if complete and (end is None or not re.search(r"</body\s*>\s*</html\s*>\s*$", html, re.IGNORECASE)):
            raise ValueError("Truncated HTML or missing rental boundary prevents completeness")
        stop = start.end() + end.start() if end else len(html)
        # Limit strict parsing to the sale component, avoiding unrelated CMS markup.
        parser = _TreeParser()
        parser.feed(html[start.start():stop])
        parser.close()
        if len(parser.stack) != 1:
            raise ValueError("Truncated sale inventory HTML")
        nodes = list(parser.root.walk())
        if complete and re.search(r'''\brel=["'][^"']*\bnext\b|\bclass=["'][^"']*(?:pagination|pager)''', html, re.IGNORECASE):
            raise ValueError("Pagination prevents a confirmed complete snapshot")
        properties, observations, seen_regions, seen_groups = [], [], [], []
        region = None
        for node in nodes:
            if node.tag == "h3":
                region = node.attrs.get("id") if node.attrs.get("id") in REGIONS else None
                if region:
                    seen_regions.append(region)
            if not node.has_class("bukken-list"):
                continue
            if region is None:
                raise ValueError("Listing group has no recognized sale region")
            seen_groups.append(region)
            items = [n for n in node.children if isinstance(n, _Node) and n.has_class("item")]
            for child in node.children:
                if isinstance(child, str):
                    if child.strip():
                        raise ValueError("Unexpected text outside listing cards")
                elif not child.has_class("item") and (child.text() or any(n.tag in {"table", "a", "img"} for n in child.walk())):
                    raise ValueError("Unrecognized listing wrapper; refusing to skip possible cards")
            if len(items) != sum(n.has_class("item") for n in node.walk()):
                raise ValueError("Unexpected nested listing cards")
            # Do not silently miss a card if its wrapper class changes.
            if sum(n.has_class("info") for n in node.walk()) != 2 * len(items):
                raise ValueError("Unrecognized or incomplete listing card structure")
            for item in items:
                prop, observation = self._extract(item, region, checked_at)
                properties.append(prop)
                observations.append(observation)
        if not seen_regions:
            raise ValueError("No recognized sale sections")
        deduplicate(tuple(properties))
        evidence = {}
        for observation in observations:
            key = observation["source_property_id"]
            if key in evidence and evidence[key] != observation:
                raise DuplicateConflict("Duplicate listings have conflicting source evidence")
            evidence[key] = observation
        if complete:
            if set(seen_regions) != REGIONS or len(seen_regions) != 3 or set(seen_groups) != REGIONS or len(seen_groups) != 3:
                raise ValueError("Completeness requires all three sale regions and listing groups exactly once")
            if not properties:
                raise ValueError("Empty inventory requires verification; refusing to infer mass removal")
        return FixtureInspection(CrawlBatch(self.policy.source_key, checked_at, tuple(properties), complete), tuple(observations))

    def _extract(self, item: _Node, region: str, checked_at: datetime) -> Tuple[Property, dict]:
        nodes = list(item.walk())
        rows = [n for n in nodes if n.tag == "tr" and n.has_class("info")]
        if len(rows) != 2:
            raise ValueError("Listing requires both identity/price and status rows")
        cells = [n for n in rows[0].children if isinstance(n, _Node) and n.tag == "td"]
        if len(cells) != 3 or not cells[1].has_class("address") or not cells[2].has_class("price"):
            raise ValueError("Unexpected listing header structure")
        source_id = _property_id(cells[0].text())
        area = _optional(cells[1].text())
        area_en = english_location(area)
        status_text = rows[1].text()
        status, availability = _status(status_text)
        japanese_status = status_text
        for english in ("Under negotiation", "Viewing Registration Closed", "Price Reduced", "NEW", "Applications Temporarily Closed"):
            japanese_status = re.sub(re.escape(english), "", japanese_status, flags=re.IGNORECASE)
        japanese_status = clean_text(japanese_status) or None
        pdf_cells = [n for n in nodes if n.tag == "td" and n.has_class("pdf")]
        urls = {_city_url(n.attrs["href"], pdf=True) for cell in pdf_cells for n in cell.walk()
                if n.tag == "a" and n.attrs.get("href") and urlsplit(n.attrs["href"]).path.lower().endswith(".pdf")}
        if len(urls) > 1:
            # The live No.354 card has a stray link for another listing. Resolve
            # only when exactly one filename explicitly matches this card's ID.
            matching = {url for url in urls if re.match(re.escape(source_id) + r"(?:\D|$)",
                                                       unquote(urlsplit(url).path.rsplit("/", 1)[-1]))}
            if len(matching) == 1:
                urls = matching
        if len(urls) != 1:
            raise ValueError("Listing " + source_id + " requires one unambiguous PDF reference")
        images = [_city_url(n.attrs["src"]) for cell in nodes if cell.tag == "td" and cell.has_class("pic")
                  for n in cell.walk() if n.tag == "img" and n.attrs.get("src")]
        region_ja, region_en = REGION_NAMES[region]
        prop = Property(
            source_key="myoko_akiya_bank", source_agency_name="Myoko Akiya Bank", source_website=INDEX_URL,
            source_property_id=source_id, original_listing_url=next(iter(urls)),
            title_ja=area or "妙高市の売り物件", title_en="Property in " + area_en if area_en else None,
            description_ja=None, asking_price_jpy=parse_price_jpy(cells[2].text()),
            municipality="Myoko", area=area, area_en=area_en, region_ja=region_ja, region_en=region_en,
            unmapped_locations=(area,) if area and not area_en else (), address=None,
            land_area_sqm=None, building_area_sqm=None, construction_date=None, building_age_years=None,
            floor_plan=None, parking=None, property_type=PropertyType.UNKNOWN,
            main_image_url=images[0] if images else None, image_permission=ContentPermission.PERMITTED,
            content_rights_basis="User confirmed project property information use and expressly authorized display of Myoko Akiya Bank photographs on 2026-10-28. Source URLs only; no copying or rehosting.",
            first_discovered_at=checked_at, last_checked_at=checked_at, listing_status=status,
            availability_status=availability, source_status_ja=japanese_status,
        )
        return prop, {"source_property_id": source_id, "sale_region": region, "raw_status": status_text or None,
                      "availability": availability.value, "unmapped_locations": list(prop.unmapped_locations)}
