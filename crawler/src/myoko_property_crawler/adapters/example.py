"""Parser for invented HTML, not an adapter for a real agency website."""

from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, List, Optional

from .base import CrawlBatch, SourcePolicy
from ..models import ContentPermission, Property, PropertyType
from ..normalize import clean_text, normalize_municipality, parse_area_sqm, parse_price_jpy


class _FixtureParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.cards: List[Dict[str, str]] = []
        self.card: Optional[Dict[str, str]] = None
        self.field: Optional[str] = None
        self.depth = 0
        self.field_depth = 0
        self.complete = False

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "meta" and values.get("name") == "fixture-complete":
            self.complete = values.get("content") == "true"
        if tag == "article" and "data-listing" in values:
            if self.card is not None:
                raise ValueError("Nested listing cards")
            self.card = {"id": values.get("data-id", ""), "url": values.get("data-url", "")}
            self.depth = 1
            return
        if self.card is not None:
            if tag in {"br", "img", "meta", "hr", "input", "link"}:
                return
            self.depth += 1
            if "data-field" in values:
                if self.field is not None or values["data-field"] in self.card:
                    raise ValueError("Nested or repeated data-field")
                self.field = values["data-field"]
                self.field_depth = self.depth
                self.card[self.field] = ""

    def handle_data(self, data):
        if self.card is not None and self.field:
            self.card[self.field] += data

    def handle_endtag(self, tag):
        if self.card is None:
            return
        if self.field and self.depth == self.field_depth:
            self.field = None
        self.depth -= 1
        if self.depth == 0:
            if tag != "article":
                raise ValueError("Malformed listing card")
            self.cards.append(self.card)
            self.card = None


class ExampleFixtureAdapter:
    policy = SourcePolicy("example", "https://example.invalid", synthetic=True,
                          access_notes="Invented fixtures authored for this project; no requests made.")

    def crawl(self, path: Path, checked_at: datetime, *, complete: bool = False) -> CrawlBatch:
        self.policy.require_fixture_mode()
        parser = _FixtureParser()
        parser.feed(path.read_text(encoding="utf-8"))
        parser.close()
        if parser.card is not None:
            raise ValueError("Truncated fixture: unclosed listing")
        if complete and not parser.complete:
            raise ValueError("Cannot mark an unconfirmed fixture snapshot complete")
        properties = tuple(self._extract(card, checked_at) for card in parser.cards)
        return CrawlBatch(self.policy.source_key, checked_at, properties, complete=complete)

    def _extract(self, card: Dict[str, str], checked_at: datetime) -> Property:
        def field(name: str) -> Optional[str]:
            return clean_text(card.get(name, "")) or None

        if not field("title") or not card["url"]:
            raise ValueError("Listing requires title and URL")
        from urllib.parse import urlsplit
        if urlsplit(card["url"]).hostname != "example.invalid":
            raise ValueError("Synthetic fixtures must use example.invalid URLs")
        return Property(
            source_key=self.policy.source_key, source_agency_name="Example Myoko Agency (fictional)",
            source_website=self.policy.website, original_listing_url=card["url"],
            source_property_id=field("id"), title_ja=field("title"), description_ja=field("description"),
            asking_price_jpy=parse_price_jpy(field("price") or ""), address=field("address"),
            municipality=normalize_municipality(field("municipality") or ""), area=field("area"),
            land_area_sqm=parse_area_sqm(field("land_area") or ""),
            building_area_sqm=parse_area_sqm(field("building_area") or ""),
            construction_date=field("construction_date"), building_age_years=None,
            floor_plan=field("floor_plan"), property_type=PropertyType(field("property_type") or "unknown"),
            parking=field("parking"), first_discovered_at=checked_at, last_checked_at=checked_at,
            description_permission=ContentPermission.SYNTHETIC,
            image_permission=ContentPermission.UNKNOWN,
            content_rights_basis="Original synthetic fixture text authored for Phase 1 tests.",
        )
