"""Bounded Joetsu transport; validate every page/detail before any source transaction."""
from dataclasses import replace
from datetime import datetime, timezone
import re
import time
from urllib.robotparser import RobotFileParser

from .adapters.joetsu_akiya_bank import SOURCE, HOST, INDEX_URL, MAX_PAGES, PAGE_SIZE, page_number, listing_id, parse_index, parse_detail
from .adapters.base import CrawlBatch
from .changes import reconcile
from .live import HTMLClient, LiveResult

ROBOTS_URL = 'https://' + HOST + '/robots.txt'


class JoetsuClient(HTMLClient):
    def _allowed(self, url):
        if url == ROBOTS_URL:
            return True
        try:
            if '/archives/bukken_type/' in url:
                page_number(url)
            else:
                listing_id(url)
            return True
        except ValueError:
            return False

    def start(self):
        raw = self._read(ROBOTS_URL, 65536, 'text/plain')
        if not re.search(r'^\s*User-agent:', raw, re.M | re.I):
            raise ValueError('Invalid Joetsu robots response')
        self.rules = RobotFileParser()
        self.rules.parse(raw.splitlines())
        rate = self.rules.request_rate(self.user_agent)
        self.delay = max(1, self.rules.crawl_delay(self.user_agent) or 0,
                         rate.seconds / rate.requests if rate else 0)
        if self.delay > 60:
            raise ValueError('Joetsu robots request interval exceeds run bound')

    def fetch(self, url):
        if not self._allowed(url) or not self.rules.can_fetch(self.user_agent, url):
            raise ValueError('Joetsu robots/path prohibits request')
        time.sleep(self.delay)
        return self._read(url, 2_000_000, 'text/html')


def retain_redacted_facts(prop, previous):
    """A closed page's redaction is not a new price or erasure of retained history."""
    if not previous or (prop.source_facts or {}).get('detail_redacted') != 'true':
        return prop
    keep = ('asking_price_jpy', 'address', 'land_area_sqm', 'building_area_sqm',
            'construction_date', 'construction_details', 'building_age_years', 'floor_plan',
            'property_type', 'parking', 'transaction_type', 'purchase_conditions_ja')
    return replace(prop, **{name: getattr(previous, name) for name in keep},
                   source_facts={**(previous.source_facts or {}), **(prop.source_facts or {})})


def crawl_joetsu(state, *, client=None):
    client = client or JoetsuClient()
    client.start()
    first_html = client.fetch(INDEX_URL)
    first = parse_index(first_html, INDEX_URL)
    cards = {}
    urls = set()
    for number in range(1, first.last_page + 1):
        url = INDEX_URL if number == 1 else INDEX_URL + f'page/{number}/'
        page = first if number == 1 else parse_index(client.fetch(url), url)
        if page.last_page != first.last_page:
            raise ValueError('Joetsu pagination changed during acquisition')
        if number < first.last_page and len(page.cards) != PAGE_SIZE:
            raise ValueError('Incomplete Joetsu intermediate archive page')
        for card in page.cards:
            if card.url in urls:
                raise ValueError('Duplicate Joetsu listing ID or URL across pages')
            cards[card.url] = card
            urls.add(card.url)
    if not cards or len(cards) > MAX_PAGES * PAGE_SIZE:
        raise ValueError('Invalid Joetsu inventory size')
    previous = {p.source_property_id: p for p in state.properties if p.source_key == SOURCE}
    checked = datetime.now(timezone.utc)
    parsed = tuple(parse_detail(c, client.fetch(c.url), checked) for c in cards.values())
    current_ids = {p.source_property_id for p in parsed}
    if len(current_ids) != len(parsed):
        raise ValueError('Duplicate published Joetsu property number across detail pages')
    if previous and len(set(previous) - current_ids) / len(previous) > .25:
        raise ValueError('Joetsu inventory drop exceeds 25%; no updates applied')
    properties = tuple(retain_redacted_facts(p, previous.get(p.source_property_id)) for p in parsed)
    # Detect movement of the archive while paging/detail acquisition was in progress.
    if parse_index(client.fetch(INDEX_URL), INDEX_URL) != first:
        raise ValueError('Joetsu first archive page changed; retry a fresh complete snapshot')
    warnings = tuple('Joetsu ' + p.source_property_id + ': ' + p.source_status_ja
                     for p in properties if p.availability_status.value == 'unknown')
    warnings += tuple('Joetsu ' + p.source_property_id + ': published number differs from URL slug'
                      for p in properties if (p.source_facts or {}).get('url_number_discrepancy'))
    batch = CrawlBatch(SOURCE, checked, properties, True)
    return LiveResult(reconcile(state, batch), True, warnings, len(properties))
