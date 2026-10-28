"""Migration 003: approved backup, atomic checks and private checksum ledger.
No crawler invocation or property import. Requires --apply for first installation.
"""
import argparse
from datetime import datetime,timezone
import hashlib,json,re
from pathlib import Path
from urllib.parse import urlsplit,unquote,parse_qs
import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from pglast import parse_sql,ast
from myoko_property_crawler.db_connection import load_settings,connect_database,PreflightError
from tools.backup_property_database import backup,write_private,TABLES
ROOT=Path(__file__).resolve().parents[1]
MIGRATION=ROOT/'sql/migrations/003_shinano_source.sql'
CHECKS=ROOT/'sql/tests/003_shinano_checks.sql'
NEW=['transaction_type','construction_details','source_facts']
VIEW_NEW=['municipality','property_type','transaction_type']

def require(ok,message):
 if not ok:raise PreflightError(message)

def env_values(path):
 return {k.strip():v.strip().strip('\"\'') for line in path.read_text().splitlines() if line.strip() and not line.lstrip().startswith('#') and '=' in line for k,v in [line.split('=',1)]}

def role_connection(dsn,settings,login):
 u=urlsplit(dsn);user=unquote(u.username or '')
 direct=u.hostname=='db.'+settings.project_ref+'.supabase.co' and user==login
 pool=re.fullmatch(r'[a-z0-9-]+\.pooler\.supabase\.com',u.hostname or '') and user==login+'.'+settings.project_ref
 require((direct or pool) and (u.port or 5432)==5432 and u.path=='/postgres','Restricted credential does not match intended project/login')
 require(not(set(parse_qs(u.query))-{'sslmode','sslrootcert'}),'Unexpected connection routing options')
 c=psycopg.connect(dsn,sslmode='verify-full',sslrootcert=settings.sslrootcert,autocommit=True,prepare_threshold=None,row_factory=dict_row,connect_timeout=15,application_name='myoko-003-'+login)
 require(c.pgconn.ssl_in_use,'Restricted connection lacks TLS')
 flags=c.execute('SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication FROM pg_roles WHERE rolname=session_user').fetchone()
 require(flags['rolname']==login and not any(v for k,v in flags.items() if k!='rolname'),'Unsafe login attributes')
 return c

def denied(c,query,codes=('42501',)):
 try:
  with c.transaction():c.execute(query)
 except psycopg.Error as e:require(e.sqlstate in codes,'Unexpected permission/constraint check error')
 else:raise PreflightError('Forbidden operation succeeded; verification stopped')

def view_rows(c):
 return [r['record'] for r in c.execute('SELECT (to_jsonb(t)-%s::text[])::text record FROM property_api.customer_properties t ORDER BY 1',(VIEW_NEW,)).fetchall()]

def reader_checks(c,expected,upgraded=True,real_login=True):
 require(view_rows(c)==expected,'Reader visibility or original projected facts changed')
 for table in TABLES+('schema_migrations',):denied(c,'SELECT * FROM crawler.'+table+' LIMIT 0')
 denied(c,'UPDATE crawler.properties SET asking_price_jpy=asking_price_jpy WHERE false')
 denied(c,'DELETE FROM crawler.properties WHERE false')
 if real_login:
  denied(c,'SET LOCAL ROLE crawler_writer');denied(c,'SET LOCAL ROLE postgres')
 require(not c.execute("SELECT has_schema_privilege(current_user,'crawler','USAGE') allowed").fetchone()['allowed'],'Reader gained private schema access')
 if upgraded:
  for col in ['source_facts','source_property_id','identity_token','source_status_ja','address']:denied(c,'SELECT '+col+' FROM property_api.customer_properties LIMIT 0',('42703',))
  with c.transaction(force_rollback=True):
   c.execute('SET LOCAL row_security=off');denied(c,'SELECT * FROM property_api.customer_properties LIMIT 1')

def writer_checks(c,real_login=True):
 require(c.execute("SELECT count(*) n FROM crawler.properties WHERE source_key='shinano_akiya_bank'").fetchone()['n']==0,'Shinano import is not authorized')
 c.execute('SELECT transaction_type,construction_details,source_facts FROM crawler.properties LIMIT 0')
 c.execute('UPDATE crawler.properties SET transaction_type=transaction_type WHERE false')
 c.execute('INSERT INTO crawler.properties(source_key) SELECT source_key FROM crawler.properties WHERE false')
 denied(c,'DELETE FROM crawler.properties WHERE false');denied(c,'SELECT * FROM crawler.schema_migrations LIMIT 0')
 if real_login:denied(c,'SET LOCAL ROLE postgres')
 require(not c.execute("SELECT has_schema_privilege(current_user,'crawler','CREATE') allowed").fetchone()['allowed'],'Writer gained schema CREATE')

def snapshot(c):
 result={}
 for table in TABLES:
  where=" WHERE source_key='myoko_akiya_bank'" if table=='sources' else ''
  query=sql.SQL('SELECT (to_jsonb(t)-%s::text[])::text record FROM crawler.{} t'+where+' ORDER BY 1').format(sql.Identifier(table))
  result[table]=[r['record'] for r in c.execute(query,(NEW if table=='properties' else [],)).fetchall()]
 result['view']=view_rows(c)
 return result

def schema_checks(c):
 cols=c.execute("SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema='crawler' AND table_name='properties' AND column_name=ANY(%s)",(NEW,)).fetchall()
 require(len(cols)==3 and all(x['is_nullable']=='YES' for x in cols),'Nullable columns not installed')
 checks=c.execute("SELECT pg_get_constraintdef(oid,true) definition FROM pg_constraint WHERE conrelid='crawler.properties'::regclass AND conname IN ('properties_property_type_check','properties_transaction_type_check','properties_source_facts_check') ORDER BY conname").fetchall()
 require(len(checks)==3,'Expected constraint definitions missing')
 c.execute('CREATE TEMP TABLE myoko_003_probe(property_type text,transaction_type text,source_facts jsonb,'+','.join(x['definition'] for x in checks)+') ON COMMIT DROP')
 c.execute("INSERT INTO myoko_003_probe VALUES ('lodge','sale','{}'),('house',NULL,NULL)")
 for q in ["INSERT INTO myoko_003_probe VALUES ('bad','sale','{}')","INSERT INTO myoko_003_probe VALUES ('house','lease','{}')","INSERT INTO myoko_003_probe VALUES ('house','sale','[]')"]:denied(c,q,('23514',))
 c.execute('DROP TABLE myoko_003_probe')
 read_checks(c)
 require(c.execute("SELECT count(*) n FROM crawler.sources WHERE source_key='shinano_akiya_bank' AND NOT synthetic").fetchone()['n']==1,'Shinano profile missing')
 require(c.execute("SELECT count(*) n FROM crawler.properties WHERE source_key='shinano_akiya_bank'").fetchone()['n']==0,'Unexpected Shinano properties')

def read_checks(c):
 text=CHECKS.read_text();c.execute(text[text.index('DO $$'):text.rindex('ROLLBACK;')],prepare=False)

def main(argv=None):
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--apply',action='store_true')
 for flag in ['env-file','reader-env-file','writer-config']:p.add_argument('--'+flag,type=Path,required=True)
 a=p.parse_args(argv);c=reader=writer=None;stage='configuration';committed=False
 try:
  text=MIGRATION.read_text();digest=hashlib.sha256(text.encode()).hexdigest();nodes=[x.stmt for x in parse_sql(text)]
  require(not any(isinstance(n,(ast.UpdateStmt,ast.DeleteStmt)) for n in nodes),'Unexpected property data mutation in migration')
  require(nodes[0].kind.name=='TRANS_STMT_BEGIN' and nodes[-1].kind.name=='TRANS_STMT_COMMIT','Migration is not one atomic transaction')
  settings=load_settings(a.env_file)
  reader=role_connection(env_values(a.reader_env_file)['FINDER_DATABASE_URL'],settings,'property_finder_web_reader')
  writer=role_connection(json.loads(a.writer_config.read_text())['MYOKO_CRAWLER_DATABASE_URL'],settings,'myoko_crawler')
  c=connect_database(settings,application_name='myoko-approved-003')
  require(c.execute('SELECT current_user actor,current_database() db').fetchone()=={'actor':'postgres','db':'postgres'},'Unexpected migration actor/database')
  expected=view_rows(c)
  with reader.transaction():
   reader.execute('SET LOCAL ROLE crawler_customer_reader');reader_checks(reader,expected,False)
  ledger=c.execute("SELECT to_regclass('crawler.schema_migrations') name").fetchone()['name']
  applied=c.execute("SELECT sha256 FROM crawler.schema_migrations WHERE migration='003_shinano_source'").fetchone() if ledger else None
  if applied:
   require(applied['sha256']==digest,'Applied checksum differs; no reapplication allowed')
   already=True;directory=None
  else:
   already=False;require(a.apply,'First installation requires explicit --apply')
   require(not c.execute("SELECT 1 FROM information_schema.columns WHERE table_schema='crawler' AND table_name='properties' AND column_name=ANY(%s)",(NEW,)).fetchone(),'Untracked migration columns found; stop for review')
   stage='backup';directory=ROOT/'data/backups'/('003-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
   with c.transaction():
    c.execute("SET LOCAL lock_timeout='5s'");c.execute("SET LOCAL statement_timeout='60s'")
    c.execute("SELECT pg_advisory_xact_lock(hashtext('myoko-migration-003'))")
    c.execute('LOCK TABLE '+','.join('crawler.'+t for t in TABLES)+' IN SHARE ROW EXCLUSIVE MODE')
    before=snapshot(c);require(len(before['properties'])>0,'Inventory unexpectedly empty')
    require(c.execute("SELECT count(*) n FROM crawler.properties WHERE source_key='shinano_akiya_bank'").fetchone()['n']==0,'Unexpected existing Shinano listings')
    manifest=backup(c,directory);write_private(directory/'migration-003.sql',text)
    print(json.dumps({'backup_complete':True,'directory':str(directory.resolve()),'table_counts':manifest['table_counts']}),flush=True)
    stage='atomic migration and current-role checks'
    c.execute("CREATE TABLE IF NOT EXISTS crawler.schema_migrations(migration text PRIMARY KEY,sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),applied_at timestamptz NOT NULL DEFAULT clock_timestamp())")
    c.execute('REVOKE ALL ON crawler.schema_migrations FROM PUBLIC,anon,authenticated,service_role,crawler_writer,crawler_customer_reader,property_finder_web_reader,myoko_crawler')
    c.execute('ALTER TABLE crawler.schema_migrations ENABLE ROW LEVEL SECURITY');c.execute('ALTER TABLE crawler.schema_migrations FORCE ROW LEVEL SECURITY')
    c.execute(text[text.index('BEGIN;')+len('BEGIN;'):text.rindex('COMMIT;')],prepare=False)
    schema_checks(c);require(snapshot(c)==before,'Original property/source/history facts or customer visibility changed')
    with c.transaction(force_rollback=True):
     c.execute('GRANT crawler_customer_reader,crawler_writer TO postgres WITH INHERIT FALSE,SET TRUE')
     c.execute('SET LOCAL ROLE crawler_customer_reader');reader_checks(c,before['view'],True,False)
     c.execute('RESET ROLE');c.execute('SET LOCAL ROLE crawler_writer');writer_checks(c,False);c.execute('RESET ROLE')
    c.execute("INSERT INTO crawler.schema_migrations(migration,sha256) VALUES ('003_shinano_source',%s)",(digest,))
    require(snapshot(c)==before,'Validation altered persistent data')
   committed=True;expected=before['view']
  stage='independent restricted-login checks'
  with reader.transaction():reader.execute('SET LOCAL ROLE crawler_customer_reader');reader_checks(reader,expected)
  with writer.transaction():writer.execute('SET LOCAL ROLE crawler_writer');writer_checks(writer)
  with c.transaction():
   c.execute('SET TRANSACTION READ ONLY');read_checks(c)
   require(c.execute("SELECT sha256 FROM crawler.schema_migrations WHERE migration='003_shinano_source'").fetchone()['sha256']==digest,'Ledger checksum mismatch')
   roles=c.execute("SELECT pg_has_role('postgres','crawler_customer_reader','SET') reader_set,pg_has_role('postgres','crawler_writer','SET') writer_set").fetchone()
   require(not any(roles.values()),'Temporary test role memberships persisted')
  report={'migration':'003_shinano_source','sha256':digest,'already_applied':already,'committed':committed,
   'myoko_properties':c.execute("SELECT count(*) n FROM crawler.properties WHERE source_key='myoko_akiya_bank'").fetchone()['n'],
   'myoko_customer_visible':len(expected),'shinano_properties':0,'reader_checks':'passed','writer_checks':'passed',
   'backup':str(directory.resolve()) if directory else None,'tls':'verify-full','no_crawler_invoked':True}
  if directory:write_private(directory/'result.json',json.dumps(report,indent=2)+'\n')
  print(json.dumps(report,indent=2));return 0
 except Exception as e:
  print(json.dumps({'status':'stopped','stage':stage,'migration_committed':committed,'error':str(e) if isinstance(e,PreflightError) else 'Private database details suppressed','sqlstate':getattr(e,'sqlstate',None),'error_type':type(e).__name__}));return 2
 finally:
  for x in (reader,writer,c):
   if x:x.close()

if __name__=='__main__':raise SystemExit(main())
