"""Bounded robots-aware source acquisition; no media or private endpoints."""
from datetime import datetime,timezone
from urllib.error import HTTPError
from urllib.parse import urlsplit,urlunsplit,parse_qs,urlencode
from urllib.robotparser import RobotFileParser
import time,json,hashlib,argparse
from pathlib import Path
from .adapters import suumo,rakusumu
from .adapters.base import CrawlBatch
from .changes import reconcile,State
from dataclasses import replace
from .portal_scope import APPROVED_MUNICIPALITIES,SCOPE_VERSION
from .adapters.portal_common import geographic_scope
from .live import HTMLClient,LiveResult

ADAPTERS={'suumo':suumo,'rakusumu':rakusumu}
# This decision is source-specific, user-confirmed on 2026-10-29. Robots still apply.
ACCESS_APPROVED={'suumo':True,'rakusumu':True}

class PortalClient(HTMLClient):
    def __init__(self,source,**kw):
        super().__init__(**kw);self.source=source;self.adapter=ADAPTERS[source]
        self.robots=self.adapter.BASE+'/robots.txt';self.delay=1
    def _allowed(self,url):
        if url==self.robots:return True
        try:self.adapter.index_page(url);return True
        except ValueError:pass
        try:self.adapter.listing(url);return True
        except ValueError:return False
    def start(self):
        if not ACCESS_APPROVED[self.source]:raise ValueError('Portal access/commercial permission missing')
        try:raw=self._read(self.robots,100000,'text/plain')
        except HTTPError as e:
            if e.code!=404:raise
            # A confirmed missing robots file imposes no path directives. 403,
            # 429, TLS/network failures and malformed 200 responses fail closed.
            raw='User-agent: *\nAllow: /'
        if 'user-agent:' not in raw.lower():raise ValueError('Malformed portal robots response')
        self.rules=RobotFileParser();self.rules.parse(raw.splitlines())
        rate=self.rules.request_rate(self.user_agent)
        self.delay=max(1,self.rules.crawl_delay(self.user_agent) or 0,rate.seconds/rate.requests if rate else 0)
        if self.delay>60:raise ValueError('Portal robots delay exceeds run ceiling')
    def fetch(self,url):
        if not self._allowed(url) or not self.rules.can_fetch(self.user_agent,url):raise ValueError('Portal robots/path disallows request')
        time.sleep(self.delay);return self._read(url,3000000,'text/html')
    def detail(self,card):
        # Rakusumu's public HTML content frame is the same listing, verified by
        # its published composite agency/listing code. Original URL stays /detail/.
        url=card.url.replace('/sale/detail/','/sale/fdetail/') if self.source=='rakusumu' else card.url
        return self.fetch(url)


def crawl_portal(state,*,source,client=None):
    adapter=ADAPTERS[source];client=client or PortalClient(source);client.start()
    checked=datetime.now(timezone.utc);cards={};initial=[];summary={'archive_records':0,'land_excluded':0,'outside_coverage':0,'detail_records':0,'excluded_by_portal_scope':0}
    for index in adapter.INDEXES:
        first=adapter.parse_index(client.fetch(index),index);initial.append((index,first))
        total=first.total;pending=set(range(1,max(first.pages)+1));visited=set();seen=set()
        while pending:
            number=min(pending);pending.remove(number)
            url=(index if number==1 else (adapter.page_url(index,number) if source=='rakusumu' else index+'?page='+str(number)))
            page=first if number==1 else adapter.parse_index(client.fetch(url),url)
            if page.total!=total:raise ValueError('Portal total changed during crawl')
            for card in page.cards:
                if card.identifier in seen:raise ValueError('Duplicate portal ID across pages')
                seen.add(card.identifier)
                if card.kind=='land':summary['land_excluded']+=1;continue
                municipality,certainty,_=geographic_scope(card.address)
                if certainty=='verified' and municipality not in APPROVED_MUNICIPALITIES:
                    summary['excluded_by_portal_scope']+=1;continue
                if card.identifier in cards and cards[card.identifier]!=card:raise ValueError('Conflicting portal identity across categories')
                cards[card.identifier]=card
            visited.add(number);pending.update(set(range(1,max(page.pages)+1))-visited)
            if len(visited)+len(pending)>50 or len(cards)>600:raise ValueError('Portal request ceiling exceeded')
        if len(seen)!=total or visited!=set(range(1,max(visited)+1)):raise ValueError('Incomplete portal pagination')
        summary['archive_records']+=total
    props=[]
    for card in cards.values():
        prop=adapter.parse_detail(card,client.detail(card),checked)
        summary['detail_records']+=1
        if prop is None:summary['outside_coverage']+=1
        elif prop.municipality not in APPROVED_MUNICIPALITIES:summary['excluded_by_portal_scope']+=1
        else:props.append(prop)
    for url,first in initial:
        if adapter.parse_index(client.fetch(url),url)!=first:raise ValueError('Portal index changed during detail acquisition')
    if not props:raise ValueError('Empty covered portal inventory requires review')
    previous={p.source_property_id for p in state.properties if p.source_key==source and p.municipality in APPROVED_MUNICIPALITIES and p.listing_status.value=='active'}
    if previous and len(previous-{p.source_property_id for p in props})/len(previous)>.25:raise ValueError('Portal disappearance exceeds 25%; no writes applied')
    props=tuple(replace(p,source_facts={**p.source_facts,'portal_scope_version':SCOPE_VERSION,'feed_summary':json.dumps(summary,sort_keys=True)}) for p in props)
    warnings=tuple(p.source_property_id+': unknown status or residential classification' for p in props if p.availability_status.value=='unknown')
    # Narrowing collection scope is not evidence of disappearance. Preserve old
    # Joetsu/Iizuna rows and their original timestamps/price history exactly.
    archived=tuple(p for p in state.properties if p.source_key==source and p.municipality not in APPROVED_MUNICIPALITIES)
    archived_ids={p.identity for p in archived}
    scoped=replace(state,properties=tuple(p for p in state.properties if p.identity not in archived_ids))
    result=reconcile(scoped,CrawlBatch(source,checked,props,True))
    result=replace(result,state=replace(result.state,properties=result.state.properties+archived))
    return LiveResult(result,True,warnings,len(props))


def crawl_suumo(state,*,client=None):return crawl_portal(state,source='suumo',client=client)
def crawl_rakusumu(state,*,client=None):return crawl_portal(state,source='rakusumu',client=client)


def main(argv=None):
    from .storage import load_state,save_state
    from .customer import customer_properties
    a=argparse.ArgumentParser(description='Full validated portal crawl to local state; never writes database')
    a.add_argument('--source',choices=tuple(ADAPTERS),required=True);a.add_argument('--output',type=Path,required=True)
    args=a.parse_args(argv);previous=load_state(args.output) if args.output.exists() else State()
    result=crawl_portal(previous,source=args.source);state=result.reconciliation.state;save_state(args.output,state)
    print(json.dumps({'source':args.source,'internal':len(state.properties),'eligible':len(customer_properties(state.properties)),'images':sum(p.main_image_url is not None for p in state.properties),'warnings':result.warnings,'feed_summary':json.loads(state.properties[0].source_facts['feed_summary'])},ensure_ascii=False))
    return 0
if __name__=='__main__':raise SystemExit(main())
