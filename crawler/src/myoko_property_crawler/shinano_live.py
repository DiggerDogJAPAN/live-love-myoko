"""Bounded HTML-only Shinano transport and all-or-nothing pagination validation."""
from datetime import datetime, timezone
import time
import re
from urllib.robotparser import RobotFileParser
from .adapters.shinano_akiya_bank import SOURCE, INDEX_URL, HOST, page_number, parse_index, parse_detail
from .adapters.base import CrawlBatch
from .changes import reconcile
from .live import HTMLClient, LiveResult

ROBOTS_URL='https://shinanomachi-iju.jp/robots.txt'

class ShinanoClient(HTMLClient):
    def _allowed(self,url):
        if url == ROBOTS_URL:
            return True
        if re.fullmatch(r'https://shinanomachi-iju\.jp/akiya/\d+/',url):
            return True
        try:
            return 1 <= page_number(url) <= 10
        except ValueError:
            return False

    def start(self):
        text = self._read(ROBOTS_URL,65536,'text/plain')
        if not re.search(r'^User-agent:',text,re.M|re.I):
            raise ValueError('Invalid Shinano robots response')
        self.rules=RobotFileParser()
        self.rules.parse(text.splitlines())
        rate=self.rules.request_rate(self.user_agent)
        self.delay=max(1,self.rules.crawl_delay(self.user_agent) or 0,rate.seconds/rate.requests if rate else 0)
        if self.delay > 60:
            raise ValueError('Shinano robots interval exceeds run bound')

    def fetch(self,url):
        if not self._allowed(url) or not self.rules.can_fetch(self.user_agent,url):
            raise ValueError('Shinano robots/path prohibits request')
        time.sleep(self.delay)
        return self._read(url,1_000_000,'text/html')


def crawl_shinano(state, *, client=None):
    client=client or ShinanoClient()
    client.start()
    pending={1}
    visited=set()
    cards={}
    expected=None
    while pending:
        number=min(pending);pending.remove(number)
        url=INDEX_URL if number==1 else f'https://{HOST}/akiya/page/{number}/?property_type=used'
        page=parse_index(client.fetch(url),url)
        if expected is not None and page.total != expected:
            raise ValueError('Inventory changed during pagination')
        expected=page.total
        for card in page.cards:
            if card.identifier in cards:
                raise ValueError('Duplicate Shinano listing across index pages')
            cards[card.identifier]=card
        visited.add(number)
        pending.update(set(page.pages)-visited)
    if visited != set(range(1,max(visited)+1)) or len(cards)!=expected or len(cards)>120:
        raise ValueError('Incomplete or excessive Shinano inventory')
    checked=datetime.now(timezone.utc)
    properties=tuple(parse_detail(card,client.fetch(card.url),checked) for card in cards.values())
    previous={p.source_property_id for p in state.properties if p.source_key==SOURCE and p.listing_status.value=='active'}
    if previous and len(previous-set(cards))/len(previous)>0.25:
        raise ValueError('Shinano inventory drop exceeds 25%; no updates applied')
    batch=CrawlBatch(SOURCE,checked,properties,True)
    return LiveResult(reconcile(state,batch),True,(),len(properties))
