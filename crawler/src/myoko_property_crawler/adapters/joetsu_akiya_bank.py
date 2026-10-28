"""Joetsu public sale HTML; photographs and prose remain private references/facts."""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from html.parser import HTMLParser
import re
from urllib.parse import urlsplit, urljoin, unquote

from .myoko_akiya_bank import _Node, VOID_TAGS
from ..locations import JOETSU_AREAS
from ..models import Property, PropertyType, ListingStatus, AvailabilityStatus
from ..normalize import clean_text, parse_price_jpy

SOURCE = 'joetsu_akiya_bank'
HOST = 'joetsu-akiyabank.jp'
INDEX_URL = 'https://' + HOST + '/archives/bukken_type/baibai/'
ID_PATTERN = r'(?:[1-9]|1[0-9]|2[0-8])-[0-9]+'
MAX_PAGES = 25
PAGE_SIZE = 12


class _DOM(HTMLParser):
    """Allow ordinary legacy HTML end-tag recovery; validate required components separately."""
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = _Node('root')
        self.stack = [self.root]
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = _Node(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                break

    def handle_data(self, value):
        self.stack[-1].children.append(value)


def text(node):
    return ' '.join(' '.join(text(c) if isinstance(c, _Node) else c for c in node.children).split())


def nodes(root, *, tag=None, cls=None):
    return [n for n in root.walk() if (tag is None or n.tag == tag) and (cls is None or n.has_class(cls))]


def single(root, *, tag=None, cls=None):
    found = nodes(root, tag=tag, cls=cls)
    if len(found) != 1:
        raise ValueError('Missing or duplicate Joetsu component: ' + str(cls or tag))
    return found[0]


def document(html):
    if not re.search(r'</html>\s*(?:<!--[\s\S]*?-->\s*)*$', html, re.I):
        raise ValueError('Incomplete Joetsu HTML')
    return _DOM(html).root


def page_number(url):
    u = urlsplit(url)
    if u.scheme != 'https' or u.netloc != HOST or u.query or u.fragment:
        raise ValueError('Invalid Joetsu index origin')
    match = re.fullmatch(r'/archives/bukken_type/baibai/(?:page/([1-9][0-9]*)/)?', u.path)
    if not match or not 1 <= int(match[1] or 1) <= MAX_PAGES:
        raise ValueError('Invalid or excessive Joetsu pagination')
    return int(match[1] or 1)


def listing_id(url):
    u = urlsplit(url)
    if u.scheme != 'https' or u.netloc != HOST or u.query or u.fragment:
        raise ValueError('Invalid Joetsu listing origin')
    match = re.fullmatch(r'/archives/realestate/(' + ID_PATTERN + r')(?:[^/]*?)/', unquote(u.path))
    if not match:
        raise ValueError('Invalid Joetsu listing URL')
    return match[1]


def thumbnail_url(value):
    if not value:
        return None
    url = urljoin(INDEX_URL, value)
    u = urlsplit(url)
    if (u.scheme != 'https' or u.netloc != HOST or u.query or u.fragment
            or not u.path.startswith('/wp-content/uploads/')
            or not re.search(r'\.(?:jpe?g|png|webp)$', u.path, re.I)):
        raise ValueError('Unexpected Joetsu thumbnail reference')
    return url


@dataclass(frozen=True)
class Card:
    identifier: str
    url: str
    location: str
    price: object
    thumbnail: object


@dataclass(frozen=True)
class IndexPage:
    cards: tuple
    last_page: int


def parse_index(html, url):
    current = page_number(url)
    root = document(html)
    cards = []
    for item in nodes(root, cls='c-card__item'):
        link = single(item, cls='c-card__link')
        target = urljoin(INDEX_URL, link.attrs.get('href', ''))
        identifier = listing_id(target)
        summary = text(item)
        price = re.search(r'価格\s+(.+?)(?:\s+土地面積|$)', summary)
        location = re.search(r'所在地\s+(.+?)\s+価格', summary)
        if not price or not location:
            raise ValueError('Unrecognized Joetsu card facts')
        images = nodes(item, tag='img')
        if len(images) > 1:
            raise ValueError('Ambiguous Joetsu card thumbnail')
        raw_price = clean_text(price[1])
        asking = None if raw_price in {'-', '―', '不明', '相談', '応相談'} else parse_price_jpy(raw_price)
        if asking is None and raw_price not in {'-', '―', '不明', '相談', '応相談'}:
            raise ValueError('Unrecognized Joetsu card price')
        cards.append(Card(identifier, target, location[1] if location[1] != '-' else '', asking,
                          thumbnail_url(images[0].attrs.get('src')) if images else None))
    if not cards or len(cards) > PAGE_SIZE:
        raise ValueError('Empty or excessive Joetsu page requires review')
    pages = {current}
    for a in nodes(root, tag='a'):
        url = urljoin(INDEX_URL, a.attrs.get('href', ''))
        if '/archives/bukken_type/baibai/page/' in url:
            pages.add(page_number(url))
    return IndexPage(tuple(cards), max(pages))


def area_sqm(raw, label):
    match = re.search(label + r'[：:]\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:㎡|m²|m2)', clean_text(raw), re.I)
    return Decimal(match[1].replace(',', '')) if match and Decimal(match[1].replace(',', '')) > 0 else None


def construction_date(raw):
    m = re.match(r'([0-9]{4})年(?:([0-9]{1,2})月)?', clean_text(raw or ''))
    if not m:
        return None
    try:
        datetime(int(m[1]), int(m[2]) if m[2] else 1, 1)
    except ValueError:
        return None
    return m[1] + ('-' + m[2].zfill(2) if m[2] else '')


def parse_detail(card, html, checked_at):
    root = document(html)
    heading = text(single(root, tag='h1'))
    title_id = re.match('(' + ID_PATTERN + r')(?![0-9])', heading)
    if not title_id:
        raise ValueError('Joetsu detail heading has no valid property number')
    identifier = title_id[1]
    body = single(root, cls='p-article__body')
    numbers = nodes(body, cls='p-realestateInfo__number')
    if numbers and (len(numbers) != 1 or text(numbers[0]) != '物件番号：' + identifier):
        raise ValueError('Joetsu published property number mismatch')
    message_nodes = nodes(body, cls='p-article__text')
    messages = [text(n) for n in message_nodes if text(n)]
    labels = ' / '.join(messages) or None
    unknown_classes = {c for n in body.walk() for c in (n.attrs.get('class') or '').split() if c.startswith('status-') or re.search(r'(?:__|-)(?:status|restriction)(?:-|$)', c)}
    if unknown_classes:
        raise ValueError('Unrecognized Joetsu CSS status')
    listing, availability = ListingStatus.ACTIVE, AvailabilityStatus.ACTIVE
    if labels:
        statuses = []
        patterns = (
            (r'(?:成約済|売却済)', ListingStatus.SOLD, AvailabilityStatus.SOLD),
            (r'(?:交渉中|商談中)', ListingStatus.ACTIVE, AvailabilityStatus.UNDER_NEGOTIATION),
            (r'(?:内覧|見学)(?:受付)?(?:終了|停止|中止)', ListingStatus.ACTIVE, AvailabilityStatus.VIEWINGS_CLOSED),
            (r'(?:取下げ|取り下げ|販売終了|募集終了|登録取消)', ListingStatus.WITHDRAWN, AvailabilityStatus.WITHDRAWN),
        )
        for message in messages:
            matched = [(pub, avail) for pattern, pub, avail in patterns
                       if re.fullmatch(r'(?:この物件は)?' + pattern + r'(?:です)?[。.!！]?', clean_text(message))]
            if len(matched) != 1:
                raise ValueError('Unrecognized or ambiguous Joetsu status message')
            statuses.extend(matched)
        if len(set(statuses)) != 1:
            raise ValueError('Conflicting Joetsu status messages')
        listing, availability = statuses[0]
    values = {}
    for row in nodes(body, tag='tr'):
        th, td = nodes(row, tag='th'), nodes(row, tag='td')
        if th and td:
            key, value = text(th[0]), text(td[0])
            if key in values:
                raise ValueError('Duplicate Joetsu detail field')
            values[key] = value
    redacted = not values and availability != AvailabilityStatus.ACTIVE
    if not numbers and not redacted:
        raise ValueError('Missing published Joetsu identifier')
    price_nodes = nodes(body, cls='p-realestateDetail__price')
    if len(price_nodes) > 1:
        raise ValueError('Ambiguous detail price')
    price_text = text(price_nodes[0]) if price_nodes else ''
    raw_price = re.sub(r'^価格[：:]\s*', '', price_text)
    price = parse_price_jpy(raw_price) if raw_price else None
    if not redacted and price != card.price:
        raise ValueError('Joetsu index/detail price conflict')
    if not redacted and not values:
        raise ValueError('Missing Joetsu facts table')
    categories = [text(n) for n in nodes(body, cls='p-realestateInfo__cat')]
    rights = [text(n) for n in nodes(body, cls='p-realestateDetail__district')]
    # Separate categories/rights are authoritative; never interpret a sale archive as proof.
    category_text = ' '.join(categories)
    rights_text = ' '.join(rights)
    sale = category_text == '売買' and rights_text in {'権利関係：売買', '売買'}
    transaction = 'sale' if sale else 'rent' if category_text == '賃貸' and rights_text in {'権利関係：賃貸', '賃貸'} else None
    if not redacted and (not sale or identifier == '5-34'):
        availability = AvailabilityStatus.UNKNOWN
        labels = '売買・賃貸分類不一致' if transaction == 'rent' or identifier == '5-34' else '取引分類不明'
    if not redacted and not categories:
        raise ValueError('Missing Joetsu transaction classification')
    structure = clean_text(values.get('建物構造', ''))
    layout = clean_text(values.get('間取り', ''))
    building = structure not in {'', '-', '―', '不明', '不詳', 'なし', '無し', '無', '土地', '更地'} and (layout not in {'', '-', '―', '不明'} or area_sqm(values.get('面積', ''), '延床') is not None or area_sqm(values.get('面積', ''), '建築') is not None)
    kind = PropertyType.HOUSE if building else PropertyType.UNKNOWN
    if not redacted and not building:
        availability, labels = AvailabilityStatus.UNKNOWN, '建物情報未確認'
    scope = ' '.join(values.get(k, '') for k in ('建物構造', '間取り', '詳細間取り'))
    if 'ペンション' in scope or '旅館' in scope:
        kind = PropertyType.LODGE
    elif '店舗' in scope or '事務所' in scope:
        kind = PropertyType.COMMERCIAL
    region = JOETSU_AREAS.get(identifier.split('-')[0])
    region_ja, region_en = region if region else (None, None)
    facts = dict(values)
    facts.update({'property_number_basis': 'heading_only' if redacted else 'published_number',
                  'transaction_category_ja': category_text, 'rights_ja': rights_text})
    if identifier != card.identifier:
        facts['url_number_discrepancy'] = card.identifier
    if redacted:
        facts['detail_redacted'] = 'true'
    if card.thumbnail:
        facts['thumbnail_candidate_url'] = card.thumbnail
    # Protected prose and agent metadata are retained privately, never in customer descriptions.
    paragraphs = [text(n) for n in nodes(body, tag='p') if not n.has_class('p-article__text')]
    if paragraphs:
        facts['original_description_ja'] = '\n'.join(p for p in paragraphs if p)
    notices = []
    if values.get('その他'):
        notices.append('その他：' + values['その他'])
    if '未登記' in values.get('付帯物件', ''):
        notices.append('付帯物件：' + values['付帯物件'])
    occupancy = values.get('現状', '')
    if occupancy and '空き家' not in occupancy:
        notices.append('現状：' + occupancy)
    if any(re.search(r'@|https?://|(?:TEL|FAX|E-?mail)[.：:]?|電話|☎', value, re.I) for value in notices):
        # Keep the full raw conditions privately; never forward embedded contact metadata.
        facts['condition_notice_needs_review'] = 'true'
        notices = ['原掲載の条件をご確認ください（詳細は要確認）。']
    return Property(source_key=SOURCE, source_agency_name='Joetsu City Akiya Bank', source_website=INDEX_URL,
        original_listing_url=card.url, source_property_id=identifier, title_ja=heading, description_ja=None,
        asking_price_jpy=price, address=card.location or None, municipality='Joetsu', area=region_ja or card.location or None, area_en=region_en,
        region_ja=region_ja, region_en=region_en, unmapped_locations=() if region else (card.location or heading,),
        land_area_sqm=area_sqm(values.get('面積', ''), '敷地'), building_area_sqm=area_sqm(values.get('面積', ''), '延床'),
        construction_date=construction_date(values.get('築年月')), construction_details=values.get('築年月') or None,
        building_age_years=None, floor_plan=values.get('間取り') or None, property_type=kind,
        parking=values.get('駐車場') or None, first_discovered_at=checked_at, last_checked_at=checked_at,
        listing_status=listing, availability_status=availability, source_status_ja=labels, transaction_type=transaction,
        source_facts=facts, purchase_conditions_ja='\n'.join(notices) or None)
