"""Essential development checks against real saved inventory; no fixture imports."""

import argparse
import json
from pathlib import Path
import sys
from dataclasses import replace
from datetime import timedelta

from myoko_property_crawler.customer import is_customer_eligible
from myoko_property_crawler.database import SOURCE, values_for_property, sync_database, prepare_sync, _apply
from myoko_property_crawler.db_connection import connect_database, load_settings, PreflightError
from myoko_property_crawler.storage import load_state
from myoko_property_crawler.locations import reviewed_location


def require(condition, message):
    if not condition:
        raise PreflightError(message)


def verify_updates(connection, state):
    """Exercise updates on one existing row, then roll back ALL test changes."""
    chosen=next(p for p in state.properties if is_customer_eligible(p) and p.asking_price_jpy is not None)
    eligible_count=sum(is_customer_eligible(p) for p in state.properties)
    from myoko_property_crawler.models import AvailabilityStatus
    before=connection.execute("""SELECT (SELECT count(*) FROM crawler.price_changes) AS prices,
        (SELECT count(*) FROM crawler.status_changes) AS statuses""").fetchone()
    with connection.transaction(force_rollback=True):
        timestamp=state.source_checked_at[SOURCE]+timedelta(seconds=1)
        changed=replace(chosen,asking_price_jpy=chosen.asking_price_jpy+1000,
            availability_status=AvailabilityStatus.UNDER_NEGOTIATION,source_status_ja='商談中',last_checked_at=timestamp)
        temporary=replace(state,properties=tuple(changed if p.identity==chosen.identity else p for p in state.properties),
            source_checked_at={**state.source_checked_at,SOURCE:timestamp})
        first=_apply(connection,*prepare_sync(temporary))
        require(first['updated']==1 and first['price_events_added']==1 and first['status_events_added']==1,
                'Price/status update did not produce exactly one event each')
        require(first['customer_properties']==eligible_count-1,'Negotiation update did not leave the customer view')
        restored=replace(chosen,last_checked_at=timestamp+timedelta(seconds=1))
        temporary=replace(state,properties=tuple(restored if p.identity==chosen.identity else p for p in state.properties),
            source_checked_at={**state.source_checked_at,SOURCE:restored.last_checked_at})
        second=_apply(connection,*prepare_sync(temporary))
        require(second['customer_properties']==eligible_count and second['status_events_added']==1
                and second['price_events_added']==1,'Confirmed active property did not reappear')
    after=connection.execute("""SELECT (SELECT count(*) FROM crawler.price_changes) AS prices,
        (SELECT count(*) FROM crawler.status_changes) AS statuses""").fetchone()
    require(before==after,'Rolled-back update test left history records behind')
    return {'price_change_recorded':True,'negotiation_hidden':True,'reactivation_visible':True,'all_test_changes_rolled_back':True}


def verify(state_path, repeat=False, updates=False):
    import psycopg
    state = load_state(state_path)
    props = [reviewed_location(p) for p in state.properties if p.source_key == SOURCE]
    expected = {p.original_listing_url for p in props if is_customer_eligible(p)}
    with connect_database(load_settings(), application_name='myoko-essential-verification') as connection:
        tables = connection.execute("""SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='crawler' AND c.relkind='r'""").fetchall()
        require({r['name'] for r in tables} == {'sources','properties','crawl_runs','price_changes','status_changes','translations'}, 'Unexpected application tables')
        require(all(r['rls'] and r['forced'] for r in tables), 'RLS missing from an internal table')
        rows = connection.execute('SELECT * FROM crawler.properties WHERE source_key=%s', (SOURCE,)).fetchall()
        require(len(rows) == len(props), 'Internal property count differs from the saved inventory')
        by_identity = {r['identity_token']:r for r in rows}
        require(len(by_identity) == len(props), 'Duplicate property identities')
        for p in props:
            row = by_identity[p.identity[1]]
            require(all(row[k] == v for k,v in values_for_property(p).items()), 'Stored property facts differ from saved inventory')
        require(connection.execute('SELECT count(*) AS n FROM crawler.sources WHERE synthetic').fetchone()['n'] == 0, 'Synthetic sources found')
        view_count = connection.execute('SELECT count(*) AS n FROM property_api.customer_properties').fetchone()['n']
        require(view_count == len(expected), 'Customer count differs from the eligible saved properties')
        roles = connection.execute("SELECT rolname,rolcanlogin,rolbypassrls FROM pg_roles WHERE rolname IN ('crawler_writer','crawler_customer_reader')").fetchall()
        require(len(roles)==2 and all(not r['rolcanlogin'] and not r['rolbypassrls'] for r in roles), 'Unexpected application role attributes')
        # This narrow administrator-only role switch grant is rolled back.
        # No permanent membership or customer/API grant is created.
        denied = []
        with connection.transaction(force_rollback=True):
            connection.execute('GRANT crawler_customer_reader TO postgres WITH INHERIT FALSE, SET TRUE')
            connection.execute('SET LOCAL ROLE crawler_customer_reader')
            customer = connection.execute('SELECT * FROM property_api.customer_properties').fetchall()
            require({r['original_pdf_url'] for r in customer} == expected, 'Reader exposed unavailable records or hid eligible records')
            require(all(r['publication_status']=='active' and r['availability_status']=='active'
                        and r['source_attribution']=='Source: Myoko Akiya Bank' for r in customer), 'Unsafe reader projection')
            require(not ({'id','source_property_id','source_key','identity_token','source_status_ja'} & set(customer[0])), 'Private columns exposed')
            for role in ('anon','authenticated'):
                connection.execute('SET LOCAL ROLE '+role)
                for target in ('crawler.properties','property_api.customer_properties'):
                    try:
                        with connection.transaction():
                            connection.execute('SELECT * FROM '+target+' LIMIT 1').fetchall()
                    except psycopg.errors.InsufficientPrivilege:
                        denied.append(role+':'+target)
                    else:
                        raise PreflightError('Unauthorized role could access '+target)
            connection.execute('RESET ROLE')
        result = {'tables':sorted(r['name'] for r in tables), 'internal_properties':len(rows),
            'customer_properties':view_count, 'unavailable_retained':len(rows)-view_count,
            'property_facts_match_local_state':True, 'all_tables_rls_enabled_and_forced':True,
            'restricted_reader_matches_eligible_inventory':True, 'private_customer_columns_absent':True,
            'access_denied':denied, 'synthetic_sources':0, 'tls_mode':'verify-full'}
        if repeat:
            before = connection.execute('SELECT count(*) AS n FROM crawler.crawl_runs WHERE source_key=%s', (SOURCE,)).fetchone()['n']
            repeat_result = sync_database(state_path)
            after_rows = connection.execute('SELECT id,identity_token FROM crawler.properties WHERE source_key=%s', (SOURCE,)).fetchall()
            after = connection.execute('SELECT count(*) AS n FROM crawler.crawl_runs WHERE source_key=%s', (SOURCE,)).fetchone()['n']
            require({r['identity_token']:r['id'] for r in after_rows} == {k:r['id'] for k,r in by_identity.items()}, 'Repeat sync changed stable UUIDs')
            require(repeat_result['already_applied'] and before==after, 'Repeat snapshot created another applied run')
            result.update(repeat_sync=repeat_result, stable_uuids_preserved=True, applied_runs=after)
        if updates:
            result['update_check']=verify_updates(connection,state)
        return result


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state',type=Path,default=Path('data/myoko-akiya-state.json'))
    parser.add_argument('--repeat-sync',action='store_true')
    parser.add_argument('--check-updates',action='store_true',help='Check one price/status transition inside a rollback transaction')
    args=parser.parse_args(argv)
    try:
        result=verify(args.state,args.repeat_sync,args.check_updates)
        Path('data/phase5-verification.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(result,indent=2))
        return 0
    except Exception as error:
        message=str(error) if isinstance(error,PreflightError) else 'Database verification failed; raw details suppressed'
        code=getattr(error,'sqlstate',None)
        print(message+(' [SQLSTATE '+code+']' if code and len(code)==5 and code.isalnum() else ''),file=sys.stderr)
        return 2


if __name__=='__main__':
    raise SystemExit(main())
