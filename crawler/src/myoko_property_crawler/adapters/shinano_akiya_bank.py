"""Shinano sale-building HTML. Card badges govern availability, never page existence."""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional
import re
from urllib.parse import urljoin, urlsplit, parse_qs

from .base import CrawlBatch
from .myoko_akiya_bank import _TreeParser
from ..locations import SHINANO_LOCATIONS, SHINANO_REGIONS
from ..models import Property, PropertyType, ListingStatus, AvailabilityStatus, ContentPermission
from ..normalize import clean_text, parse_price_jpy

SOURCE = 'shinano_akiya_bank'
INDEX_URL = 'https://shinanomachi-iju.jp/akiya/?property_type=used'
HOST = 'shinanomachi-iju.jp'


def tree(fragment):
    parser = _TreeParser()
    parser.feed(fragment)
    parser.close()
    if len(parser.stack) != 1:
        raise ValueError('Truncated Shinano component')
    return parser.root


def original_text(node):
    """Keep Japanese spelling/punctuation; normalize whitespace only."""
    def collect(n):
        return ''.join(child if isinstance(child,str) else (' ' if child.tag=='br' else collect(child)) for child in n.children)
    return ' '.join(collect(node).split())


def one(nodes, class_name):
    found = [n for n in nodes if n.has_class(class_name)]
    if len(found) != 1:
        raise ValueError('Expected one Shinano '+class_name)
    return found[0]


def page_number(url):
    u = urlsplit(url)
    if u.scheme != 'https' or u.netloc != HOST or parse_qs(u.query,keep_blank_values=True,strict_parsing=True) != {'property_type':['used']} or u.fragment:
        raise ValueError('Invalid sale index link')
    match = re.fullmatch(r'/akiya/(?:page/([1-9]\d*)/)?', u.path)
    if not match:
        raise ValueError('Invalid sale pagination')
    return int(match[1] or 1)


@dataclass(frozen=True)
class Card:
    identifier: str
    url: str
    title: str
    region: str
    price: Optional[int]
    thumbnail: Optional[str]
    listing_status: ListingStatus
    availability: AvailabilityStatus
    label: Optional[str]


@dataclass(frozen=True)
class IndexPage:
    cards: tuple
    total: int
    pages: tuple


def parse_index(html, url):
    current = page_number(url)
    if not re.search(r'</html>\s*(?:<!--[\s\S]*?-->\s*)*$', html, re.I):
        raise ValueError('Incomplete Shinano page')
    text = clean_text(re.sub('<[^>]*>', '', html))
    count = re.search(r'中古住宅\s*\((\d+)\)', text)
    if not count or int(count[1]) == 0:
        raise ValueError('Missing or empty sale inventory requires review')
    fragments = re.findall(r'<li\b[^>]*class=["\'][^"\']*\bakiya-list-item\b[^"\']*["\'][^>]*>.*?</li>', html, re.S)
    if not fragments or len(fragments) != len(re.findall(r'<li\b[^>]*class=["\'][^"\']*\bakiya-list-item\b', html)):
        raise ValueError('Unrecognized or truncated sale cards')
    cards = []
    for fragment in fragments:
        nodes = list(tree(fragment).walk())
        link = one(nodes, 'list-link')
        target = urljoin(INDEX_URL, link.attrs.get('href', ''))
        match = re.fullmatch(r'https://shinanomachi-iju\.jp/akiya/(\d+)/', target)
        if not match:
            raise ValueError('Invalid Shinano listing URL')
        statuses = {c for node in nodes for c in node.attrs.get('class','').split() if c.startswith('status-')}
        if statuses not in (set(), {'status-progress'}, {'status-closed'}):
            raise ValueError('Unknown or conflicting Shinano status')
        label = '交渉中' if statuses == {'status-progress'} else '成約済' if statuses else None
        availability = AvailabilityStatus.UNDER_NEGOTIATION if label == '交渉中' else AvailabilityStatus.SOLD if label else AvailabilityStatus.ACTIVE
        title = original_text(one(nodes, 'title'))
        title_id = re.search(r'No\.?\s*(\d+)', clean_text(title), re.I)
        if not title_id or title_id[1] != match[1]:
            raise ValueError('Card title/URL identity conflict')
        if one(nodes,'property-type').text() != '中古住宅':
            raise ValueError('Non-sale-building card on sale index')
        images = [n.attrs.get('src') for n in one(nodes,'img').walk() if n.tag == 'img']
        thumbnail = images[0] if images else None
        if thumbnail:
            thumbnail = urljoin(INDEX_URL,thumbnail)
            u = urlsplit(thumbnail)
            if u.scheme != 'https' or u.netloc != HOST or not u.path.startswith('/shinanomachi/wordpress/wp-content/uploads/') or not re.search(r'\.(?:jpe?g|png|webp)$',u.path,re.I):
                raise ValueError('Unexpected property thumbnail reference')
        cards.append(Card(match[1],target,title,original_text(one(nodes,'area')),parse_price_jpy(one(nodes,'price').text()),thumbnail,
                          ListingStatus.SOLD if label == '成約済' else ListingStatus.ACTIVE,availability,label))
    pages = {current}
    for tag in re.findall(r'<a\b[^>]*>', html):
        attrs = dict(re.findall(r'([\w-]+)=["\']([^"\']*)["\']',tag))
        if 'page-numbers' in attrs.get('class','').split():
            pages.add(page_number(urljoin(INDEX_URL,attrs.get('href',''))))
    if not pages <= set(range(1,11)):
        raise ValueError('Shinano pagination exceeds request ceiling')
    return IndexPage(tuple(cards),int(count[1]),tuple(sorted(pages)))


def square_metres(raw):
    if not raw:
        return None
    match = re.match(r'([\d,]+(?:\.\d+)?)\s*(?:m2|m²|㎡)',clean_text(raw),re.I)
    if not match or len(re.findall(r'[\d,.]+\s*(?:m2|m²|㎡)',clean_text(raw),re.I)) != 1:
        return None
    value = Decimal(match[1].replace(',',''))
    return value if value > 0 else None


def _parse_detail(card, html, checked_at):
    if not re.search(r'</html>\s*(?:<!--[\s\S]*?-->\s*)*$',html,re.I):
        raise ValueError('Incomplete Shinano detail')
    categories = re.findall(r'<a\b[^>]*class=[\"\'][^\"\']*\bpost-category\b[^\"\']*[\"\'][^>]*>.*?</a>',html,re.S)
    if len(categories) != 1 or tree(categories[0]).text() != '中古住宅':
        raise ValueError('Detail is not a verified sale-building category')
    category = next(n for n in tree(categories[0]).walk() if n.tag == 'a')
    if urljoin(INDEX_URL,category.attrs.get('href','')) != INDEX_URL:
        raise ValueError('Detail category link is not the sale index')
    header = re.search(r'<h1\b[^>]*class=["\'][^"\']*post-title[^"\']*["\'][^>]*>(.*?)</h1>',html,re.S)
    ids = re.findall(r'管理番号[：:]\s*(\d+)',clean_text(re.sub('<[^>]*>','',html)))
    if not header or not ids or any(i != card.identifier for i in ids):
        raise ValueError('Shinano detail identity mismatch')
    if clean_text(original_text(tree(header.group(0)))) != clean_text(card.title):
        raise ValueError('Index/detail title conflict')
    table = re.search(r'<ul\b[^>]*class=[\"\'][^\"\']*\bdetail-content-list\b[^\"\']*[\"\'][^>]*>(.*?)</ul>',html,re.S)
    if not table:
        raise ValueError('Missing Shinano property facts table')
    values = {}
    for fragment in re.findall(r'<li\b[^>]*class=["\'][^"\']*\blist-item\b[^"\']*["\'][^>]*>.*?</li>',table[1],re.S):
        nodes = list(tree(fragment).walk())
        key,value = one(nodes,'label').text(),original_text(one(nodes,'value'))
        if key in values and values[key] != value:
            raise ValueError('Conflicting detail fields')
        values[key] = value
    if '価格' not in values or '所在地' not in values or clean_text(values.get('管理番号','')) != card.identifier:
        raise ValueError('Required detail facts missing')
    if parse_price_jpy(values['価格']) != card.price:
        raise ValueError('Index/detail price conflict')
    address = values['所在地'] or None
    if not address or '信濃町' not in address:
        raise ValueError('Unexpected municipality')
    area = re.sub(r'^.*?信濃町(?:大字)?','',address).split('字')[0].strip() or None
    english = SHINANO_LOCATIONS.get(area)
    construction = values.get('建築年月') or None
    date_match = re.fullmatch(r'(\d{4})年(?:(\d{1,2})月)?',clean_text(construction or ''))
    construction_date = date_match[1] + ('-'+date_match[2].zfill(2) if date_match[2] else '') if date_match else None
    kind = PropertyType.LODGE if 'ペンション' in card.title else PropertyType.APARTMENT if 'マンション' in card.title else PropertyType.COMMERCIAL if '店舗' in card.title else PropertyType.HOUSE
    return Property(source_key=SOURCE,source_agency_name='Shinano Town Akiya Bank',source_website=INDEX_URL,
        source_property_id=card.identifier,original_listing_url=card.url,title_ja=card.title,title_en=None,
        source_facts={key: value for key,value in values.items() if key in {'価格','所在地','土地面積','建物面積','建築年月','構造','間取り','駐車場','管理番号'}},
        description_ja=None,asking_price_jpy=card.price,address=address,municipality='Shinano Town',area=area,
        area_en=english,region_ja=card.region,region_en=' / '.join(SHINANO_REGIONS.get(x,x) for x in card.region.split('・')),
        unmapped_locations=tuple(dict.fromkeys(([area] if area and not english else []) +
            [name for name in card.region.split('・') if name not in SHINANO_REGIONS])),land_area_sqm=square_metres(values.get('土地面積')),
        building_area_sqm=square_metres(values.get('建物面積')),construction_date=construction_date,
        construction_details=construction,building_age_years=None,floor_plan=values.get('間取り') or None,
        property_type=kind,parking=values.get('駐車場') or None,transaction_type='sale',
        main_image_url=card.thumbnail,image_permission=ContentPermission.PERMITTED,
        content_rights_basis='User confirmed Shinano photograph use and direct hotlink permission for this project; original URLs only.',
        listing_status=card.listing_status,availability_status=card.availability,source_status_ja=card.label,
        first_discovered_at=checked_at,last_checked_at=checked_at)


def parse_detail(card, html, checked_at):
    try:
        return _parse_detail(card, html, checked_at)
    except ValueError as error:
        raise ValueError(f'Shinano detail {card.identifier}: {error}') from None
