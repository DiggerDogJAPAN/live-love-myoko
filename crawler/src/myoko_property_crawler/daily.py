"""Daily Myoko acquisition: PostgreSQL is the durable inventory, never runner disk."""
from dataclasses import fields
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from uuid import uuid4

from .changes import State
from .database import SOURCE, _apply, prepare_sync
from .db_connection import PreflightError, connect_database, load_settings
from .live import HTMLClient, USER_AGENT, crawl_live
from .models import Property


def database_state(connection):
    source = connection.execute("SELECT * FROM crawler.sources WHERE source_key=%s", (SOURCE,)).fetchone()
    if not source or source['synthetic'] or source['agency_name'] != 'Myoko Akiya Bank':
        raise PreflightError('Expected the provisioned real Myoko source')
    columns = [f.name for f in fields(Property) if f.name not in ('source_agency_name', 'source_website')]
    rows = connection.execute('SELECT '+','.join(columns)+' FROM crawler.properties WHERE source_key=%s', (SOURCE,)).fetchall()
    properties = tuple(Property(**dict(row, source_agency_name=source['agency_name'], source_website=source['website'])) for row in rows)
    checked = source['last_successful_check_at']
    if not properties or not checked or any(p.last_checked_at > checked for p in properties):
        raise PreflightError('Database baseline is empty or inconsistent; refusing an unseeded daily crawl')
    return State(properties, (), {SOURCE: checked})


def apply_live(connection, state, *, client=None):
    result = crawl_live(state, client=client)
    if not result.complete:
        raise PreflightError('Partial snapshot rejected; all existing property records preserved')
    props, events, checked, snapshot = prepare_sync(result.reconciliation.state)
    return _apply(connection, props, events, checked, snapshot, complete=True, warnings=result.warnings)


def main():
    connection = None
    try:
        connection = connect_database(load_settings(Path('.env.supabase.local')))
        lock = connection.execute("SELECT pg_try_advisory_lock(hashtext(%s)) AS acquired", ('myoko-daily',)).fetchone()
        if not lock['acquired']:
            raise PreflightError('Another daily crawler is running')
        state = database_state(connection)
        result = apply_live(connection, state, client=HTMLClient(user_agent=os.getenv('MYOKO_USER_AGENT', USER_AGENT)))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:
        message = str(error) if isinstance(error, PreflightError) else 'Crawler operation failed; no incomplete snapshot applied'
        if connection is not None:
            try:
                now = datetime.now(timezone.utc)
                connection.execute("""INSERT INTO crawler.crawl_runs
                    (source_key,idempotency_key,started_at,finished_at,status,error_summary)
                    VALUES (%s,%s,%s,%s,'failed',%s)""", (SOURCE,'daily-failed:'+str(uuid4()),now,now,message))
            except Exception:
                pass
        print(json.dumps({'status':'failed','error':message}), flush=True)
        return 2
    finally:
        if connection is not None:
            connection.close()


if __name__ == '__main__':
    raise SystemExit(main())
