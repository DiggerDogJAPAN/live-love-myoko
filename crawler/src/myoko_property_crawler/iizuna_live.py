"""One Iizuna source transaction requires both public feeds to validate completely."""
from dataclasses import dataclass,replace
from datetime import datetime,timezone
from pathlib import Path
import json,re,time
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser
from .adapters.iizuna_akiya_bank import SOURCE,MUNICIPAL_INDEX,RAKUEN_INDEX,listing_url,rakuen_page,parse_municipal_index,parse_rakuen_index,parse_detail,deduplicate_feeds
from .adapters.base import CrawlBatch
from .changes import State,reconcile
from .live import HTMLClient,LiveResult

# The town's secondary-use terms require permission. Do not enable from robots alone.
MUNICIPAL_FACTS_APPROVED=True  # User confirmed factual collection/display permission on 2026-10-28.
ROBOTS={'www.town.iizuna.nagano.jp':'https://www.town.iizuna.nagano.jp/robots.txt','rakuen-akiya.jp':'https://rakuen-akiya.jp/robots.txt'}

class IizunaClient(HTMLClient):
    def _allowed(self,url):
        if url in ROBOTS.values() or url==MUNICIPAL_INDEX:return True
        try:
            if '/housesearch/' in url:rakuen_page(url)
            else:listing_url(url,'municipal' if urlsplit(url).hostname=='www.town.iizuna.nagano.jp' else 'rakuen')
            return True
        except ValueError:return False

    def start(self):
        self.rules={};self.delays={}
        for host,url in ROBOTS.items():
            raw=self._read(url,65536,'text/plain')
            if not re.search(r'^\s*User-agent:',raw,re.M|re.I):raise ValueError('Invalid Iizuna feed robots response')
            rules=RobotFileParser();rules.parse(raw.splitlines());rate=rules.request_rate(self.user_agent)
            delay=max(1,rules.crawl_delay(self.user_agent) or 0,rate.seconds/rate.requests if rate else 0)
            if delay>60:raise ValueError('Iizuna robots interval exceeds run bound')
            self.rules[host]=rules;self.delays[host]=delay

    def fetch(self,url):
        host=urlsplit(url).hostname
        if host=='www.town.iizuna.nagano.jp' and not MUNICIPAL_FACTS_APPROVED:
            raise ValueError('Municipal secondary-use permission is unresolved; combined live Iizuna crawl disabled')
        if not self._allowed(url) or host not in self.rules or not self.rules[host].can_fetch(self.user_agent,url):raise ValueError('Iizuna robots/path prohibits request')
        time.sleep(self.delays[host])
        return self._read(url,2_000_000,'text/html')


def acquire_rakuen(client,checked):
    first=parse_rakuen_index(client.fetch(RAKUEN_INDEX));cards=[];seen=set()
    for page in first.pages:
        target=RAKUEN_INDEX if page==1 else 'https://rakuen-akiya.jp/housesearch/area/?pg='+str(page)+'&vender_jiscode%5B%5D=20590'
        parsed=first if page==1 else parse_rakuen_index(client.fetch(target),target)
        if parsed.total!=first.total or parsed.pages!=first.pages:raise ValueError('Rakuen inventory changed during pagination')
        for card in parsed.cards:
            if card.url in seen:raise ValueError('Duplicate Rakuen listing across pages')
            seen.add(card.url);cards.append(card)
    if len(cards)!=first.total:raise ValueError('Incomplete Rakuen Iizuna inventory')
    houses=[c for c in cards if c.kind=='house']
    if len(houses)>100:raise ValueError('House-detail request ceiling exceeded')
    props=tuple(parse_detail(c,client.fetch(c.url),checked) for c in houses)
    if parse_rakuen_index(client.fetch(RAKUEN_INDEX))!=first:raise ValueError('Rakuen index changed during detail acquisition')
    return props,{'discovered':len(cards),'house_sale_records':len(houses),'land_excluded':sum(c.kind=='land' for c in cards),'rentals_excluded':sum(c.kind=='rent' for c in cards)}


def stable_identities(properties,state):
    previous={p.source_property_id:p for p in state.properties if p.source_key==SOURCE}
    aliases={}
    for old in previous.values():
        urls={old.original_listing_url}|set(json.loads((old.source_facts or {}).get('provider_urls','{}')).values())
        for url in urls:aliases.setdefault(url,set()).add(old.source_property_id)
    results=[]
    for prop in properties:
        urls={prop.original_listing_url}|set(json.loads((prop.source_facts or {}).get('provider_urls','{}')).values())
        matches=set().union(*(aliases.get(u,set()) for u in urls))
        if prop.source_property_id in previous:matches.add(prop.source_property_id)
        if len(matches)>1:raise ValueError('Previously split Iizuna identities require manual review')
        if matches:
            old=previous[next(iter(matches))]
            before=(old.source_facts or {}).get('municipal_registration');after=(prop.source_facts or {}).get('municipal_registration')
            if before and after and before!=after:raise ValueError('Municipal registration changed for an existing property')
            facts=dict(prop.source_facts or {})
            old_urls=json.loads((old.source_facts or {}).get('provider_urls','{}'))
            current_urls=json.loads(facts.get('provider_urls','{}'))
            facts['provider_urls']=json.dumps({**old_urls,**current_urls},ensure_ascii=False,sort_keys=True)
            prop=replace(prop,source_property_id=old.source_property_id,source_facts=facts)
            if 'municipal' in old_urls and (prop.source_facts or {}).get('provider')!='municipal':
                # A stale secondary posting cannot reactivate a vanished primary listing.
                from .models import ListingStatus,AvailabilityStatus
                terminal=old.listing_status in {ListingStatus.SOLD,ListingStatus.WITHDRAWN}
                prop=replace(prop,original_listing_url=old_urls['municipal'],
                    listing_status=old.listing_status if terminal else ListingStatus.NOT_FOUND,
                    availability_status=old.availability_status if terminal else AvailabilityStatus.UNKNOWN,
                    source_status_ja=old.source_status_ja,
                    source_facts={**facts,'municipal_missing_verification':'pending'})
        results.append(prop)
    return tuple(results)


def crawl_iizuna(state,*,client=None):
    client=client or IizunaClient();client.start();checked=datetime.now(timezone.utc)
    first=parse_municipal_index(client.fetch(MUNICIPAL_INDEX))
    municipal=tuple(parse_detail(c,client.fetch(c.url),checked) for c in first.cards)
    secondary,summary=acquire_rakuen(client,checked)
    if parse_municipal_index(client.fetch(MUNICIPAL_INDEX))!=first:raise ValueError('Municipal index changed during acquisition')
    merged,duplicates=deduplicate_feeds(municipal,secondary);merged=stable_identities(merged,state)
    if len({p.source_property_id for p in merged})!=len(merged):raise ValueError('Duplicate combined Iizuna identity')
    previous={p.source_property_id for p in state.properties if p.source_key==SOURCE and p.listing_status.value=='active'}
    if previous and len(previous-{p.source_property_id for p in merged})/len(previous)>.25:raise ValueError('Iizuna inventory drop exceeds 25%; no updates applied')
    summary.update(municipal_discovered=len(municipal),duplicates_removed=duplicates)
    properties=tuple(replace(p,source_facts={**(p.source_facts or {}),'inventory_complete':'true','feed_summary':json.dumps(summary,sort_keys=True)}) for p in merged)
    warnings=tuple(p.source_property_id+': '+(p.source_status_ja or 'unknown') for p in properties if p.availability_status.value=='unknown')
    return LiveResult(reconcile(state,CrawlBatch(SOURCE,checked,properties,True)),True,warnings,len(properties))


def main(argv=None):
    """Local preview only; deliberately no database connection or write command."""
    import argparse
    from .storage import save_state,load_state
    from .customer import customer_properties
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--secondary-only',action='store_true',help='Partial Rakuen factual preview; cannot be synced')
    a=parser.parse_args(argv);client=IizunaClient();checked=datetime.now(timezone.utc)
    previous=load_state(a.output) if a.output.exists() else State()
    if a.secondary_only:
        client.start()
        if any((p.source_facts or {}).get('inventory_complete')=='true' for p in previous.properties):
            raise ValueError('A partial preview cannot overwrite complete local inventory')
        props,summary=acquire_rakuen(client,checked)
        state=State(props,(),{SOURCE:checked});summary.update(complete=False,municipal='blocked pending secondary-use permission',deduplication='not complete without primary feed')
    else:
        result=crawl_iizuna(previous,client=client);state=result.reconciliation.state
        summary=json.loads(state.properties[0].source_facts['feed_summary']);summary['complete']=True
    save_state(a.output,state)
    summary.update(retained=len(state.properties),eligible=len(customer_properties(state.properties)),excluded_house_records=sum(p.availability_status.value!='active' for p in state.properties),images=0)
    print(json.dumps(summary,ensure_ascii=False,indent=2))
    return 0

if __name__=='__main__':raise SystemExit(main())
