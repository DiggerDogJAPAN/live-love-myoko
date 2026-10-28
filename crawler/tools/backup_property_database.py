"""Private, catalog-based backup for the two Finder schemas (no pg_dump required).

Restore SQL targets an empty compatible PostgreSQL/Supabase database with the
existing role names. Never execute it over the live schema. No passwords captured.
"""
import hashlib
import json
import os
from pathlib import Path
from datetime import datetime, timezone
from psycopg import sql

TABLES=('sources','crawl_runs','properties','price_changes','status_changes','translations')
SCHEMAS=('crawler','property_api')


def write_private(path,text):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        f.write(text);f.flush();os.fsync(f.fileno())


def backup(connection,directory):
    directory.mkdir(parents=True,mode=0o700,exist_ok=False)
    q=lambda name:sql.Identifier(name).as_string(connection)
    literal=lambda value:sql.Literal(value).as_string(connection)
    schemas=connection.execute("SELECT n.nspname,r.rolname owner,n.nspacl::text acl FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=ANY(%s) ORDER BY n.nspname",(list(SCHEMAS),)).fetchall()
    columns=connection.execute("""SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) type,
        a.attnotnull,a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid) expression
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
        WHERE n.nspname='crawler' AND c.relname=ANY(%s) AND a.attnum>0 AND NOT a.attisdropped
        ORDER BY c.relname,a.attnum""",(list(TABLES),)).fetchall()
    constraints=connection.execute("""SELECT c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid,true) definition
        FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='crawler' AND c.relname=ANY(%s) ORDER BY (k.contype='f'),c.relname,k.conname""",(list(TABLES),)).fetchall()
    relations=connection.execute("""SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
        c.reloptions,c.relacl::text acl,r.rolname owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname=ANY(%s) AND c.relkind IN ('r','v') ORDER BY n.nspname,c.relname""",(list(SCHEMAS),)).fetchall()
    functions=connection.execute("""SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,
        pg_get_functiondef(p.oid) definition,p.proacl::text acl,r.rolname owner FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
        WHERE n.nspname=ANY(%s) ORDER BY p.oid""",(list(SCHEMAS),)).fetchall()
    indexes=connection.execute("""SELECT pg_get_indexdef(i.indexrelid) definition FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='crawler' AND c.relname=ANY(%s)
        AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conindid=i.indexrelid) ORDER BY i.indexrelid""",(list(TABLES),)).fetchall()
    policies=connection.execute("SELECT * FROM pg_policies WHERE schemaname=ANY(%s) ORDER BY schemaname,tablename,policyname",(list(SCHEMAS),)).fetchall()
    defaults=connection.execute("""SELECT r.rolname owner,n.nspname,d.defaclobjtype,d.defaclacl::text acl
        FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole JOIN pg_namespace n ON n.oid=d.defaclnamespace
        WHERE n.nspname=ANY(%s)""",(list(SCHEMAS),)).fetchall()
    grants=connection.execute("""SELECT table_schema,table_name,column_name,grantee,privilege_type,is_grantable
        FROM information_schema.column_privileges WHERE table_schema=ANY(%s)
        ORDER BY table_schema,table_name,column_name,grantee,privilege_type""",(list(SCHEMAS),)).fetchall()
    table_grants=connection.execute("SELECT * FROM information_schema.table_privileges WHERE table_schema=ANY(%s)",(list(SCHEMAS),)).fetchall()
    role_names=['crawler_writer','crawler_customer_reader','property_finder_web_reader','myoko_crawler']
    roles=connection.execute("SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_roles WHERE rolname=ANY(%s)",(role_names,)).fetchall()
    memberships=connection.execute("""SELECT parent.rolname parent,child.rolname member,m.admin_option,m.inherit_option,m.set_option
        FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member
        WHERE parent.rolname=ANY(%s) OR child.rolname=ANY(%s)""",(role_names,role_names)).fetchall()
    triggers=connection.execute("""SELECT pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY(%s) AND NOT t.tgisinternal""",(list(SCHEMAS),)).fetchall()
    view=connection.execute("SELECT pg_get_viewdef('property_api.customer_properties'::regclass,true) definition").fetchone()['definition']
    metadata=dict(schemas=schemas,columns=columns,constraints=constraints,relations=relations,functions=functions,
        indexes=indexes,policies=policies,default_privileges=defaults,column_grants=grants,table_grants=table_grants,
        roles=roles,memberships=memberships,triggers=triggers,customer_view=view)
    rows={table:[row['record'] for row in connection.execute(sql.SQL('SELECT to_jsonb(t)::text record FROM crawler.{} t ORDER BY to_jsonb(t)::text').format(sql.Identifier(table))).fetchall()] for table in TABLES}
    ddl=['-- Backup for a fresh compatible database only; no role passwords.','BEGIN;']
    for schema in schemas:ddl.append('CREATE SCHEMA '+q(schema['nspname'])+' AUTHORIZATION '+q(schema['owner'])+';')
    ddl.extend(f['definition'].rstrip(';')+';' for f in functions)
    for table in TABLES:
        defs=[]
        for col in (c for c in columns if c['relname']==table):
            d=q(col['attname'])+' '+col['type']
            if col['attgenerated']:d+=' GENERATED ALWAYS AS ('+col['expression']+') STORED'
            elif col['attidentity']:d+=' GENERATED '+('ALWAYS' if col['attidentity']=='a' else 'BY DEFAULT')+' AS IDENTITY'
            elif col['expression']:d+=' DEFAULT '+col['expression']
            if col['attnotnull']:d+=' NOT NULL'
            defs.append(d)
        ddl.append('CREATE TABLE crawler.'+q(table)+' (\n'+',\n'.join(defs)+'\n);')
    for c in constraints:ddl.append('ALTER TABLE crawler.'+q(c['relname'])+' ADD CONSTRAINT '+q(c['conname'])+' '+c['definition']+';')
    ddl.extend(i['definition'].rstrip(';')+';' for i in indexes)
    options=next(x['reloptions'] for x in relations if x['nspname']=='property_api' and x['relname']=='customer_properties') or []
    ddl.append('CREATE VIEW property_api.customer_properties WITH ('+','.join(options)+') AS '+view.rstrip(';')+';')
    for p in policies:
        names=','.join('PUBLIC' if v=='public' else q(v) for v in p['roles'])
        statement='CREATE POLICY '+q(p['policyname'])+' ON '+q(p['schemaname'])+'.'+q(p['tablename'])+' AS '+p['permissive']+' FOR '+p['cmd']+' TO '+names
        if p['qual']:statement+=' USING ('+p['qual']+')'
        if p['with_check']:statement+=' WITH CHECK ('+p['with_check']+')'
        ddl.append(statement+';')
    for r in relations:
        target=q(r['nspname'])+'.'+q(r['relname'])
        if r['relrowsecurity']:ddl.append('ALTER TABLE '+target+' ENABLE ROW LEVEL SECURITY;')
        if r['relforcerowsecurity']:ddl.append('ALTER TABLE '+target+' FORCE ROW LEVEL SECURITY;')
        ddl.append('ALTER '+('VIEW' if r['relkind']=='v' else 'TABLE')+' '+target+' OWNER TO '+q(r['owner'])+';')
        ddl.append('REVOKE ALL ON TABLE '+target+' FROM PUBLIC;')
    for grant in table_grants:
        ddl.append('GRANT '+grant['privilege_type']+' ON TABLE '+q(grant['table_schema'])+'.'+q(grant['table_name'])+' TO '+('PUBLIC' if grant['grantee']=='PUBLIC' else q(grant['grantee']))+(' WITH GRANT OPTION' if grant['is_grantable']=='YES' else '')+';')
    for grant in grants:
        ddl.append('GRANT '+grant['privilege_type']+' ('+q(grant['column_name'])+') ON TABLE '+q(grant['table_schema'])+'.'+q(grant['table_name'])+' TO '+('PUBLIC' if grant['grantee']=='PUBLIC' else q(grant['grantee']))+(' WITH GRANT OPTION' if grant['is_grantable']=='YES' else '')+';')
    # Reconstruct schema/function ACL entries explicitly; default object privileges
    # and role membership definitions are also retained in catalog.json.
    for schema in schemas:
        target=q(schema['nspname']);ddl.append('REVOKE ALL ON SCHEMA '+target+' FROM PUBLIC;')
        entries=connection.execute("SELECT (aclexplode(nspacl)).* FROM pg_namespace WHERE nspname=%s",(schema['nspname'],)).fetchall()
        for entry in entries:
            role='PUBLIC' if entry['grantee']==0 else q(connection.execute('SELECT rolname FROM pg_roles WHERE oid=%s',(entry['grantee'],)).fetchone()['rolname'])
            ddl.append('GRANT '+entry['privilege_type']+' ON SCHEMA '+target+' TO '+role+(' WITH GRANT OPTION' if entry['is_grantable'] else '')+';')
    for f in functions:
        target=q(f['nspname'])+'.'+q(f['proname'])+'('+f['args']+')'
        ddl.append('ALTER FUNCTION '+target+' OWNER TO '+q(f['owner'])+';')
        ddl.append('REVOKE ALL ON FUNCTION '+target+' FROM PUBLIC;')
        entries=connection.execute("SELECT (aclexplode(proacl)).* FROM pg_proc WHERE pronamespace=%s::regnamespace AND proname=%s",(f['nspname'],f['proname'])).fetchall()
        for entry in entries:
            role='PUBLIC' if entry['grantee']==0 else q(connection.execute('SELECT rolname FROM pg_roles WHERE oid=%s',(entry['grantee'],)).fetchone()['rolname'])
            ddl.append('GRANT '+entry['privilege_type']+' ON FUNCTION '+target+' TO '+role+(' WITH GRANT OPTION' if entry['is_grantable'] else '')+';')
    ddl.extend(t['definition'].rstrip(';')+';' for t in triggers)
    ddl.append('COMMIT;')
    data=['-- Restore after schema.sql into an empty compatible schema.','BEGIN;']
    for table in TABLES:
        names=[c['attname'] for c in columns if c['relname']==table and not c['attgenerated']]
        cols=','.join(q(n) for n in names)
        select=','.join('r.'+q(n) for n in names)
        for raw in rows[table]:data.append('INSERT INTO crawler.'+q(table)+' ('+cols+') SELECT '+select+' FROM jsonb_populate_record(NULL::crawler.'+q(table)+','+literal(raw)+'::jsonb) r;')
    data.append('COMMIT;')
    write_private(directory/'schema.sql','\n'.join(ddl)+'\n')
    write_private(directory/'data.sql','\n'.join(data)+'\n')
    write_private(directory/'catalog.json',json.dumps(metadata,ensure_ascii=False,indent=2,default=str)+'\n')
    write_private(directory/'rows.json',json.dumps({table:[json.loads(raw) for raw in records] for table,records in rows.items()},ensure_ascii=False,indent=2)+'\n')
    from pglast import parse_sql
    parse_sql((directory/'schema.sql').read_text());parse_sql((directory/'data.sql').read_text())
    manifest={'created_at':datetime.now(timezone.utc).isoformat(),'table_counts':{t:len(v) for t,v in rows.items()},
        'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir()},'method':'SQL/catalog logical backup; same existing roles required; catalog includes original ACL/defaults/memberships'}
    write_private(directory/'manifest.json',json.dumps(manifest,indent=2)+'\n')
    return manifest
