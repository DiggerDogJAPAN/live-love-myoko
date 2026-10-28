"""Iizuna's municipal and town-authored Rakuen feeds, combined before reconciliation."""
from dataclasses import dataclass,replace
from decimal import Decimal
import json,re
from urllib.parse import urljoin,urlsplit,parse_qs
from .joetsu_akiya_bank import document,nodes,single,text,construction_date
from ..models import Property,PropertyType,ListingStatus,AvailabilityStatus
from ..normalize import clean_text,parse_price_jpy
from ..locations import IIZUNA_LOCATIONS
from .. import iizuna_images

SOURCE='iizuna_akiya_bank'
MUNICIPAL_INDEX='https://www.town.iizuna.nagano.jp/ijuportal/live/sale/search/'
RAKUEN_INDEX='https://rakuen-akiya.jp/housesearch/area/?vender_jiscode%5B%5D=20590'
AGENCY='Iizuna Town Akiya Bank'

@dataclass(frozen=True)
class Card:
    provider:str
    url:str
    title:str
    kind:str
    registration:object=None
    price:object=None
    thumbnail:object=None

@dataclass(frozen=True)
class IndexPage:
    cards:tuple
    total:int
    pages:tuple


def registration(raw):
    matches=re.findall(r'(?<!受付)登録番号\s*([0-9]+)',clean_text(raw or ''))
    if len(set(matches))>1:raise ValueError('Conflicting municipal registration numbers')
    return str(int(matches[0])).zfill(3) if matches else None


def literal_price(node):
    """Read only the known numeric document.write literal; never evaluate JavaScript."""
    scripts=nodes(node,tag='script')
    if scripts:
        literals=[]
        for script in scripts:
            m=re.fullmatch(r'\s*document\.write\(Number\(([0-9]+(?:\.[0-9]+)?)\)\.toLocaleString\(\)\);?\s*',text(script))
            if not m:return None
            literals.append(int(Decimal(m[1])*10000))
        if len(set(literals))!=1:raise ValueError('Conflicting literal prices')
        return literals[0]
    raw=clean_text(text(node))
    if raw in {'','万円','-','―','相談','応相談','価格未定'}:return None
    try:return parse_price_jpy(raw)
    except ValueError:return None


def fields(root):
    values={};cells={}
    for row in nodes(root,tag='tr'):
        children=[n for n in row.children if not isinstance(n,str) and n.tag in {'th','td'}]
        for i,n in enumerate(children[:-1]):
            if n.tag=='th' and children[i+1].tag=='td':
                key=clean_text(text(n));value=text(children[i+1])
                if key in values and clean_text(values[key])!=clean_text(value):raise ValueError('Conflicting repeated Iizuna detail field: '+key)
                values[key]=value;cells[key]=children[i+1]
    return values,cells


def rakuen_page(url):
    u=urlsplit(url);q=parse_qs(u.query,keep_blank_values=True)
    if u.scheme!='https' or u.netloc!='rakuen-akiya.jp' or u.path!='/housesearch/area/' or u.fragment or set(q)-{'pg','vender_jiscode[]'} or q.get('vender_jiscode[]')!=['20590']:
        raise ValueError('Rakuen query must stay scoped to Iizuna municipality')
    p=q.get('pg',['1'])
    if len(p)!=1 or not re.fullmatch(r'[1-9][0-9]*',p[0]) or int(p[0])>12:raise ValueError('Invalid Rakuen pagination')
    return int(p[0])


def listing_url(url,provider):
    u=urlsplit(url)
    expected=('www.town.iizuna.nagano.jp',r'/ijuportal/live/sale/[0-9]+\.html') if provider=='municipal' else ('rakuen-akiya.jp',r'/bukken/[0-9]+/')
    if u.scheme!='https' or u.netloc!=expected[0] or u.query or u.fragment or not re.fullmatch(expected[1],u.path):raise ValueError('Unexpected Iizuna property URL')
    return url


def parse_municipal_index(html,url=MUNICIPAL_INDEX):
    if url!=MUNICIPAL_INDEX:raise ValueError('Unexpected municipal index URL')
    root=document(html);m=re.search(r'物件登録数\s*([0-9]+)\s*件',text(root))
    cards=[]
    for n in nodes(root,cls='property-box'):
        target=listing_url(urljoin(url,n.attrs.get('href','')),'municipal')
        title=text(single(n,cls='title'));reg=registration(title)
        if not reg:raise ValueError('Missing municipal registration')
        tables=nodes(n,cls='info-list');cells=nodes(tables[0],tag='td') if tables else []
        images=nodes(n,tag='img')
        cards.append(Card('municipal',target,title,'house',reg,literal_price(cells[0]) if cells else None,
                          urljoin(url,images[0].attrs.get('src','')) if images else None))
    if not m or not cards or len(cards)!=int(m[1]) or len(cards)>100:raise ValueError('Incomplete/empty municipal inventory or new pagination requires review')
    if any('page=' in n.attrs.get('href','') or '/search/page/' in n.attrs.get('href','') for n in nodes(root,tag='a')):raise ValueError('New municipal pagination requires review')
    if len({c.registration for c in cards})!=len(cards):raise ValueError('Duplicate municipal registration in index')
    return IndexPage(tuple(cards),int(m[1]),(1,))


def parse_rakuen_index(html,url=RAKUEN_INDEX):
    current=rakuen_page(url);root=document(html)
    controls=nodes(root,cls='searchControl')
    counts={int(m[1]) for n in controls for m in [re.search(r'全\s*([0-9]+)\s*件',text(n))] if m}
    if len(counts)!=1:raise ValueError('Missing/conflicting Rakuen inventory total')
    total=counts.pop()
    if not 1<=total<=600:raise ValueError('Empty/excessive Rakuen Iizuna inventory requires review')
    cards=[]
    kinds={'中古住宅':'house','貸家':'rent','住宅用土地':'land','別荘用土地':'land','自然林等':'land','売土地':'land','貸店舗':'rent','店舗事務所':'rent'}
    for n in nodes(root,cls='boxStyleE'):
        label=clean_text(text(single(n,tag='h2')))
        if label not in kinds:raise ValueError('Unknown Rakuen property category')
        heading=single(n,tag='h3');link=single(heading,tag='a')
        target=listing_url(urljoin(url,link.attrs.get('href','')),'rakuen')
        prices=nodes(n,cls='price')
        raw=clean_text(text(prices[0])) if prices else ''
        try:asking=parse_price_jpy(raw+'万円') if raw not in {'','-','相談','応相談'} else None
        except ValueError:asking=None
        images=[img for img in nodes(n,tag='img') if '/img/bukken/' in img.attrs.get('src','')]
        cards.append(Card('rakuen',target,text(link),kinds[label],price=asking,thumbnail=images[0].attrs.get('src') if images else None))
    expected_pages=tuple(range(1,(total+49)//50+1));pages={current}
    for control in controls:
        for a in nodes(control,tag='a'):
            href=a.attrs.get('href','')
            if href and href!='#':pages.add(rakuen_page(urljoin(url,href)))
    if not cards or current not in expected_pages or not pages<=set(expected_pages):raise ValueError('Invalid Rakuen page coverage')
    if len(cards)!=min(50,total-(current-1)*50):raise ValueError('Truncated Rakuen index page')
    return IndexPage(tuple(cards),total,expected_pages)


def square_metres(raw):
    normalized=re.sub(r'm\s+2','m2',clean_text(raw or ''))
    values=re.findall(r'([0-9,]+(?:\.[0-9]+)?)\s*(?:m2|m²|㎡)',normalized,re.I)
    if len(values)!=1:return None
    value=Decimal(values[0].replace(',',''));return value if value>0 else None


def status(root,values):
    """Inspect listing headings/badges and actual status fields, not enquiry boilerplate."""
    labels=[]
    for n in root.walk():
        classes=n.attrs.get('class','').split()
        if any(re.search(r'(?:status|negoti|closed|sold|seiyaku|contract)',c,re.I) for c in classes):
            raw=text(n)
            if not raw:
                encoded=[c for c in classes if c!='status']
                if not encoded:continue
                raw=' '.join(encoded)
            labels.append(raw)
    labels.extend(v for k,v in values.items() if k in {'状況','状態','取引状況','公開状況','現況'} and v and clean_text(v) not in {'居住中','空き家','空室'})
    labels.extend(text(n) for n in nodes(root,tag='h2') if re.search('交渉中|商談中|成約済|売却済|取下|受付終了',text(n)))
    publication,availability=ListingStatus.ACTIVE,AvailabilityStatus.ACTIVE
    normalized=clean_text(' / '.join(dict.fromkeys(labels)))
    if re.search('交渉中|商談中|negoti',normalized,re.I):availability=AvailabilityStatus.UNDER_NEGOTIATION
    elif re.search('成約済|売却済|契約済|sold|closed',normalized,re.I):publication,availability=ListingStatus.SOLD,AvailabilityStatus.SOLD
    elif re.search('取下|取り下|募集終了|公開終了',normalized):publication,availability=ListingStatus.WITHDRAWN,AvailabilityStatus.WITHDRAWN
    elif re.search('内覧.*終了|見学.*終了|受付終了',normalized):availability=AvailabilityStatus.VIEWINGS_CLOSED
    elif normalized and normalized not in {'空き家','居住中','募集中','公開中','販売中'}:availability=AvailabilityStatus.UNKNOWN
    return publication,availability,None if normalized in {'','募集中','公開中','販売中'} else normalized


def parse_detail(card,html,checked):
    root=document(html)
    if card.provider=='municipal':
        scope=single(root,cls='property-info');title=card.title
        values,cells=fields(scope);reg=registration(title)
        headings=[text(n) for n in nodes(root,tag='h2') if registration(text(n))]
        if not headings or any(registration(h)!=card.registration for h in headings):raise ValueError('Municipal detail identity conflict')
        region=values.get('エリア');address=values.get('所在地')
        price=literal_price(cells['価格']) if '価格' in cells else None
        # Restriction badges can sit beside the title, outside the facts table.
        restrictions=root
        descriptions=[text(n) for n in nodes(scope,cls='caption')]
    else:
        candidates=[n for n in nodes(root,tag='table') if any(clean_text(text(x))=='物件番号' for x in nodes(n,tag='th'))]
        scope=single(root,cls='dmbs-content') if nodes(root,cls='dmbs-content') else root
        if len(candidates)!=1:raise ValueError('Missing unique Rakuen property facts table')
        values,cells=fields(candidates[0]);reg=registration(values.get('管理番号'))
        number=card.url.rstrip('/').split('/')[-1]
        if clean_text(values.get('物件番号',''))!=number:raise ValueError('Rakuen detail identity conflict')
        hs=[text(n) for n in nodes(root,tag='h1') if text(n)]
        if len(hs)!=1 or not hs[0].startswith('中古住宅'):raise ValueError('Rakuen detail not a sale house')
        title=hs[0];address=values.get('所在地');region=None
        price=literal_price(cells['価格']) if '価格' in cells else None
        restrictions=root
        descriptions=[text(n) for n in nodes(root,cls='text') if text(n)]
    if price is not None and card.price is not None and price!=card.price:raise ValueError('Iizuna index/detail price changed during acquisition')
    if not address or '飯綱町' not in address:raise ValueError('Property is not verified as Iizuna')
    if not values.get('構造') or not (values.get('間取') or values.get('間取り') or square_metres(values.get('建物面積'))):raise ValueError('Sale-building evidence missing')
    publication,availability,label=status(restrictions,values)
    area=re.sub(r'^.*?飯綱町(?:大字)?','',clean_text(address));area=re.split(r'[字0-9\s-]',area)[0] or None
    english=IIZUNA_LOCATIONS.get(area)
    conditions='\n'.join(k+'：'+values[k] for k in ['備考','備考／防災情報','補修の要否','土地権利','引渡/入居日'] if values.get(k)) or None
    facts=dict(values);facts['provider']=card.provider
    facts['provider_urls']=json.dumps({card.provider:card.url},ensure_ascii=False,sort_keys=True)
    facts['registration_number_raw']=values.get('管理番号') or card.title
    if reg:facts['municipal_registration']=reg
    if descriptions:facts['description_original_ja']='\n'.join(descriptions)
    # URL references only. No permission for image display or prose republication.
    if card.thumbnail:facts['image_candidate_url']=card.thumbnail
    if conditions and re.search(r'@|https?://|TEL|FAX|電話|☎',conditions,re.I):
        facts['conditions_review_required']='true'
        conditions='原掲載の条件をご確認ください（詳細は要確認）。'
    image=iizuna_images.municipal_photo_url(card.thumbnail) if iizuna_images.MUNICIPAL_IMAGES_APPROVED and card.provider=='municipal' else None
    if image:facts['image_verification']=iizuna_images.VERIFICATION
    identifier='reg-'+reg if reg else 'rakuen-'+card.url.rstrip('/').split('/')[-1]
    return Property(source_key=SOURCE,source_agency_name=AGENCY,source_website=MUNICIPAL_INDEX,
        original_listing_url=card.url,source_property_id=identifier,title_ja=title,title_en=None,description_ja=None,
        asking_price_jpy=price,address=address,municipality='Iizuna Town',area=area,area_en=english,
        region_ja=region,region_en=None,unmapped_locations=(area,) if area and not english else (),
        land_area_sqm=square_metres(values.get('土地面積')),building_area_sqm=square_metres(values.get('建物面積')),
        construction_date=construction_date(values.get('建築年') or values.get('完成年月')),construction_details=values.get('建築年') or values.get('完成年月') or None,
        building_age_years=None,floor_plan=values.get('間取り') or values.get('間取') or None,property_type=PropertyType.HOUSE,
        parking=values.get('駐車場') or None,first_discovered_at=checked,last_checked_at=checked,listing_status=publication,
        availability_status=availability,source_status_ja=label,transaction_type='sale',source_facts=facts,purchase_conditions_ja=conditions,main_image_url=image,
        image_permission='permitted' if image else 'unknown',content_rights_basis=iizuna_images.RIGHTS_BASIS if image else None)


def normalized_address(raw):
    value=re.sub(r'長野県|上水内郡|大字|\s','',clean_text(raw or ''))
    # Source spelling variants only; preserve the original Japanese address untouched.
    value=re.sub(r'(?<=[0-9])[‐‑‒–—−ーｰ](?=[0-9])','-',value)
    value=re.sub(r'字[^0-9]+(?=[0-9])','',value)
    return re.sub(r'番地?|号','',value)



def deduplicate_feeds(municipal,secondary):
    """Never merge merely similar addresses/prices; matching registration is primary."""
    groups={};duplicates=0
    for prop in municipal+secondary:
        key=prop.source_property_id
        if key.startswith('rakuen-'):
            # Fallback only for a missing registration: full address + both exact areas.
            matches=[k for k,p in groups.items() if normalized_address(p.address)==normalized_address(prop.address)
                     and re.search(r'[0-9]',normalized_address(prop.address)) and p.land_area_sqm is not None
                     and p.building_area_sqm is not None and p.land_area_sqm==prop.land_area_sqm and p.building_area_sqm==prop.building_area_sqm]
            if len(matches)==1:key=matches[0]
            elif len(matches)>1:raise ValueError('Ambiguous cross-feed property identity')
        if key not in groups:groups[key]=prop;continue
        primary=groups[key];duplicates+=1
        if (primary.source_facts or {}).get('provider')==(prop.source_facts or {}).get('provider'):
            raise ValueError('Duplicate provider registration requires review')
        if (primary.source_facts or {}).get('provider')=='rakuen' and (prop.source_facts or {}).get('provider')=='municipal':primary,prop=prop,primary
        primary_reg=(primary.source_facts or {}).get('municipal_registration');other_reg=(prop.source_facts or {}).get('municipal_registration')
        if primary_reg and other_reg and primary_reg!=other_reg:raise ValueError('Conflicting municipal registrations')
        addresses=[normalized_address(x.address) for x in (primary,prop)]
        conflict=(all(re.search(r'[0-9]',a) for a in addresses) and addresses[0]!=addresses[1])
        # Primary facts win; secondary only fills null factual values with provenance.
        merged={name:getattr(primary,name) if getattr(primary,name) is not None else getattr(prop,name) for name in ['asking_price_jpy','land_area_sqm','building_area_sqm','construction_date','construction_details','floor_plan','parking']}
        restricted=next((x for x in (primary,prop) if x.availability_status!=AvailabilityStatus.ACTIVE),None)
        facts=dict(primary.source_facts or {});urls=json.loads(facts.get('provider_urls','{}'));urls.update(json.loads((prop.source_facts or {}).get('provider_urls','{}')))
        facts['provider_urls']=json.dumps(urls,ensure_ascii=False,sort_keys=True)
        facts['secondary_facts']=json.dumps(prop.source_facts or {},ensure_ascii=False,sort_keys=True)
        facts['supplemented_fields']=json.dumps([n for n in merged if getattr(primary,n) is None and merged[n] is not None])
        notices='\n'.join(dict.fromkeys(x for x in [primary.purchase_conditions_ja,prop.purchase_conditions_ja] if x)) or None
        groups[key]=replace(primary,source_property_id=key,**merged,source_facts=facts,purchase_conditions_ja=notices,
            listing_status=restricted.listing_status if restricted else primary.listing_status,
            availability_status=AvailabilityStatus.UNKNOWN if conflict else restricted.availability_status if restricted else primary.availability_status,
            source_status_ja='登録番号・住所不一致（要確認）' if conflict else restricted.source_status_ja if restricted else primary.source_status_ja)
    return tuple(groups[k] for k in sorted(groups)),duplicates
