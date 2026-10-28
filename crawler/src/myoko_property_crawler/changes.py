"""Pure, transactional reconciliation: validate a whole batch before returning state."""

from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Dict, List, Tuple

from .adapters.base import CrawlBatch
from .models import AvailabilityStatus, ListingStatus, Property


class DuplicateConflict(ValueError):
    """The same source identity or URL describes conflicting records."""


@dataclass(frozen=True)
class PriceChange:
    source_key: str
    identity_token: str
    original_listing_url: str
    old_price_jpy: int
    new_price_jpy: int
    detected_at: datetime

    def to_dict(self) -> dict:
        return {"source_key": self.source_key, "identity_token": self.identity_token,
                "original_listing_url": self.original_listing_url, "old_price_jpy": self.old_price_jpy,
                "new_price_jpy": self.new_price_jpy, "detected_at": self.detected_at.isoformat()}


@dataclass(frozen=True)
class State:
    properties: Tuple[Property, ...] = ()
    price_changes: Tuple[PriceChange, ...] = ()
    source_checked_at: Dict[str, datetime] = field(default_factory=dict)


@dataclass(frozen=True)
class ReconcileResult:
    state: State
    discovered: int
    updated: int
    duplicates_ignored: int
    marked_not_found: int
    status_changes: int
    price_changes: Tuple[PriceChange, ...]

    def summary(self) -> dict:
        return {"discovered": self.discovered, "updated": self.updated,
                "duplicates_ignored": self.duplicates_ignored, "marked_not_found": self.marked_not_found,
                "status_changes": self.status_changes,
                "price_changes": [change.to_dict() for change in self.price_changes],
                "total_properties": len(self.state.properties)}


def _content(prop: Property) -> dict:
    values = prop.to_dict()
    values.pop("first_discovered_at")
    values.pop("last_checked_at")
    return values


def deduplicate(properties: Tuple[Property, ...]) -> Tuple[Dict[Tuple[str, str], Property], int]:
    unique: Dict[Tuple[str, str], Property] = {}
    urls: Dict[Tuple[str, str], Tuple[str, str]] = {}
    duplicates = 0
    for prop in properties:
        url_key = prop.source_key, prop.original_listing_url
        if url_key in urls and urls[url_key] != prop.identity:
            raise DuplicateConflict("One listing URL has conflicting source IDs")
        urls[url_key] = prop.identity
        if prop.identity in unique:
            if _content(unique[prop.identity]) != _content(prop):
                raise DuplicateConflict("Conflicting duplicate: " + repr(prop.identity))
            duplicates += 1
        else:
            unique[prop.identity] = prop
    return unique, duplicates


def reconcile(state: State, batch: CrawlBatch) -> ReconcileResult:
    existing, old_duplicates = deduplicate(state.properties)
    if old_duplicates:
        raise DuplicateConflict("Stored state contains duplicate records")
    previous_check = state.source_checked_at.get(batch.source_key)
    if previous_check and batch.checked_at < previous_check:
        raise ValueError("Cannot apply a crawl older than the source's last applied batch")
    incoming, duplicates = deduplicate(batch.properties)
    existing_urls = {(p.source_key, p.original_listing_url): p.identity for p in state.properties}
    for identity, prop in incoming.items():
        prior_identity = existing_urls.get((prop.source_key, prop.original_listing_url))
        if prior_identity is not None and prior_identity != identity:
            raise DuplicateConflict("Source identity changed for an existing URL; review and migrate it explicitly")
    prices: List[PriceChange] = []
    discovered = updated = missing = statuses = 0
    for identity, prop in incoming.items():
        old = existing.get(identity)
        if old is None:
            discovered += 1
            existing[identity] = prop.with_observation(batch.checked_at, batch.checked_at)
            continue
        if batch.checked_at < old.last_checked_at:
            raise ValueError("Cannot apply an older observation")
        observed = prop.with_observation(old.first_discovered_at, batch.checked_at)
        # Preserve translations only while their corresponding Japanese text is unchanged.
        observed = replace(observed,
                           title_en=prop.title_en or (old.title_en if prop.title_ja == old.title_ja else None),
                           description_en=prop.description_en or (
                               old.description_en if prop.description_ja == old.description_ja else None))
        if old.asking_price_jpy is not None and prop.asking_price_jpy is not None and old.asking_price_jpy != prop.asking_price_jpy:
            prices.append(PriceChange(prop.source_key, identity[1], prop.original_listing_url,
                                      old.asking_price_jpy, prop.asking_price_jpy, batch.checked_at))
        updated += _content(old) != _content(observed)
        statuses += old.listing_status != observed.listing_status
        existing[identity] = observed
    if batch.complete:
        for identity, prop in list(existing.items()):
            if prop.source_key == batch.source_key and identity not in incoming:
                if prop.last_checked_at > batch.checked_at:
                    raise ValueError("Cannot apply an older complete snapshot")
                # Absence is not evidence of a sale. Explicit sold/withdrawn states remain intact.
                if prop.listing_status in {ListingStatus.ACTIVE, ListingStatus.NOT_FOUND}:
                    if prop.listing_status == ListingStatus.ACTIVE:
                        missing += 1
                        statuses += 1
                    existing[identity] = replace(prop, listing_status=ListingStatus.NOT_FOUND,
                                                 availability_status=AvailabilityStatus.UNKNOWN,
                                                 last_checked_at=batch.checked_at)
    deduplicate(tuple(existing.values()))  # Also detect URL collisions after URL changes.
    watermarks = dict(state.source_checked_at)
    watermarks[batch.source_key] = batch.checked_at
    result_state = State(tuple(existing[key] for key in sorted(existing)),
                         state.price_changes + tuple(prices), watermarks)
    return ReconcileResult(result_state, discovered, updated, duplicates, missing, statuses, tuple(prices))
