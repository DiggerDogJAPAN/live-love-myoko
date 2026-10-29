"""Cross-source duplicate evidence only: never merge identities or guess ownership."""
from dataclasses import dataclass,replace
import re,json
from .normalize import clean_text


def full_address(value):
    if not value:return None
    s=clean_text(value);s=re.sub(r'^(?:新潟県|長野県)','',s);s=s.replace('大字','')
    s=re.sub(r'[‐‑−ー－]', '-', s);s=re.sub(r'([0-9])(?:丁目|番地|番|号)',r'\1-',s);s=re.sub(r'\s','',s).strip('-')
    return s if re.search(r'[0-9]',s) else None


def candidates(prop,others):
    matches=[]
    for old in others:
        if prop.identity==old.identity or prop.municipality!=old.municipality:continue
        a,b=full_address(prop.address),full_address(old.address)
        exact=bool(a and b and a==b)
        areas=all(x is not None and x==y for x,y in ((prop.land_area_sqm,old.land_area_sqm),(prop.building_area_sqm,old.building_area_sqm)))
        same_price=prop.asking_price_jpy is not None and prop.asking_price_jpy==old.asking_price_jpy
        same_locality=prop.area is not None and prop.area==old.area
        if exact and areas or same_locality and areas and same_price:
            matches.append({'source_key':old.source_key,'source_property_id':old.source_property_id,'original_listing_url':old.original_listing_url,
                            'evidence':'full_address_and_both_areas' if exact and areas else 'locality_price_and_both_areas',
                            'price_agrees':same_price,'agency_agrees':bool((prop.source_facts or {}).get('agency_original_ja') and (prop.source_facts or {}).get('agency_original_ja')==(old.source_facts or {}).get('agency_original_ja')),
                            'decision':'review_required'})
    return sorted(matches,key=lambda x:(x['source_key'],x['source_property_id'] or '',x['original_listing_url']))


def annotate(properties,others):
    properties=tuple(properties);others=tuple(others)
    priority={'suumo':1,'rakusumu':2}
    result=[]
    for p in properties:
        matches=candidates(p,others+properties)
        # Existing municipal entries win; SUUMO precedes Rakusumu. Never hide
        # both portals just because they reference each other on subsequent runs.
        pending=any(priority.get(m['source_key'],0)<=priority.get(p.source_key,0) for m in matches)
        result.append(replace(p,source_facts={**(p.source_facts or {}),'duplicate_candidates':json.dumps(matches,ensure_ascii=False,sort_keys=True),'duplicate_review_pending':'true' if pending else 'false'}))
    return tuple(result)
