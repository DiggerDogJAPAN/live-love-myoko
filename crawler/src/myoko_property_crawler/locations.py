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


# Joetsu Akiya Bank's published numbered district links, reviewed 2026-10-28.
# 北諏訪's misspelled URL slug is corrected using the city's Kitasuwa reference.
JOETSU_AREAS = {
    '1': ('安塚区', 'Yasuzuka'), '2': ('浦川原区', 'Uragawara'),
    '3': ('大島区', 'Oshima'), '4': ('牧区', 'Maki'),
    '5': ('柿崎区', 'Kakizaki'), '6': ('大潟区', 'Ogata'),
    '7': ('頸城区', 'Kubiki'), '8': ('吉川区', 'Yoshikawa'),
    '9': ('中郷区', 'Nakago'), '10': ('板倉区', 'Itakura'),
    '11': ('清里区', 'Kiyosato'), '12': ('三和区', 'Sanwa'),
    '13': ('名立区', 'Nadachi'), '14': ('高田区', 'Takada'),
    '15': ('新道区', 'Shindo'), '16': ('金谷区', 'Kanaya'),
    '17': ('春日区', 'Kasuga'), '18': ('諏訪区', 'Suwa'),
    '19': ('津有区', 'Tsuari'), '20': ('三郷区', 'Sango'),
    '21': ('和田区', 'Wada'), '22': ('高士区', 'Kodo'),
    '23': ('直江津区', 'Naoetsu'), '24': ('有田区', 'Arita'),
    '25': ('八千浦区', 'Yachiho'), '26': ('保倉区', 'Hokura'),
    '27': ('北諏訪区', 'Kitasuwa'), '28': ('谷浜・桑取区', 'Tanihama / Kuwadori'),
}


# Town statistical place-name readings (h28tokeishiryo.pdf), plus official area slugs.
IIZUNA_LOCATIONS = {
    '平出':'Hiraide','豊野':'Toyono','牟礼':'Mure','小玉':'Kodama','黒川':'Kurokawa',
    '袖之山':'Sodenoyama','地蔵久保':'Jizokubo','坂口':'Sakaguchi','高坂':'Kosaka',
    '川上':'Kawakami','柳里':'Yanagisato','古町':'Furumachi','普光寺':'Fukoji',
    '芋川':'Imogawa','倉井':'Kurai','川谷':'Kawatani','赤塩':'Akashio','東柏原':'Higashikashiwabara',
}
