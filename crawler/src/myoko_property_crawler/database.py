"""Atomic, repeatable synchronization of reconciled local inventory to PostgreSQL.

This development CLI uses the existing private administrative connection. It is
not a website endpoint. Never infer disappearance from a sync input's omissions.
"""

from dataclasses import fields
from datetime import datetime, timezone
from enum import Enum
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

from .db_connection import PreflightError, connect_database, load_settings
from .models import ContentPermission, Property
from .locations import LOCATION_DISPLAY_FIELDS, reviewed_location
from .storage import load_state
from .sources import SOURCES, valid_property_number, allowed_listing_origin

SOURCE = 'myoko_akiya_bank'
PROPERTY_COLUMNS = tuple(f.name for f in fields(Property) if f.name not in ('source_agency_name', 'source_website'))
STATUS_COLUMNS = ('listing_status', 'availability_status', 'source_status_ja')


class SyncError(PreflightError):
    """Only deliberate, credential-safe error messages may reach the CLI."""


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(',', ':')).encode('utf-8')).hexdigest()


def prepare_sync(state, source_key=SOURCE):
    profile = SOURCES[source_key]
    properties = sorted((reviewed_location(p) for p in state.properties if p.source_key == source_key), key=lambda p: p.identity)
    if not properties:
        raise SyncError('No source records found; nothing synchronized')
    checked_at = state.source_checked_at.get(source_key)
    if checked_at is None or any(p.last_checked_at > checked_at for p in properties):
        raise SyncError('State source checkpoint is missing or predates its property observations')
    for p in properties:
        url = urlsplit(p.original_listing_url)
        if (p.source_agency_name != profile.agency
                or not allowed_listing_origin(profile, p.original_listing_url)
                or 'fixture' in url.path.lower() or not p.source_property_id or not valid_property_number(source_key, p.source_property_id)
                or p.image_permission == ContentPermission.SYNTHETIC
                or p.description_permission == ContentPermission.SYNTHETIC):
            raise SyncError('Only reviewed real source inventory is accepted; fixture/source mismatch rejected')
    if source_key in {'suumo','rakusumu'} and any((p.source_facts or {}).get('duplicate_review_pending') not in {'true','false'} for p in properties):
        raise SyncError('Portal inventory requires duplicate review classification')
    if source_key in {'suumo','rakusumu'} and any((p.source_facts or {}).get('portal_inventory_complete')!='true' for p in properties):
        raise SyncError('Partial portal inventory rejected')
    if source_key == 'iizuna_akiya_bank' and any((p.source_facts or {}).get('inventory_complete') != 'true' for p in properties):
        raise SyncError('Partial Iizuna previews cannot be synced; both feeds must validate')
    events = sorted((e for e in state.price_changes if e.source_key == source_key),
                    key=lambda e: (e.detected_at, e.identity_token, e.old_price_jpy, e.new_price_jpy, e.original_listing_url))
    identities = {p.identity[1]: p for p in properties}
    for e in events:
        prop = identities.get(e.identity_token)
        if (prop is None or e.old_price_jpy == e.new_price_jpy
                or e.detected_at > prop.last_checked_at or e.detected_at < prop.first_discovered_at):
            raise SyncError('Price history does not match the retained inventory observations')
    snapshot = digest({'source': source_key, 'checked_at': checked_at.isoformat(),
        'properties': [p.to_dict() for p in properties], 'price_changes': [e.to_dict() for e in events]})
    return properties, events, checked_at, snapshot


def values_for_property(prop):
    values = {}
    for name in PROPERTY_COLUMNS:
        value = getattr(prop, name)
        if isinstance(value, dict):
            from psycopg.types.json import Jsonb
            value = Jsonb(value)
        elif isinstance(value, Enum):
            value = value.value
        elif isinstance(value, tuple):
            value = list(value)
        values[name] = value
    return values


def history_covers_transition(old, prop, events):
    price = old['asking_price_jpy']
    for event in events:
        if old['last_checked_at'] < event.detected_at <= prop.last_checked_at and event.old_price_jpy == price:
            price = event.new_price_jpy
    return price == prop.asking_price_jpy


def _count(connection, source_key=SOURCE):
    duplicate_gate = " AND NOT p.portal_duplicate_review_pending AND p.municipality IN ('Myoko','Shinano Town')" if source_key in {'suumo','rakusumu'} else ''
    return connection.execute("""SELECT
        (SELECT count(*) FROM crawler.properties WHERE source_key=%s) AS internal_properties,
        (SELECT count(*) FROM crawler.properties p JOIN crawler.sources s USING(source_key)
         WHERE p.source_key=%s AND NOT s.synthetic AND crawler.source_customer_eligible(
             p.source_key,p.listing_status,p.availability_status,p.source_status_ja,p.transaction_type,p.property_type)"""+duplicate_gate+""" ) AS customer_properties""", (source_key,source_key)).fetchone()


def _apply(connection, properties, events, checked_at, snapshot, *, complete=False, warnings=(), source_key=SOURCE, records_extracted=None):
    from psycopg.types.json import Jsonb
    profile = SOURCES[source_key]
    if any(p.source_key != source_key for p in properties) or any(e.source_key != source_key for e in events):
        raise SyncError('Cross-source apply rejected')
    now = datetime.now(timezone.utc)
    with connection.transaction():
        connection.execute("SET LOCAL search_path=pg_catalog")
        connection.execute("SET LOCAL lock_timeout='10s'")
        connection.execute("SET LOCAL statement_timeout='60s'")
        identity = connection.execute("SELECT current_database() AS db, current_user AS actor").fetchone()
        if identity['db'] != 'postgres' or identity['actor'] not in {'postgres', 'crawler_writer'}:
            raise SyncError('Expected the configured database and an approved sync identity')
        websites = {p.source_website for p in properties}
        if len(websites) != 1:
            raise SyncError('Conflicting source websites in local inventory')
        if identity['actor'] == 'postgres' and source_key == SOURCE:
            connection.execute("""INSERT INTO crawler.sources (source_key,agency_name,website,access_notes,
                content_rights_basis,permissions,crawl_config)
                VALUES (%s,'Myoko Akiya Bank',%s,%s,%s,%s,%s) ON CONFLICT (source_key) DO NOTHING""",
                (source_key, properties[0].source_website,
                 'Saved HTML-card inventory sync only; no network requests or scheduled crawling enabled.',
                 'User confirmed permission for this project; individual records retain their recorded rights basis.',
                 Jsonb({'project_permission_confirmed': True}), Jsonb({'input': 'reconciled_local_json'})))
        # The source-row lock serializes concurrent imports and run/history keys.
        source = connection.execute('SELECT * FROM crawler.sources WHERE source_key=%s FOR UPDATE', (source_key,)).fetchone()
        if source is None:
            raise SyncError('Source must be provisioned before routine crawler sync')
        if source['agency_name'] != profile.agency or source['website'] not in websites or source['synthetic']:
            raise SyncError('Existing source metadata conflicts with the real inventory; import rolled back')
        key = 'json-sync:v1:' + snapshot
        run = connection.execute('SELECT * FROM crawler.crawl_runs WHERE source_key=%s AND idempotency_key=%s',
                                 (source_key,key)).fetchone()
        if run and run['status'] in ('partial','complete'):
            return {**_count(connection, source_key), 'already_applied': True, 'inserted': 0, 'updated': 0,
                    'price_events_added': 0, 'status_events_added': 0, 'snapshot_sha256': snapshot}
        if source['last_successful_check_at'] and checked_at < source['last_successful_check_at']:
            raise SyncError('Input is older than the last successful source sync; no changes applied')
        if run:
            run_id = run['id']
            connection.execute("""UPDATE crawler.crawl_runs SET status='running',started_at=%s,checked_at=NULL,
                finished_at=NULL,error_summary=NULL WHERE id=%s""", (now,run_id))
        else:
            run_id = connection.execute("""INSERT INTO crawler.crawl_runs
                (source_key,idempotency_key,snapshot_sha256,started_at,status)
                VALUES (%s,%s,%s,%s,'running') RETURNING id""", (source_key,key,snapshot,now)).fetchone()['id']
        existing = {p['identity_token']: p for p in connection.execute(
            'SELECT * FROM crawler.properties WHERE source_key=%s FOR UPDATE', (source_key,)).fetchall()}
        existing_urls = {p['original_listing_url']: p['identity_token'] for p in existing.values()}
        by_identity = {}
        for event in events:
            by_identity.setdefault(event.identity_token, []).append(event)
        inserted = updated = price_events = status_events = 0
        property_ids = {}
        # Release revised existing URLs before a new listing can claim one.
        # The ownership guard and database unique constraint remain in force.
        for prop in sorted(properties,key=lambda p:p.identity[1] not in existing):
            token = prop.identity[1]
            old = existing.get(token)
            if prop.original_listing_url in existing_urls and existing_urls[prop.original_listing_url] != token:
                raise SyncError('Listing URL ownership conflict: source='+source_key+' url='+prop.original_listing_url+' existing_identity='+existing_urls[prop.original_listing_url]+' incoming_identity='+token)
            values = values_for_property(prop)
            if old:
                if prop.last_checked_at < old['last_checked_at']:
                    raise SyncError('An incoming property observation is older than its stored version')
                # Preserve database identity and the original discovery date.
                values['first_discovered_at'] = old['first_discovered_at']
                changed_fields = {k for k,v in values.items() if old[k] != (prop.source_facts if k == 'source_facts' else v)}
                changes = bool(changed_fields)
                display_only = changed_fields <= set(LOCATION_DISPLAY_FIELDS)
                if changes and not display_only and prop.last_checked_at == old['last_checked_at']:
                    raise SyncError('Conflicting facts share the same observation timestamp; no changes applied')
                property_id = old['id']
                if changes:
                    if display_only:
                        assignments = ','.join(name+'=%s' for name in LOCATION_DISPLAY_FIELDS)
                        connection.execute('UPDATE crawler.properties SET '+assignments+' WHERE id=%s',
                            (*(values[name] for name in LOCATION_DISPLAY_FIELDS),property_id))
                    else:
                        seen = prop.last_checked_at if prop.listing_status.value != 'not_found' else old['last_seen_at']
                        assignments = ','.join(name+'=%s' for name in PROPERTY_COLUMNS)
                        connection.execute('UPDATE crawler.properties SET '+assignments+',last_seen_at=%s WHERE id=%s',
                                           (*values.values(), seen, property_id))
                    updated += 1
                    if tuple(old[k] for k in STATUS_COLUMNS) != tuple(values[k] for k in STATUS_COLUMNS):
                        connection.execute("""INSERT INTO crawler.status_changes
                            (property_id,source_key,crawl_run_id,old_listing_status,new_listing_status,
                             old_availability_status,new_availability_status,old_source_status_ja,new_source_status_ja,detected_at)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (property_id,crawl_run_id) DO NOTHING""",
                            (property_id,source_key,run_id,old['listing_status'],values['listing_status'],
                             old['availability_status'],values['availability_status'],old['source_status_ja'],
                             values['source_status_ja'],prop.last_checked_at))
                        status_events += 1
                    if (old['asking_price_jpy'] is not None and prop.asking_price_jpy is not None
                            and old['asking_price_jpy'] != prop.asking_price_jpy
                            and not history_covers_transition(old,prop,by_identity.get(token,()))):
                        connection.execute("""INSERT INTO crawler.price_changes
                            (property_id,source_key,crawl_run_id,original_listing_url,old_price_jpy,new_price_jpy,detected_at)
                            VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (property_id,crawl_run_id) DO NOTHING""",
                            (property_id,source_key,run_id,prop.original_listing_url,old['asking_price_jpy'],prop.asking_price_jpy,prop.last_checked_at))
                        price_events += 1
            else:
                columns = ','.join(PROPERTY_COLUMNS)+',last_seen_at'
                placeholders = ','.join(['%s']*(len(PROPERTY_COLUMNS)+1))
                seen = prop.last_checked_at if prop.listing_status.value != 'not_found' else None
                property_id = connection.execute('INSERT INTO crawler.properties ('+columns+') VALUES ('+
                    placeholders+') RETURNING id', (*values.values(),seen)).fetchone()['id']
                inserted += 1
            if old and old['original_listing_url']!=prop.original_listing_url:
                existing_urls.pop(old['original_listing_url'],None)
            existing_urls[prop.original_listing_url]=token
            property_ids[token] = property_id
        # Import original local events once; never fabricate historical crawl IDs.
        for event in events:
            result = connection.execute("""INSERT INTO crawler.price_changes (property_id,source_key,legacy_event_key,
                original_listing_url,old_price_jpy,new_price_jpy,detected_at) SELECT %s,%s,%s,%s,%s,%s,%s
                WHERE NOT EXISTS (SELECT 1 FROM crawler.price_changes WHERE property_id=%s
                    AND old_price_jpy=%s AND new_price_jpy=%s AND detected_at=%s)
                ON CONFLICT (property_id,legacy_event_key) DO NOTHING""",
                (property_ids[event.identity_token],source_key,digest(event.to_dict()),event.original_listing_url,
                 event.old_price_jpy,event.new_price_jpy,event.detected_at,
                 property_ids[event.identity_token],event.old_price_jpy,event.new_price_jpy,event.detected_at))
            price_events += result.rowcount
        summary = {'inserted': inserted, 'updated': updated, 'price_events_added': price_events,
            'status_events_added': status_events, 'source_observed_at': checked_at.isoformat(),
            'absence_inference': complete, 'input': 'validated_html_index' if complete else 'reconciled_local_json'}
        if source_key in {'iizuna_akiya_bank','suumo','rakusumu'} and properties:
            current = next((p for p in properties if p.last_checked_at == checked_at and p.listing_status.value != 'not_found'), properties[0])
            summary['feed_summary'] = json.loads((current.source_facts or {}).get('feed_summary', '{}'))
        finished = datetime.now(timezone.utc)
        connection.execute("""UPDATE crawler.crawl_runs SET status=%s,warnings=%s,checked_at=%s,finished_at=%s,
            records_extracted=%s,records_processed=%s,summary=%s WHERE id=%s""",
            ('complete' if complete else 'partial',list(warnings),finished,finished,len(properties) if records_extracted is None else records_extracted,len(properties),Jsonb(summary),run_id))
        connection.execute('UPDATE crawler.sources SET last_successful_check_at=%s WHERE source_key=%s', (checked_at,source_key))
        if complete:
            connection.execute('UPDATE crawler.sources SET last_complete_check_at=%s WHERE source_key=%s', (checked_at,source_key))
        return {**_count(connection, source_key), **summary, 'already_applied': False, 'snapshot_sha256': snapshot}


def sync_database(path: Path, env_file: Path = Path('.env.supabase.local'), source_key=SOURCE):
    """Sync one atomic state snapshot; return only operational counts, not secrets."""
    # Read one immutable byte snapshot, rather than multiple racing file reads.
    state = load_state(path)
    properties, events, checked_at, snapshot = prepare_sync(state,source_key)
    settings = load_settings(env_file)
    connection = connect_database(settings)
    try:
        return _apply(connection, properties, events, checked_at, snapshot,source_key=source_key)
    except Exception as error:
        code = getattr(error, 'sqlstate', '') or ''
        safe_code = code if re.fullmatch('[0-9A-Z]{5}', code) else 'client'
        message = str(error) if isinstance(error, SyncError) else {
            '23505': 'Duplicate source identity or URL conflict', '23514': 'Property/schema validation failed',
            '23503': 'Related source/property/run is missing', '42501': 'Database privileges are insufficient',
            '55P03': 'Another sync holds the source lock; retry later',
        }.get(code, 'Database sync failed; check connectivity or schema compatibility')
        # Apply rolled back as a unit. Record a safe failure summary separately
        # only when this source already exists; retry reuses this run key.
        try:
            from psycopg.types.json import Jsonb
            now = datetime.now(timezone.utc)
            connection.execute("""INSERT INTO crawler.crawl_runs
                (source_key,idempotency_key,snapshot_sha256,started_at,finished_at,status,error_summary,summary)
                SELECT source_key,%s,%s,%s,%s,'failed',%s,%s FROM crawler.sources WHERE source_key=%s
                ON CONFLICT (source_key,idempotency_key) DO NOTHING""",
                ('json-sync:v1:'+snapshot,snapshot,now,now,message+' ['+safe_code+']',
                 Jsonb({'input':'reconciled_local_json','records_requested':len(properties)}),source_key))
        except Exception:
            pass  # A disconnected database cannot log a failure; CLI still fails.
        raise SyncError(message+' ['+safe_code+']; property changes rolled back') from None
    finally:
        try:
            connection.close()
        except Exception:
            pass
