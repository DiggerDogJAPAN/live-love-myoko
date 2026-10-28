"""Conservative Japanese numeric normalization; ambiguous values fail closed."""

from decimal import Decimal
import re
import unicodedata
from typing import Optional


UNKNOWN = {"", "-", "―", "不明", "未定", "相談", "価格応相談", "応相談"}

# One configured vocabulary shared by normalization and the Property model.
MUNICIPALITY_ALIASES = {
    "妙高市": "Myoko", "Myoko": "Myoko",
    "上越市": "Joetsu", "Joetsu": "Joetsu",
    "信濃町": "Shinano Town", "Shinano Town": "Shinano Town",
    "飯綱町": "Iizuna Town", "Iizuna Town": "Iizuna Town",
}
SUPPORTED_MUNICIPALITIES = frozenset(MUNICIPALITY_ALIASES.values())


def clean_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).split())


def parse_price_jpy(raw: str) -> Optional[int]:
    value = clean_text(raw).replace(",", "").replace(" ", "")
    if value in UNKNOWN:
        return None
    match = re.fullmatch(r"(?:(\d+(?:\.\d+)?)億)?(?:(\d+(?:\.\d+)?)万)?(?:(\d+(?:\.\d+)?))?円?", value)
    if not match or not any(match.groups()):
        raise ValueError("Unsupported price: " + raw)
    oku, man, yen = (Decimal(v or "0") for v in match.groups())
    total = oku * 100_000_000 + man * 10_000 + yen
    if total != total.to_integral_value():
        raise ValueError("Price must be a whole number of yen")
    return int(total)


def parse_area_sqm(raw: str) -> Optional[Decimal]:
    value = clean_text(raw).replace(",", "").replace(" ", "")
    if value in UNKNOWN:
        return None
    match = re.fullmatch(r"(\d+(?:\.\d+)?)(?:m2|m²|㎡|平米)", value, re.IGNORECASE)
    if not match or Decimal(match[1]) <= 0:
        raise ValueError("Unsupported square-metre area: " + raw)
    return Decimal(match[1])


def normalize_municipality(raw: str) -> Optional[str]:
    value = clean_text(raw)
    if value in UNKNOWN:
        return None
    if value not in MUNICIPALITY_ALIASES:
        raise ValueError("Outside configured municipalities: " + raw)
    return MUNICIPALITY_ALIASES[value]
