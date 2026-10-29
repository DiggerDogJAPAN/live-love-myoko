"""Small reviewed source registry; identifiers and permissions stay source-scoped."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Source:
    key: str
    agency: str
    website: str
    host: str
    listing_prefix: str
    additional_origins: tuple = ()

SOURCES = {
    'suumo': Source('suumo','SUUMO','https://suumo.jp/','suumo.jp','/chukoikkodate/',(('suumo.jp','/ikkodate/'),)),
    'rakusumu': Source('rakusumu','Rakusumu','https://www.rakusumu.com/','www.rakusumu.com','/sale/detail/'),
    'iizuna_akiya_bank': Source('iizuna_akiya_bank', 'Iizuna Town Akiya Bank',
        'https://www.town.iizuna.nagano.jp/ijuportal/live/sale/search/', 'www.town.iizuna.nagano.jp', '/ijuportal/live/sale/',
        (('rakuen-akiya.jp','/bukken/'),)),
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
    if source_key in {'suumo','rakusumu'}:
        pattern=r'[0-9]{8}' if source_key=='suumo' else r'[0-9]{5}-[0-9]{6}'
        return isinstance(value,str) and re.fullmatch(pattern,value) is not None
    if source_key == 'iizuna_akiya_bank':
        return isinstance(value,str) and re.fullmatch(r'(?:reg-[0-9]{3,}|rakuen-[0-9]+)',value) is not None
    pattern = r'(?:[1-9]|1[0-9]|2[0-8])-[0-9]+' if source_key == 'joetsu_akiya_bank' else r'[0-9]+'
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def allowed_listing_origin(profile,url):
    from urllib.parse import urlsplit
    u=urlsplit(url)
    return u.scheme=='https' and u.netloc==u.hostname and any(u.hostname==host and u.path.startswith(prefix) for host,prefix in ((profile.host,profile.listing_prefix),)+profile.additional_origins)
