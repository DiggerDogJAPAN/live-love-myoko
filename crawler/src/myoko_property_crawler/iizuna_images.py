"""Authorised municipal card photos only; Rakuen photographs remain private."""
import re
from urllib.parse import urlsplit,unquote

MUNICIPAL_IMAGES_APPROVED=True  # User confirmed photograph display/hotlinking, 2026-10-29.
RIGHTS_BASIS='User confirmed municipal photograph display and direct hotlink permission on 2026-10-29. Original municipal primary-card URLs only; no downloading, copying or rehosting. Rakuen images are not authorised.'
VERIFICATION='municipal_primary_card_v1'


def municipal_photo_url(candidate):
    if not candidate:return None
    u=urlsplit(candidate)
    if (u.scheme!='https' or u.netloc!='www.town.iizuna.nagano.jp' or u.query or u.fragment
            or not u.path.startswith('/fs/') or not re.search(r'\.(?:jpe?g|png|webp)$',u.path,re.I)
            or re.search(r'成約|間取|平面|地図|sold|closed|seiyaku|floor.?plan|madori|no.?image|placeholder|logo|icon',unquote(u.path),re.I)):
        return None
    return candidate


def public_photo(prop):
    facts=prop.source_facts or {};u=urlsplit(prop.original_listing_url)
    if (not MUNICIPAL_IMAGES_APPROVED or prop.image_permission.value!='permitted'
            or facts.get('provider')!='municipal' or facts.get('image_verification')!=VERIFICATION
            or facts.get('image_candidate_url')!=prop.main_image_url
            or u.scheme!='https' or u.netloc!='www.town.iizuna.nagano.jp'
            or not re.fullmatch(r'/ijuportal/live/sale/[0-9]+\.html',u.path)):
        return None
    return municipal_photo_url(prop.main_image_url)
