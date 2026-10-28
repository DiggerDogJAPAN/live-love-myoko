"""Small reviewed source registry; identifiers and permissions stay source-scoped."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Source:
    key: str
    agency: str
    website: str
    host: str
    listing_prefix: str

SOURCES = {
    'joetsu_akiya_bank': Source('joetsu_akiya_bank', 'Joetsu City Akiya Bank',
        'https://joetsu-akiyabank.jp/archives/bukken_type/baibai/', 'joetsu-akiyabank.jp', '/archives/realestate/'),
    'myoko_akiya_bank': Source('myoko_akiya_bank', 'Myoko Akiya Bank',
        'https://www.city.myoko.niigata.jp/myoko-life/house/', 'www.city.myoko.niigata.jp', '/fs/'),
    'shinano_akiya_bank': Source('shinano_akiya_bank', 'Shinano Town Akiya Bank',
        'https://shinanomachi-iju.jp/akiya/?property_type=used', 'shinanomachi-iju.jp', '/akiya/'),
}


def valid_property_number(source_key, value):
    """Preserve published string IDs, including Joetsu's significant zero padding."""
    import re
    pattern = r'(?:[1-9]|1[0-9]|2[0-8])-[0-9]+' if source_key == 'joetsu_akiya_bank' else r'[0-9]+'
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None
