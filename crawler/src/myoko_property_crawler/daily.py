"""Independent source acquisition: PostgreSQL is the durable inventory, never runner disk."""
from dataclasses import fields
from datetime import datetime, timezone
import json
import argparse
import os
import re
from urllib.error import HTTPError, URLError
from pathlib import Path
from uuid import uuid4

from .changes import State
from .database import SOURCE, _apply, prepare_sync
from .db_connection import PreflightError, connect_database, load_settings
from .live import HTMLClient, USER_AGENT, crawl_live
from .models import Property
from .sources import SOURCES
from .shinano_live import crawl_shinano, ShinanoClient


def database_state(connection, source_key=SOURCE):
    profile=SOURCES[source_key]
    source = connection.execute("SELECT * FROM crawler.sources WHERE source_key=%s", (source_key,)).fetchone()
    if not source or source['synthetic'] or source['agency_name'] != profile.agency or source['website'] != profile.website:
        raise PreflightError('Expected the provisioned real source')
    columns = [f.name for f in fields(Property) if f.name not in ('source_agency_name', 'source_website')]
    rows = connection.execute('SELECT '+','.join(columns)+' FROM crawler.properties WHERE source_key=%s', (source_key,)).fetchall()
    properties = tuple(Property(**dict(row, source_agency_name=source['agency_name'], source_website=source['website'])) for row in rows)
    checked = source['last_successful_check_at']
    if not properties and checked is None and source_key == 'shinano_akiya_bank' and source['crawl_config'].get('allow_initial_empty') is True:
        return State()
    if not properties or not checked or any(p.last_checked_at > checked for p in properties):
        raise PreflightError('Database baseline is empty or inconsistent; refusing an unseeded daily crawl')
    return State(properties, (), {source_key: checked})


def apply_live(connection, state, *, client=None, source_key=SOURCE):
    try:
        result = (crawl_live if source_key == SOURCE else crawl_shinano)(state, client=client)
    except ValueError as error:
        raise PreflightError('Source validation failed: '+str(error)) from None
    except HTTPError as error:
        raise PreflightError('Source returned HTTP '+str(error.code)+'; no bypass attempted') from None
    except URLError:
        raise PreflightError('Source network/TLS request failed') from None
    if not result.complete:
        raise PreflightError('Partial snapshot rejected; all existing property records preserved')
    props, events, checked, snapshot = prepare_sync(result.reconciliation.state,source_key)
    return _apply(connection, props, events, checked, snapshot, complete=True, warnings=result.warnings, source_key=source_key, records_extracted=result.records_extracted)


def main(argv=None):
    parser=argparse.ArgumentParser(description='Run one source independently')
    parser.add_argument('--source',choices=tuple(SOURCES),default=SOURCE)
    source_key=parser.parse_args(argv).source
    connection = None
    try:
        connection = connect_database(load_settings(Path('.env.supabase.local')))
        lock = connection.execute("SELECT pg_try_advisory_lock(hashtext(%s)) AS acquired", ('property-daily:'+source_key,)).fetchone()
        if not lock['acquired']:
            raise PreflightError('Another daily crawler is running')
        state = database_state(connection,source_key)
        client_type=HTMLClient if source_key == SOURCE else ShinanoClient
        result = apply_live(connection, state, client=client_type(user_agent=os.getenv('MYOKO_USER_AGENT', USER_AGENT)),source_key=source_key)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:
        code = getattr(error, 'sqlstate', '') or ''
        code = code if re.fullmatch('[0-9A-Z]{5}', code) else type(error).__name__
        message = str(error) if isinstance(error, PreflightError) else 'Crawler operation failed ['+code+']; no incomplete snapshot applied'
        if connection is not None:
            try:
                now = datetime.now(timezone.utc)
                connection.execute("""INSERT INTO crawler.crawl_runs
                    (source_key,idempotency_key,started_at,finished_at,status,error_summary)
                    VALUES (%s,%s,%s,%s,'failed',%s)""", (source_key,'daily-failed:'+str(uuid4()),now,now,message))
            except Exception:
                pass
        print(json.dumps({'status':'failed','error':message}), flush=True)
        return 2
    finally:
        if connection is not None:
            connection.close()


if __name__ == '__main__':
    raise SystemExit(main())
