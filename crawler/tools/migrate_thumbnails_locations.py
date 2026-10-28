"""Apply upgrade 002 and derived English backfill atomically, over verified TLS.

No media URLs are requested, fetched, copied or rehosted. No observation times
are changed. Repeating this upgrade is safe and uses the same reviewed dictionary.
"""

import hashlib
import json
from pathlib import Path
import sys
import tempfile

from myoko_property_crawler.customer import is_customer_eligible
from myoko_property_crawler.db_connection import PreflightError, connect_database, load_settings
from myoko_property_crawler.locations import LOCATION_DISPLAY_FIELDS, LOCATION_DICTIONARY_VERSION, reviewed_location, location_display_values
from myoko_property_crawler.storage import load_state

SOURCE = 'myoko_akiya_bank'
SQL_PATH = Path('sql/migrations/002_thumbnails_english_locations.sql')


def require(value, message):
    if not value:
        raise PreflightError(message)


def display_values(row):
    if row['source_key']!=SOURCE or row['municipality']!='Myoko':
        return {key:row[key] for key in LOCATION_DISPLAY_FIELDS}
    return location_display_values(row['area'],row['unmapped_locations'])


def apply_upgrade():
    from psycopg.types.json import Jsonb
    settings = load_settings()
    sql = SQL_PATH.read_text(encoding='utf-8')
    state = load_state(Path('data/myoko-akiya-state.json'))
    expected = {p.original_listing_url:reviewed_location(p) for p in state.properties if is_customer_eligible(p)}
    with connect_database(settings,application_name='myoko-upgrade-002') as connection:
        with connection.transaction():
            identity = connection.execute('SELECT current_database() AS db,current_user AS actor').fetchone()
            require(identity=={'db':'postgres','actor':'postgres'},'Unexpected migration database/actor')
            connection.execute("SET LOCAL lock_timeout='5s'")
            connection.execute("SET LOCAL statement_timeout='60s'")
            source = connection.execute('SELECT * FROM crawler.sources WHERE source_key=%s FOR UPDATE',(SOURCE,)).fetchone()
            require(source and source['agency_name']=='Myoko Akiya Bank' and not source['synthetic'],'Unexpected source metadata')
            before = connection.execute('SELECT * FROM crawler.properties WHERE source_key=%s FOR UPDATE',(SOURCE,)).fetchall()
            require(len(before)==len(state.properties),'Saved inventory differs in size; review input before backfilling')
            old_view = connection.execute("SELECT pg_get_viewdef('property_api.customer_properties'::regclass,true) AS definition").fetchone()
            before_links = {r['original_pdf_url'] for r in connection.execute('SELECT original_pdf_url FROM property_api.customer_properties').fetchall()}
            require(before_links==set(expected),'Customer inventory differs from the saved snapshot')
            Path('data').mkdir(exist_ok=True)
            with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir='data',prefix='upgrade-002-before-',suffix='.json',delete=False) as backup:
                json.dump({'properties':before,'source':source,'view':old_view},backup,ensure_ascii=False,indent=2,default=str)
                backup_path = backup.name
            connection.execute(sql,prepare=False)
            changed = 0
            for row in before:
                values = display_values(row)
                if any(row[key]!=value and not (key=='unmapped_locations' and row[key]==list(value)) for key,value in values.items()):
                    connection.execute('UPDATE crawler.properties SET area_en=%s,title_en=%s,unmapped_locations=%s WHERE id=%s',
                        (values['area_en'],values['title_en'],list(values['unmapped_locations']),row['id']))
                    changed += 1
            connection.execute('UPDATE crawler.sources SET permissions=permissions || %s WHERE source_key=%s',
                (Jsonb({'photograph_display':{'permitted':True,'confirmed_on':'2026-10-28',
                    'scope':'Display original Myoko Akiya Bank thumbnail URLs; no copying, rehosting or PDF extraction.'}}),SOURCE))
            after = connection.execute('SELECT * FROM crawler.properties WHERE source_key=%s',(SOURCE,)).fetchall()
            originals = {row['id']:row for row in before}
            require(all(all(row[k]==v for k,v in originals[row['id']].items() if k not in LOCATION_DISPLAY_FIELDS)
                        for row in after),'A source fact, UUID or observation timestamp changed')
            require(all(row['area_en']==display_values(row)['area_en'] for row in after),'Location backfill differs from dictionary')
            # Role switches and negative checks live in a rollback savepoint:
            # only the one narrow SELECT grant in the migration persists.
            with connection.transaction(force_rollback=True):
                connection.execute('GRANT crawler_customer_reader TO postgres WITH INHERIT FALSE,SET TRUE')
                connection.execute('SET LOCAL ROLE crawler_customer_reader')
                customer = connection.execute('SELECT * FROM property_api.customer_properties').fetchall()
                require({r['original_pdf_url'] for r in customer}==before_links,'Eligibility changed')
                for row in customer:
                    prop = expected[row['original_pdf_url']]
                    require(row['thumbnail_url']==prop.main_image_url,'A thumbnail differs from its source listing')
                    require(row['location_ja']==prop.area and row['location_en']==prop.area_en,'English/Japanese location mismatch')
                    require(row['source_attribution']=='Source: Myoko Akiya Bank','Source attribution changed')
                    require(row['location_needs_review']==bool(prop.unmapped_locations),'Review flag mismatch')
                require(not connection.execute("SELECT has_schema_privilege(current_user,'crawler','USAGE') AS usage").fetchone()['usage'],
                        'Restricted reader unexpectedly gained private schema usage')
                import psycopg
                for role in ('anon','authenticated'):
                    connection.execute('SET LOCAL ROLE '+role)
                    for target in ('crawler.properties','property_api.customer_properties'):
                        try:
                            with connection.transaction():
                                connection.execute('SELECT * FROM '+target+' LIMIT 1')
                        except psycopg.errors.InsufficientPrivilege:
                            pass
                        else:
                            raise PreflightError('Unauthorized role can read protected data')
                connection.execute('RESET ROLE')
            # Verify disallowed permission flags yield a placeholder candidate,
            # without retaining any synthetic or changed source facts.
            with connection.transaction(force_rollback=True):
                chosen = next(row for row in after if row['original_listing_url'] in expected)
                connection.execute("UPDATE crawler.properties SET image_permission='synthetic' WHERE id=%s",(chosen['id'],))
                masked = connection.execute('SELECT thumbnail_url FROM property_api.customer_properties WHERE original_pdf_url=%s',
                    (chosen['original_listing_url'],)).fetchone()
                require(masked and masked['thumbnail_url'] is None,'Unpermitted image is not masked')
            report = {'migration':'002_thumbnails_english_locations','applied':True,
                'sql_sha256':hashlib.sha256(sql.encode()).hexdigest(),'dictionary_version':LOCATION_DICTIONARY_VERSION,
                'properties':len(after),'display_records_updated':changed,'known_english_locations':sum(bool(r['area_en']) for r in after),
                'unknown_locations':sorted({r['area'] for r in after if r['area'] and not r['area_en']}),
                'eligible_properties':len(customer),'eligible_with_permitted_thumbnails':sum(bool(r['thumbnail_url']) for r in customer),
                'eligible_with_verified_english':sum(bool(r['location_en']) for r in customer),
                'japanese_facts_and_observation_timestamps_preserved':True,'eligibility_preserved':True,
                'reader_access_verified':True,'anonymous_authenticated_denied':True,'unpermitted_thumbnail_masked':True,
                'tls_mode':'verify-full','backup':backup_path,'media_requests':0}
        # Receipt is written only after the transaction has committed.
        Path('data/upgrade-002-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        return report


def main():
    try:
        print(json.dumps(apply_upgrade(),ensure_ascii=False,indent=2))
        return 0
    except Exception as error:
        message = str(error) if isinstance(error,PreflightError) else 'Upgrade failed; raw database details suppressed'
        code = getattr(error,'sqlstate',None)
        print(message+(' [SQLSTATE '+code+']' if code and len(code)==5 and code.isalnum() else ''),file=sys.stderr)
        return 2


if __name__=='__main__':
    raise SystemExit(main())
