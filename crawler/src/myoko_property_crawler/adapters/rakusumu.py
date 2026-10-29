"""Rakusumu scoped Niigata house-sale pages, retaining exact agency/listing IDs."""
import re
from urllib.parse import urlsplit,urljoin,parse_qs,urlencode
from .portal_common import tree,text,fields,Card,Page,price,normalize,photo
SOURCE='rakusumu';BASE='https://www.rakusumu.com'
QUERY=urlencode([('area[]','15217'),('sort','NEW')])
INDEXES=tuple(BASE+'/sale/area/list/'+kind+'?'+QUERY for kind in ('3','4'))

def listing(url):
    u=urlsplit(url)
    if u.scheme!='https' or u.netloc!='www.rakusumu.com' or u.query or u.fragment:raise ValueError('Unexpected Rakusumu listing origin')
    m=re.fullmatch(r'/sale/(?:fdetail|detail)/([0-9]{5}-[0-9]{6})',u.path)
    if not m:raise ValueError('Not a Rakusumu sale listing')
    return m[1]

def index_page(url):
    u=urlsplit(url);q=parse_qs(u.query)
    m=re.fullmatch(r'/sale/area/list/([34])(?:/([0-9]+))?',u.path)
    if u.scheme!='https' or u.netloc!='www.rakusumu.com' or u.fragment or not m or q!={'area[]':['15217'],'sort':['NEW']}:raise ValueError('Rakusumu pagination lost city/category scope')
    offset=int(m[2] or 0)
    if offset%20 or offset>1000:raise ValueError('Rakusumu page ceiling exceeded')
    return m[1],offset//20+1

def page_url(url,page):
    kind,_=index_page(url)
    return BASE+'/sale/area/list/'+kind+('/'+str((page-1)*20) if page>1 else '')+'?'+QUERY

def parse_index(html,url):
    kind,current=index_page(url);root=tree(html);nodes=list(root.walk());totals=set()
    for n in nodes:
        if n.has_class('num'):
            m=re.search(r'([0-9,]+)件.*該当',text(n))
            if m:totals.add(int(m[1].replace(',','')))
    if len(totals)!=1:raise ValueError('Missing Rakusumu count')
    total=totals.pop();cards=[];pages={current}
    for n in nodes:
        if n.tag=='tbody' and n.has_class('over'):
            links=[x for x in n.walk() if x.tag=='a' and '/sale/detail/' in x.attrs.get('href','')]
            urls=set(urljoin(BASE,x.attrs['href']) for x in links)
            if len(urls)!=1:raise ValueError('Rakusumu card has conflicting listing links')
            target=urls.pop();identifier=listing(target)
            heading=next((x for x in n.walk() if x.tag in ('h2','h3','h4')),None)
            address=next((text(x) for x in n.walk() if x.has_class('address')),None)
            value=next((text(x)+'円' for x in n.walk() if x.has_class('price')),None)
            imgs=[x for x in n.walk() if x.tag=='img']
            image=next((photo(SOURCE,identifier,urljoin(BASE,x.attrs.get('src',''))) for x in imgs if photo(SOURCE,identifier,urljoin(BASE,x.attrs.get('src','')))),None)
            statuses=[text(x) or x.attrs.get('alt','') for x in n.walk() if x.has_class('status')]
            statuses += [x.attrs.get('alt','') for x in imgs if re.search(r'成約|商談|売約|交渉|販売終了',x.attrs.get('alt',''))]
            cards.append(Card(identifier,target,text(heading) if heading else identifier,price(value),image,' / '.join(dict.fromkeys(statuses)) or None,address))
        if n.has_class('pageNavi'):
            for a in n.walk():
                if a.tag=='a':
                    target=urlsplit(urljoin(BASE,a.attrs.get('href','')))
                    # Site pagination omits filters and relies on cookies; explicitly
                    # preserve the original GET scope on every page, never nationwide.
                    if re.fullmatch(r'/sale/area/list/'+kind+r'/[0-9]+',target.path):
                        if target.netloc!='www.rakusumu.com':raise ValueError('Foreign pagination')
                        pages.add(int(target.path.rsplit('/',1)[1])//20+1)
    if total and not cards:raise ValueError('Rakusumu cards missing')
    if len({c.identifier for c in cards})!=len(cards):raise ValueError('Duplicate Rakusumu card')
    return Page(tuple(cards),total,tuple(sorted(pages)))

def parse_detail(card,html,checked):
    root=tree(html);nodes=list(root.walk());facts=fields(root)
    if facts.get('物件コード')!=card.identifier:raise ValueError('Rakusumu detail identity mismatch')
    if not facts.get('物件所在地') or not facts.get('物件種別') or '販売価格' not in facts:raise ValueError('Rakusumu required facts missing')
    title=facts.get('物件名') or card.title
    from dataclasses import replace
    labels=[text(n) for n in nodes if n.has_class('status')]
    for key in ('販売状況','公開状況','取引状況'):
        if facts.get(key):labels.append(facts[key])
    for restricted in ('成約済','売約済','掲載終了','販売終了','商談中','交渉中','内覧受付終了'):
        if restricted in title:labels.append(restricted)
    if card.label:labels.append(card.label)
    labels=list(dict.fromkeys(labels))
    label=labels[0] if len(labels)==1 else ' / '.join(labels) or None
    return normalize(SOURCE,replace(card,title=title),facts,checked,label=label)
