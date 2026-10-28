"""Central eligibility and display allowlist for approved property sources."""

import re
from typing import Iterable
from .models import AvailabilityStatus, ListingStatus, ContentPermission, Property, PropertyType
from .locations import reviewed_location
from .normalize import clean_text
from .joetsu_images import public_photo
from .iizuna_images import public_photo as iizuna_photo


def is_customer_eligible(prop: Property) -> bool:
    """Only confirmed active cards with known unrestricted labels may be public.

    Unknown labels fail closed even if normalized statuses incorrectly say active.
    Empty labels represent ordinary published cards; NEW/price badges do not
    restrict enquiries. Unmapped place names are unrelated to availability.
    """
    if (prop.source_key not in {"myoko_akiya_bank", "shinano_akiya_bank", "joetsu_akiya_bank", "iizuna_akiya_bank"} or prop.listing_status != ListingStatus.ACTIVE
            or prop.availability_status != AvailabilityStatus.ACTIVE):
        return False
    if prop.source_key in {'shinano_akiya_bank', 'joetsu_akiya_bank', 'iizuna_akiya_bank'} and (prop.transaction_type != 'sale' or prop.property_type not in {PropertyType.HOUSE,PropertyType.APARTMENT,PropertyType.LODGE,PropertyType.COMMERCIAL}):
        return False
    if prop.source_key == 'iizuna_akiya_bank' and prop.property_type != PropertyType.HOUSE:
        return False
    if prop.source_key == 'joetsu_akiya_bank' and prop.source_property_id == '5-34':
        return False
    label = prop.source_status_ja
    if label is None:
        return True
    if not isinstance(label, str):
        return False
    return re.fullmatch(r"(?:(?:募集中|値下げ|新着|NEW|Price Reduced)\s*)*",
                        clean_text(label), re.IGNORECASE) is not None


def customer_properties(properties: Iterable[Property]) -> list:
    """Filter in the same module as projection so callers share one policy."""
    return [customer_property(prop) for prop in properties if is_customer_eligible(prop)]


def customer_property(prop: Property) -> dict:
    if prop.source_key not in {"myoko_akiya_bank", "shinano_akiya_bank", "joetsu_akiya_bank", "iizuna_akiya_bank"}:
        raise ValueError("Unknown customer property source")
    if not is_customer_eligible(prop):
        raise ValueError("Property is not eligible for the customer feed")
    prop = reviewed_location(prop)
    attribution = 'Rakuen Shinshu Akiya Bank (Iizuna)' if prop.source_key == 'iizuna_akiya_bank' and prop.original_listing_url.startswith('https://rakuen-akiya.jp/') else prop.source_agency_name
    return {
        "title": "Property in " + (prop.area_en or prop.area or prop.region_en or "Myoko"),
        "asking_price_jpy": prop.asking_price_jpy,
        "municipality": prop.municipality, "property_type": prop.property_type.value,
        "transaction_type": prop.transaction_type,
        "location_ja": prop.area, "location_en": prop.area_en,
        "location_display": prop.area_en or prop.area,
        "region_ja": prop.region_ja, "region_en": prop.region_en,
        "location_needs_review": bool(prop.unmapped_locations),
        "thumbnail_url": iizuna_photo(prop) if prop.source_key == 'iizuna_akiya_bank' else public_photo(prop) if prop.source_key == 'joetsu_akiya_bank' else prop.main_image_url if prop.image_permission == ContentPermission.PERMITTED else None,
        "original_pdf_url": prop.original_listing_url,
        "publication_status": prop.listing_status.value,
        "availability_status": prop.availability_status.value,
        "status": "Active",
        "source_status_ja": prop.source_status_ja,
        "source_attribution": "Source: " + attribution,
        "last_checked_at": prop.last_checked_at.isoformat(),
        "purchase_conditions_ja": prop.purchase_conditions_ja,
    }
