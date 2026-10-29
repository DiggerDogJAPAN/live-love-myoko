"""SUUMO city HTML listings; never request the disallowed JJ010FJ001 search."""
import re
from urllib.parse import urlsplit,urljoin,parse_qs,urlunsplit
from .portal_common import tree,text,fields,Card,Page,price,normalize,photo
SOURCE='suumo'
BASE='https://suumo.jp'
CITY_PATHS=('niigata/sc_myoko','nagano/sc_kamiminochigun')
INDEXES=tuple(BASE+'/'+category+'/'+city+'/' for category in ('chukoikkodate','ikkodate') for city in CITY_PATHS)

def listing(url):
    u=urlsplit(url)
    if u.scheme!='https' or u.netloc!='suumo.jp' or u.query or u.fragment:raise ValueError('Unexpected SUUMO listing origin')
    m=re.fullmatch(r'/(?:chukoikkodate|ikkodate)/(?:niigata/sc_(?:myoko|joetsu)|nagano/sc_kamiminochigun)/nc_([0-9]+)/',u.path)
    if not m:raise ValueError('Not a covered SUUMO house listing')
    return m[1]

def index_page(url):
    u=urlsplit(url);base=urlunsplit((u.scheme,u.netloc,u.path,'',''))
    q=parse_qs(u.query)
    if base not in INDEXES or u.fragment or (q and (set(q)!={'page'} or len(q['page'])!=1 or not q['page'][0].isdigit())):raise ValueError('Unexpected SUUMO pagination')
    page=int(q.get('page',['1'])[0])
    if not 1<=page<=40:raise ValueError('SUUMO page ceiling exceeded')
    return page

def parse_index(html,url):
    current=index_page(url);root=tree(html);nodes=list(root.walk())
    totals={int(re.sub(r'[^0-9]','',text(n))) for n in nodes if n.has_class('pagination_set-hit') and re.fullmatch(r'[0-9,]+\s*件',text(n))}
    if not totals and '条件にあう物件がありません。条件を変更して再度検索してください。' in text(root) and not any(n.has_class('property_unit') for n in nodes):
        return Page((),0,(current,))
    if len(totals)!=1:raise ValueError('Missing or inconsistent SUUMO inventory count')
    total=totals.pop();cards=[];pages={current}
    inventories=[n for n in nodes if n.attrs.get('id')=='js-bukkenList']
    if len(inventories)!=1:raise ValueError('Missing or ambiguous main SUUMO inventory')
    inventory_nodes=list(inventories[0].walk())
    for n in inventory_nodes:
        if n.has_class('property_unit'):
            titles=[x for x in n.walk() if x.has_class('property_unit-title')]
            if len(titles)!=1:raise ValueError('Invalid SUUMO card title')
            links=[x for x in titles[0].walk() if x.tag=='a']
            if len(links)!=1:raise ValueError('Missing SUUMO listing link')
            target=urljoin(BASE,links[0].attrs.get('href',''));kind='land' if urlsplit(target).path.startswith('/tochi/') else 'house'
            identifier=listing(target.replace('/tochi/','/ikkodate/',1)) if kind=='land' else listing(target)
            facts=fields(n)
            label_nodes=[x for x in n.walk() if x.has_class('status') or x.has_class('property_status')]
            label=' / '.join(text(x) for x in label_nodes) or None
            cards.append(Card(identifier,target,text(titles[0]),price(facts.get('販売価格')),label=label,address=facts.get('所在地'),kind=kind))
    for n in nodes:
        if n.has_class('pagination'):
            for a in n.walk():
                if a.tag=='a':
                    target=urljoin(url,a.attrs.get('href',''));page=index_page(target)
                    if urlsplit(target).path!=urlsplit(url).path:raise ValueError('SUUMO pagination changed city')
                    pages.add(page)
    if total and not cards:raise ValueError('SUUMO cards missing')
    if len({c.identifier for c in cards})!=len(cards):raise ValueError('Duplicate SUUMO card')
    return Page(tuple(cards),total,tuple(sorted(pages)))

def parse_detail(card,html,checked):
    root=tree(html);nodes=list(root.walk());facts=fields(root)
    links=[x.attrs.get('href','') for x in nodes if x.tag=='link' and x.attrs.get('rel')=='canonical']
    if links and any(listing(u)!=card.identifier for u in links):raise ValueError('SUUMO detail identity mismatch')
    hidden=[n.attrs.get('value','') for n in nodes if n.tag=='input' and n.attrs.get('name') in ('nc','bukkenCd')]
    if not links and card.identifier not in hidden:raise ValueError('SUUMO identity not verified')
    if not facts.get('所在地') or not ('価格' in facts or '販売価格' in facts):raise ValueError('SUUMO detail facts missing')
    title_nodes=[n for n in nodes if n.tag=='h1'];body=' '.join(text(n) for n in title_nodes)
    labels=[text(n) for n in nodes if n.has_class('status') or n.has_class('property_status')]
    for restricted in ('成約済','売約済','掲載終了','販売終了','商談中','交渉中','内覧受付終了'):
        if restricted in body:labels.append(restricted)
    if '販売状況' in facts:labels.append(facts['販売状況'])
    if card.label:labels.append(card.label)
    labels=list(dict.fromkeys(labels));label=labels[0] if len(labels)==1 else ' / '.join(labels) or None
    image=None
    for n in nodes:
        if n.tag=='img' and re.search(r'現地外観|外観写真|リビング|居室|キッチン',n.attrs.get('alt','')):
            image=photo(SOURCE,card.identifier,n.attrs.get('rel') or n.attrs.get('src'))
            if image:break
    return normalize(SOURCE,card,facts,checked,image,label)
