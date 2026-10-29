"""Shared HTML normalization for authorised residential-sale portals."""
from dataclasses import dataclass
from html.parser import HTMLParser
from decimal import Decimal
import json,re
from urllib.parse import urlsplit,urljoin,parse_qs
from .myoko_akiya_bank import _Node,VOID_TAGS
from ..models import Property,PropertyType,ListingStatus,AvailabilityStatus,ContentPermission
from ..normalize import clean_text,parse_price_jpy,MUNICIPALITY_ALIASES
from ..locations import LOCATION_NAMES,SHINANO_LOCATIONS,IIZUNA_LOCATIONS,JOETSU_AREAS

RIGHTS='User confirmed automated collection, commercial display and direct thumbnail hotlinking permission for SUUMO and Rakusumu on 2026-10-29. No media downloads or galleries.'

class Parser(HTMLParser):
    # Legacy portal markup contains mismatched table wrappers. Inventory counts,
    # explicit end-of-document and required fact checks determine completeness.
    def __init__(self):
        super().__init__(convert_charrefs=True);self.root=_Node('root');self.stack=[self.root]
    def handle_starttag(self,tag,attrs):
        n=_Node(tag,{k:v or '' for k,v in attrs});self.stack[-1].children.append(n)
        if tag not in VOID_TAGS:self.stack.append(n)
        elif tag=='br':self.stack[-1].children.append(' ')
    def handle_startendtag(self,t,a):
        self.handle_starttag(t,a)
        if t not in VOID_TAGS:self.handle_endtag(t)
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:self.stack=self.stack[:i];break
    def handle_data(self,s):self.stack[-1].children.append(s)

def tree(html):
    if not re.search(r'</html>\s*(?:<!--[\s\S]*?-->\s*)*$',html,re.I):raise ValueError('Truncated portal HTML')
    if re.search(r'captcha|access denied|アクセスが制限',html,re.I):raise ValueError('Portal access restriction; no bypass')
    p=Parser();p.feed(html);p.close();return p.root

def text(n):
    if isinstance(n,str):return n
    if n.tag in ('script','style','noscript'):return ''
    return ' '.join(''.join(text(c) if isinstance(c,str) else ' '+text(c)+' ' for c in n.children).split())

def fields(node):
    result={}
    for row in node.walk():
        if row.tag not in ('tr','dl'):continue
        children=[n for n in row.children if isinstance(n,_Node) and n.tag in ('th','td','dt','dd')]
        key=None
        for n in children:
            if n.tag in ('th','dt'):key=clean_text(text(n)).replace(' ヒント','').strip(' :：')
            elif key is not None:
                value=text(n).strip(' :：')
                if key not in result or result[key] in ('','-'):result[key]=value
                key=None
    return result

def price(raw):
    if not raw:return None
    raw=clean_text(raw).split('[')[0].strip()
    if re.search(r'[～~〜]|から|より',raw):return None  # Never turn a range into a single asking price.
    try:return parse_price_jpy(raw)
    except ValueError:return None

def area(raw):
    if not raw or re.search(r'[～~〜]',raw):return None
    m=re.search(r'([0-9,]+(?:\.[0-9]+)?)\s*(?:m\s*2|m²|㎡)',clean_text(raw),re.I)
    return Decimal(m[1].replace(',','')) if m and Decimal(m[1].replace(',',''))>0 else None

def geographic_scope(address):
    """Only the property address establishes municipality, never URL/title/agent."""
    if not address:return None,'unverified',None
    value=clean_text(address)
    value=re.sub(r'^〒?\s*[0-9]{3}-[0-9]{4}\s*','',value)
    candidates=((r'^(?:新潟県)?(妙高市|上越市)',{'妙高市':'Myoko','上越市':'Joetsu'}),
                (r'^(?:長野県)?(?:上水内郡)?(信濃町|飯綱町)',{'信濃町':'Shinano Town','飯綱町':'Iizuna Town'}))
    for pattern,names in candidates:
        match=re.match(pattern,value)
        if match:
            return names[match[1]],'verified',value[match.end():]
    # Explicit other city/town at the start is outside coverage. Mentions of an
    # approved town elsewhere never turn another municipality into a match.
    if re.match(r'^(?:新潟県|長野県)(?:[^市町村]+郡)?[^市町村]+[市町村]',value):return None,'outside_coverage',None
    return None,'unverified',None


def location(address):
    municipality,scope,tail=geographic_scope(address)
    if scope!='verified':return None,None,None
    tail=re.sub(r'^大字','',tail)
    neighbourhood=re.split(r'[0-9０-９]|[\s（(]',tail)[0].strip(' -') or None
    dictionary=LOCATION_NAMES if municipality=='Myoko' else SHINANO_LOCATIONS if municipality=='Shinano Town' else IIZUNA_LOCATIONS if municipality=='Iizuna Town' else {ja:en for ja,en in JOETSU_AREAS.values()}
    if municipality=='Joetsu':
        district=next((name for name in dictionary if tail.startswith(name)),None)
        if district:neighbourhood=district
    return municipality,neighbourhood,dictionary.get(neighbourhood)


def availability(label):
    if label in (None,'','募集中','販売中','販売中です','公開中'):return ListingStatus.ACTIVE,AvailabilityStatus.ACTIVE
    if re.fullmatch(r'(?:成約済|成約済み|売却済|販売終了|売約済|契約済)(?:です)?',label):return ListingStatus.SOLD,AvailabilityStatus.SOLD
    if re.fullmatch(r'(?:商談中|交渉中|契約予定|申込あり|申込中)',label):return ListingStatus.ACTIVE,AvailabilityStatus.UNDER_NEGOTIATION
    if label in ('内覧受付終了','内覧不可','見学不可'):return ListingStatus.ACTIVE,AvailabilityStatus.VIEWINGS_CLOSED
    if label in ('取下げ','取り下げ','掲載終了','販売中止'):return ListingStatus.WITHDRAWN,AvailabilityStatus.WITHDRAWN
    return ListingStatus.ACTIVE,AvailabilityStatus.UNKNOWN

@dataclass(frozen=True)
class Card:
    identifier:str
    url:str
    title:str
    price:object=None
    thumbnail:object=None
    label:object=None
    address:object=None
    kind:str="house"

@dataclass(frozen=True)
class Page:
    cards:tuple
    total:int
    pages:tuple


def photo(source,identifier,candidate):
    if not candidate:return None
    u=urlsplit(candidate)
    if u.scheme!='https' or u.username or u.password or u.port or u.fragment:return None
    if source=='suumo':
        q=parse_qs(u.query);src=q.get('src',[''])[0]
        if u.netloc!='img01.suumo.com' or u.path!='/jj/resizeImage' or set(q)-{'src','w','h'}:return None
        if not re.fullmatch(r'gazo/bukken/[A-Za-z0-9/_-]+/'+re.escape(identifier)+r'/'+re.escape(identifier)+r'_[0-9]+\.(?:jpg|jpeg|png)',src,re.I):return None
        if any(not re.fullmatch(r'[0-9]{1,4}',v[0]) for k,v in q.items() if k in ('w','h')):return None
    else:
        if u.netloc!='www.rakusumu.com' or not re.fullmatch(r'/images/[0-9]{5}/'+re.escape(identifier)+r'/img_'+re.escape(identifier)+r'_G_[0-9]+_[A-Za-z0-9]+\.(?:jpg|jpeg|png)',u.path,re.I):return None
        if u.query and not re.fullmatch(r'u=[0-9]+',u.query):return None
    return candidate


def normalize(source,card,values,checked,thumbnail=None,label=None):
    from ..sources import SOURCES
    address=(values.get('物件所在地') if source=='rakusumu' else values.get('所在地')) or values.get('住所') or card.address
    address=re.sub(r'\s*\[.*$', '',address or '').strip() or None
    _,scope,_=geographic_scope(address)
    if scope=='unverified':raise ValueError('Unverified property municipality; hold snapshot for review')
    municipality,neighbourhood,english=location(address)
    if scope=='outside_coverage':return None
    construction=values.get('完成時期(築年月)') or values.get('完成時期（築年月）') or values.get('築年月')
    m=re.match(r'^(\d{4})年(?:(\d{1,2})月)?',clean_text(construction or ''))
    date=m[1]+('-'+m[2].zfill(2) if m[2] else '') if m else None
    if m and m[2] and not 1<=int(m[2])<=12:date=None
    raw_price=values.get('販売価格') or values.get('価格')
    asking=price(raw_price)
    if card.price is not None and asking is not None and asking!=card.price:raise ValueError('Index/detail price conflict')
    status=label if label is not None else card.label
    publication,available=availability(status)
    building=area(values.get('建物面積'));kind=values.get('物件種別','')
    # House category is established by scoped index/detail URL; mixed-use labels
    # override it. A floor area or explicit structure/layout is positive evidence.
    forbidden=re.search(r'売土地|貸家|賃貸|店舗|事務所|工場|倉庫|収益|ペンション|旅館',kind+' '+card.title)
    evidence=building is not None or bool(values.get('構造・工法') or values.get('構造')) and bool(values.get('間取り'))
    if forbidden or not evidence:available=AvailabilityStatus.UNKNOWN;status=status or '住宅売買区分・建物要確認'
    image=photo(source,card.identifier,thumbnail or card.thumbnail)
    facts={**values,'portal_inventory_complete':'true','residential_building_verified':'true' if evidence and not forbidden else 'false','image_candidate_url':image or '', 'agency_original_ja':values.get('取り扱い会社') or values.get('問い合わせ先') or values.get('お問い合せ先') or '', 'original_description_ja':values.get('備考') or '', 'permission_confirmed_at':'2026-10-29'}
    notices=[values.get(k) for k in ('土地の権利形態','私道負担・道路','その他制限事項','その他の制限','利用制限','仲介手数料','備考') if values.get(k) and values[k]!='-']
    # Free-form descriptions/contacts stay private. Only reviewed short structural
    # facts are displayed; detailed conditions remain behind the original link.
    public_notice='原掲載の土地権利・道路・法令制限・費用等の条件をご確認ください。' if notices else None
    profile=SOURCES[source]
    return Property(source_key=source,source_agency_name=profile.agency,source_website=profile.website,source_property_id=card.identifier,original_listing_url=card.url,title_ja=card.title,description_ja=None,asking_price_jpy=asking,address=address,municipality=municipality,area=neighbourhood,area_en=english,unmapped_locations=(neighbourhood,) if neighbourhood and english is None else (),land_area_sqm=area(values.get('土地面積')),building_area_sqm=building,construction_date=date,construction_details=construction,building_age_years=None,floor_plan=values.get('間取り'),property_type=PropertyType.HOUSE,parking=values.get('駐車場'),first_discovered_at=checked,last_checked_at=checked,listing_status=publication,availability_status=available,source_status_ja=status,transaction_type='sale',main_image_url=image,image_permission=ContentPermission.PERMITTED if image else ContentPermission.UNKNOWN,content_rights_basis=RIGHTS,source_facts=facts,purchase_conditions_ja=public_notice)
