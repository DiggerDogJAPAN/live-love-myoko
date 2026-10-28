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
    'myoko_akiya_bank': Source('myoko_akiya_bank', 'Myoko Akiya Bank',
        'https://www.city.myoko.niigata.jp/myoko-life/house/', 'www.city.myoko.niigata.jp', '/fs/'),
    'shinano_akiya_bank': Source('shinano_akiya_bank', 'Shinano Town Akiya Bank',
        'https://shinanomachi-iju.jp/akiya/?property_type=used', 'shinanomachi-iju.jp', '/akiya/'),
}
