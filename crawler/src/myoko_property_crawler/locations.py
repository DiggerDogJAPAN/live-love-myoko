"""Reviewed exact place-name mappings. Add names here after review, never guess."""

from dataclasses import replace
from typing import Optional
from .normalize import clean_text

# Readings verified against Myoko City docs/801.html and Japan Post's
# city=1152170 directory on 2026-10-28. ASCII Hepburn; no guessed kanji readings.
SHINANO_LOCATIONS = {
    '野尻': 'Nojiri', '柏原': 'Kashiwabara', '古間': 'Furuma',
    '古海': 'Furumi', '富濃': 'Tomino', '穂波': 'Honami',
    # Town source area slug fujisato; town English guide docs/209.html names Kurohime.
    '富士里': 'Fujisato', '黒姫': 'Kurohime',
}
SHINANO_REGIONS = {**SHINANO_LOCATIONS, '別荘地': 'Villa area'}

LOCATION_DICTIONARY_VERSION = '2026-10-28'

LOCATION_NAMES = {
    "妙高高原": "Myoko Kogen",
    "新井": "Arai",
    "妙高": "Myoko",
    "赤倉": "Akakura",
    "関山": "Sekiyama",
    "田口": "Taguchi",
    "石塚町": "Ishizukacho",
    "経塚町": "Kyozukacho",
    "白山町": "Hakusancho",
    "小出雲": "Oizumo",
    "美守": "Hidanomori",
    "栗原": "Kurihara",
    "学校町": "Gakkocho",
    "上馬場": "Kamibaba",
    "籠町": "Kagomachi",
    "関川": "Sekigawa",
    "朝日町": "Asahicho",
    "杉野沢": "Suginosawa",
    "中央町": "Chuocho",
    "雪森": "Yukimori",
    "月岡": "Tsukioka",
}

REGION_NAMES = {
    "arai": ("新井", "Arai"),
    "myokokougen": ("妙高高原", "Myoko Kogen"),
    "myoko": ("妙高", "Myoko"),
}


def english_location(japanese: Optional[str]) -> Optional[str]:
    return LOCATION_NAMES.get(clean_text(japanese)) if japanese else None


LOCATION_DISPLAY_FIELDS = ('area_en', 'title_en', 'unmapped_locations')


def reviewed_location(prop):
    """Refresh derived display metadata without changing any source observation."""
    if prop.source_key != 'myoko_akiya_bank' or prop.municipality != 'Myoko':
        return prop
    return replace(prop, **location_display_values(prop.area, prop.unmapped_locations))


def location_display_values(japanese, unmapped=()):
    """Shared by card normalization, archived-state sync and database backfill."""
    english = english_location(japanese)
    pending = [name for name in unmapped if clean_text(name) != clean_text(japanese or '')]
    if japanese and english is None:
        pending.append(japanese)
    return {'area_en':english, 'title_en':'Property in '+english if english else None,
            'unmapped_locations':tuple(dict.fromkeys(pending))}
