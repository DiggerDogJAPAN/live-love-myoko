"""Normalized records shared by adapters, storage and future integrations."""

from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
import re
from typing import Any, Dict, Optional, Tuple
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .normalize import SUPPORTED_MUNICIPALITIES


class ListingStatus(str, Enum):
    ACTIVE = "active"
    NOT_FOUND = "not_found"
    WITHDRAWN = "withdrawn"
    SOLD = "sold"


class PropertyType(str, Enum):
    HOUSE = "house"
    LAND = "land"
    APARTMENT = "apartment"
    COMMERCIAL = "commercial"
    OTHER = "other"
    UNKNOWN = "unknown"
    LODGE = "lodge"


class AvailabilityStatus(str, Enum):
    UNKNOWN = "unknown"
    ACTIVE = "active"
    UNDER_NEGOTIATION = "under_negotiation"
    VIEWINGS_CLOSED = "viewings_closed"
    SOLD = "sold"
    WITHDRAWN = "withdrawn"


class ContentPermission(str, Enum):
    UNKNOWN = "unknown"
    PERMITTED = "permitted"
    SYNTHETIC = "synthetic"


def canonical_url(value: str) -> str:
    """Drop fragments and known tracking parameters; preserve listing parameters."""
    parts = urlsplit(value.strip())
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        raise ValueError("Expected an absolute HTTP(S) URL")
    if parts.username or parts.password:
        raise ValueError("URLs must not contain credentials")
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}]
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path or "/", urlencode(query), ""))


def utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Timestamps must include a timezone")
    return value.astimezone(timezone.utc)


@dataclass(frozen=True)
class Property:
    source_key: str
    source_agency_name: str
    source_website: str
    original_listing_url: str
    source_property_id: Optional[str]
    title_ja: str
    description_ja: Optional[str]
    asking_price_jpy: Optional[int]
    address: Optional[str]
    municipality: Optional[str]
    area: Optional[str]
    land_area_sqm: Optional[Decimal]
    building_area_sqm: Optional[Decimal]
    construction_date: Optional[str]
    building_age_years: Optional[int]
    floor_plan: Optional[str]
    property_type: PropertyType
    parking: Optional[str]
    first_discovered_at: datetime
    last_checked_at: datetime
    listing_status: ListingStatus = ListingStatus.ACTIVE
    title_en: Optional[str] = None
    description_en: Optional[str] = None
    main_image_url: Optional[str] = None
    description_permission: ContentPermission = ContentPermission.UNKNOWN
    image_permission: ContentPermission = ContentPermission.UNKNOWN
    content_rights_basis: Optional[str] = None
    area_en: Optional[str] = None
    region_ja: Optional[str] = None
    region_en: Optional[str] = None
    unmapped_locations: Tuple[str, ...] = ()
    availability_status: AvailabilityStatus = AvailabilityStatus.UNKNOWN
    source_status_ja: Optional[str] = None
    transaction_type: Optional[str] = None
    construction_details: Optional[str] = None
    source_facts: Optional[Dict[str, str]] = None

    purchase_conditions_ja: Optional[str] = None

    def __post_init__(self) -> None:
        if self.source_facts is not None and (not isinstance(self.source_facts, dict) or any(not isinstance(k,str) or not isinstance(v,str) for k,v in self.source_facts.items())):
            raise ValueError("Source facts must be a string-to-string mapping")
        if self.transaction_type not in {None, "sale", "rent"}:
            raise ValueError("Unknown transaction classification")
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", self.source_key):
            raise ValueError("source_key must be a stable lowercase slug")
        if not self.source_agency_name.strip() or not self.title_ja.strip():
            raise ValueError("Agency name and Japanese title are required")
        if self.municipality is not None and self.municipality not in SUPPORTED_MUNICIPALITIES:
            raise ValueError("Municipality must be Myoko, Joetsu, Shinano Town or Iizuna Town")
        if self.source_property_id is not None:
            if not isinstance(self.source_property_id, str) or not self.source_property_id.strip():
                raise ValueError("Source property IDs must be nonempty strings")
            object.__setattr__(self, "source_property_id", self.source_property_id.strip())
        for field in ("source_website", "original_listing_url"):
            object.__setattr__(self, field, canonical_url(getattr(self, field)))
        if self.main_image_url is not None:
            object.__setattr__(self, "main_image_url", canonical_url(self.main_image_url))
        for field in ("asking_price_jpy", "building_age_years"):
            value = getattr(self, field)
            if value is not None and (type(value) is not int or value < 0):
                raise ValueError(field + " must be a nonnegative integer or null")
        for field in ("land_area_sqm", "building_area_sqm"):
            value = getattr(self, field)
            if value is not None and (not isinstance(value, Decimal) or not value.is_finite() or value <= 0):
                raise ValueError(field + " must be a positive finite Decimal or null")
        object.__setattr__(self, "unmapped_locations", tuple(self.unmapped_locations))
        for field, enum in (("property_type", PropertyType), ("listing_status", ListingStatus),
                            ("availability_status", AvailabilityStatus),
                            ("description_permission", ContentPermission), ("image_permission", ContentPermission)):
            object.__setattr__(self, field, enum(getattr(self, field)))
        for field in ("first_discovered_at", "last_checked_at"):
            object.__setattr__(self, field, utc_datetime(getattr(self, field)))
        if self.first_discovered_at > self.last_checked_at:
            raise ValueError("First discovery must precede the last check")
        if self.construction_date is not None:
            parts = self.construction_date.split("-")
            if not re.fullmatch(r"\d{4}(?:-\d{2}(?:-\d{2})?)?", self.construction_date):
                raise ValueError("Construction date must be YYYY, YYYY-MM or YYYY-MM-DD")
            datetime(int(parts[0]), int(parts[1]) if len(parts) > 1 else 1,
                     int(parts[2]) if len(parts) > 2 else 1)
        if (self.description_ja or self.description_en) and self.description_permission == ContentPermission.UNKNOWN:
            raise ValueError("Descriptions require a reviewed permission basis")
        if self.main_image_url and self.image_permission == ContentPermission.UNKNOWN:
            raise ValueError("Image URLs require a reviewed permission basis")
        if (self.description_ja or self.description_en or self.main_image_url) and (
                not self.content_rights_basis or not self.content_rights_basis.strip()):
            raise ValueError("Content usage requires a recorded rights basis")

    @property
    def identity(self) -> Tuple[str, str]:
        token = "id:" + self.source_property_id if self.source_property_id else "url:" + self.original_listing_url
        return self.source_key, token

    def to_dict(self) -> Dict[str, Any]:
        result = asdict(self)
        for key, value in result.items():
            if isinstance(value, Enum):
                result[key] = value.value
            elif isinstance(value, Decimal):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Property":
        values = dict(data)
        for key in ("land_area_sqm", "building_area_sqm"):
            if values[key] is not None:
                values[key] = Decimal(values[key])
        for key in ("first_discovered_at", "last_checked_at"):
            values[key] = datetime.fromisoformat(values[key])
        return cls(**values)

    def with_observation(self, first_discovered_at: datetime, checked_at: datetime) -> "Property":
        return replace(self, first_discovered_at=first_discovered_at, last_checked_at=checked_at)
