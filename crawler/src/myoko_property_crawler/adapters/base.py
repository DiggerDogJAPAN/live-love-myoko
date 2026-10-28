from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol, Tuple

from ..models import Property, utc_datetime


@dataclass(frozen=True)
class SourcePolicy:
    source_key: str
    website: str
    synthetic: bool
    robots_review_url: str = ""
    terms_review_url: str = ""
    reviewed_at: str = ""
    access_notes: str = ""
    live_access_approved: bool = False

    def require_fixture_mode(self) -> None:
        if not self.synthetic or self.live_access_approved:
            raise ValueError("Phase 1 permits only synthetic offline fixture sources")


@dataclass(frozen=True)
class CrawlBatch:
    source_key: str
    checked_at: datetime
    properties: Tuple[Property, ...]
    complete: bool = False

    def __post_init__(self) -> None:
        object.__setattr__(self, "checked_at", utc_datetime(self.checked_at))
        if any(p.source_key != self.source_key for p in self.properties):
            raise ValueError("Batch contains records from a different source")
        if any(p.last_checked_at != self.checked_at for p in self.properties):
            raise ValueError("Every record must have the batch check timestamp")


class FixtureAdapter(Protocol):
    policy: SourcePolicy

    def crawl(self, path: Path, checked_at: datetime, *, complete: bool = False) -> CrawlBatch:
        ...
