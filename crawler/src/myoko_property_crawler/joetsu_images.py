"""Select a source-captioned property photograph; never request image bytes."""
import re
from urllib.parse import unquote,urlsplit

RIGHTS_BASIS = 'User confirmed Joetsu property image display and direct hotlink permission on 2026-10-28; source-captioned photo URLs only, no copying or rehosting.'
BAD = re.compile(r'図|間取|平面|地図|配置|成約|交渉|seiyaku|sold|closed|floor.?plan|madori',re.I)
EXTERIOR = re.compile(r'^(?:(?:母屋|建物|物件|住宅|全体)[の：:]?)?(?:外観|正面|全景)')
INTERIOR = re.compile(r'^(?:[0-9]+階[：:]?\s*)?(?:玄関|居間|リビング|和室|洋室|台所|キッチン|浴室|風呂|寝室|ダイニング|洗面|室内)')


def asset_key(value):
    path=unquote(urlsplit(value or '').path)
    return re.sub(r'-(?:[0-9]+x[0-9]+|scaled)(?=\.[^.]+$)','',path)


def select_photo(body,candidate=None):
    from .adapters.joetsu_akiya_bank import nodes,text,thumbnail_url
    from .normalize import clean_text
    choices=[]
    for figure in nodes(body,tag='figure'):
        images=nodes(figure,tag='img');captions=nodes(figure,tag='figcaption')
        if len(images)!=1 or len(captions)!=1:
            continue
        caption=text(captions[0]);normalized=clean_text(caption)
        try:target=thumbnail_url(images[0].attrs.get('src'))
        except ValueError:continue
        if not target or BAD.search(normalized) or BAD.search(unquote(urlsplit(target).path)):
            continue
        priority=0 if EXTERIOR.search(normalized) else 1 if INTERIOR.search(normalized) else None
        if priority is not None:choices.append((priority,len(choices),target,caption))
    if not choices:return None
    _,_,target,caption=min(choices)
    try:approved_candidate=thumbnail_url(candidate)
    except ValueError:approved_candidate=None
    if approved_candidate and not BAD.search(unquote(urlsplit(approved_candidate).path)) and asset_key(approved_candidate)==asset_key(target):
        target=approved_candidate
    return {'photo_selected_url':target,'photo_caption_ja':caption,'photo_verification':'source_figure_caption_v1'}


def public_photo(prop):
    """The public export requires the same recorded evidence as database writes."""
    from .adapters.joetsu_akiya_bank import thumbnail_url
    facts=prop.source_facts or {}
    if (prop.image_permission.value != 'permitted' or not prop.main_image_url
            or facts.get('photo_selected_url') != prop.main_image_url
            or facts.get('photo_verification') != 'source_figure_caption_v1'):
        return None
    try:target=thumbnail_url(prop.main_image_url)
    except ValueError:return None
    return target if not BAD.search(unquote(urlsplit(target).path)) else None
