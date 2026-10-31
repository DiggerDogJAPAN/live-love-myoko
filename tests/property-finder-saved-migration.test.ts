import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

let db: PGlite;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = uuid(1), premium = uuid(2), basic = uuid(3), unpaid = uuid(4), other = uuid(5);
const session = (id: string) => uuid(Number(id.slice(-12)) + 10);
const listing = uuid(101), listing2 = uuid(102), privateListing = uuid(103);
const migration = readFileSync('sql/proposals/003_finder_saved_properties.sql', 'utf8');
async function asReader<T>(fn: () => Promise<T>) {
    await db.exec('SET SESSION AUTHORIZATION property_finder_web_reader; RESET ROLE');
    try { return await fn(); } finally { await db.exec('RESET ROLE; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
}
async function ids(user = admin, sid = session(user)) {
    return asReader(async () => (await db.query<{ property_id: string; saved_at: Date }>('SELECT * FROM finder_security.saved_property_ids($1::uuid,$2::uuid)', [user, sid])).rows);
}
async function save(user = admin, id = listing, sid = session(user)) {
    return asReader(() => db.query('SELECT finder_security.save_property($1::uuid,$2::uuid,$3::uuid)', [user, sid, id]));
}
const denied = (error: unknown) => (error as Error).message.includes('saved_access_denied');
before(async () => {
    db = await PGlite.create();
    await db.exec(`CREATE ROLE fixture_superuser SUPERUSER; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE;
        ALTER ROLE postgres RENAME TO fixture_bootstrap; CREATE ROLE postgres LOGIN NOSUPERUSER BYPASSRLS CREATEROLE CREATEDB;
        GRANT CREATE ON DATABASE postgres TO postgres;
        CREATE ROLE supabase_admin SUPERUSER; CREATE ROLE supabase_auth_admin NOLOGIN;
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticator;
        CREATE ROLE crawler_writer; CREATE ROLE crawler_customer_reader; CREATE ROLE property_finder_web_reader LOGIN NOINHERIT;
        GRANT crawler_customer_reader TO property_finder_web_reader;
        CREATE SCHEMA auth AUTHORIZATION supabase_admin; GRANT USAGE,CREATE ON SCHEMA auth TO supabase_auth_admin;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz,deleted_at timestamptz,is_anonymous boolean,email_confirmed_at timestamptz);
        CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
        ALTER TABLE auth.users OWNER TO supabase_auth_admin; ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;
        ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY; ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;
        GRANT USAGE ON SCHEMA auth TO postgres; GRANT SELECT,REFERENCES ON auth.users,auth.sessions TO postgres;
        SET SESSION AUTHORIZATION postgres; RESET ROLE;
        CREATE SCHEMA crawler; CREATE SCHEMA property_api;
        CREATE TABLE crawler.sources(source_key text PRIMARY KEY,agency_name text,synthetic boolean);
        CREATE TABLE crawler.properties(id uuid PRIMARY KEY,source_key text REFERENCES crawler.sources(source_key),asking_price_jpy bigint,
            area text,area_en text,region_en text,region_ja text,municipality text,unmapped_locations text[] DEFAULT '{}',image_permission text,
            main_image_url text,original_listing_url text,listing_status text,availability_status text,source_status_ja text,last_checked_at timestamptz,
            portal_duplicate_review_pending boolean NOT NULL DEFAULT false,
            property_type text,transaction_type text,purchase_conditions_ja text);
        CREATE FUNCTION crawler.source_customer_eligible(source text,publication text,availability text,label text,transaction text,kind text)
        RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT publication='active' AND availability='active' $$;
        ALTER TABLE crawler.properties ENABLE ROW LEVEL SECURITY; ALTER TABLE crawler.properties FORCE ROW LEVEL SECURITY;
        CREATE POLICY properties_customer ON crawler.properties FOR SELECT TO crawler_customer_reader USING(listing_status='active' AND availability_status='active');
        CREATE POLICY properties_writer ON crawler.properties FOR ALL TO crawler_writer USING(true) WITH CHECK(true);
        CREATE POLICY portal_duplicate_review_gate ON crawler.properties AS RESTRICTIVE FOR SELECT TO crawler_customer_reader USING(NOT portal_duplicate_review_pending);
        ALTER TABLE crawler.sources ENABLE ROW LEVEL SECURITY; ALTER TABLE crawler.sources FORCE ROW LEVEL SECURITY;
        CREATE POLICY sources_customer ON crawler.sources FOR SELECT TO crawler_customer_reader USING(NOT synthetic);
        GRANT USAGE ON SCHEMA property_api TO crawler_customer_reader;
        GRANT SELECT ON crawler.sources,crawler.properties TO crawler_customer_reader;
        INSERT INTO crawler.sources VALUES('myoko_akiya_bank','Myoko Akiya Bank',false),('private','Private source',true);
        -- Model permissive existing platform defaults; migration must revoke them.
        ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO authenticated,service_role;
        ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
    `);
    const original = readFileSync('crawler/sql/migrations/007_property_portals.sql', 'utf8').split('CREATE OR REPLACE VIEW property_api.customer_properties')[1].split('INSERT INTO crawler.sources')[0];
    await db.exec('CREATE OR REPLACE VIEW property_api.customer_properties' + original);
    await db.exec('GRANT SELECT ON property_api.customer_properties TO crawler_customer_reader');
    await db.exec(readFileSync('sql/proposals/001_finder_membership_foundation.sql', 'utf8'));
    await db.exec(readFileSync('sql/proposals/002_finder_accounts.sql', 'utf8'));
    await db.exec(migration);
    await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE');
    for (const user of [admin, premium, basic, unpaid, other]) {
        await db.query('INSERT INTO auth.users(id,is_anonymous,email_confirmed_at) VALUES($1,false,now())', [user]);
        await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [session(user), user]);
    }
    await db.query("INSERT INTO finder_security.account_roles(user_id,account_role) VALUES($1,'administrator'),($2,'administrator')", [admin, other]);
    for (const [user, tier] of [[premium, 'premium'], [basic, 'basic']]) await db.query(`INSERT INTO finder_security.memberships(user_id,tier,account_active,status,payment_status,access_starts_at,paid_through)
        VALUES($1,$2,true,'active','paid',now()-interval '1 day',now()+interval '1 day')`, [user, tier]);
    for (const id of [listing, listing2, privateListing]) await db.query(`INSERT INTO crawler.properties(id,source_key,asking_price_jpy,area_en,municipality,listing_status,availability_status,property_type,transaction_type,original_listing_url)
        VALUES($1,$2,1500000,'Taguchi','Myoko','active','active','house','sale',$3)`, [id, id === privateListing ? 'private' : 'myoko_akiya_bank', 'https://example.invalid/property/' + id]);
});
after(async () => { await db?.close(); });

test('Saved migration uses private forced-RLS tables and narrowly delegated helpers, not Auth grants or table writes', async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; owner: string }>(`SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class
        WHERE oid IN ('finder_security.saved_properties'::regclass,'finder_security.saved_property_limits'::regclass)`);
    assert.equal(rows.length, 2); for (const row of rows) { assert(row.relrowsecurity && row.relforcerowsecurity); assert.equal(row.owner, 'postgres'); }
    for (const role of ['anon', 'authenticated', 'service_role', 'authenticator', 'crawler_writer', 'crawler_customer_reader', 'property_finder_web_reader']) {
        await db.exec(`SET SESSION AUTHORIZATION ${role}; RESET ROLE`);
        try {
            for (const query of ['SELECT * FROM finder_security.saved_properties', `INSERT INTO finder_security.saved_properties(user_id,property_id) VALUES('${admin}','${listing}')`, 'DELETE FROM finder_security.saved_properties', 'SELECT * FROM finder_security.saved_property_limits']) {
                await assert.rejects(db.query(query), e => (e as { code: string }).code === '42501');
            }
            await assert.rejects(db.query('SELECT finder_security.check_saved_access($1::uuid,$2::uuid,false)', [admin, session(admin)]));
            if (role !== 'property_finder_web_reader') await assert.rejects(db.query('SELECT * FROM finder_security.saved_property_ids($1::uuid,$2::uuid)', [admin, session(admin)]));
        } finally { await db.exec('RESET ROLE; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
    }
    assert(!/GRANT[^;]+ON\s+auth\./i.test(migration)); assert(!/CREATE POLICY[^;]+ON\s+auth\./i.test(migration));
    const cols = (await db.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='finder_security' AND table_name='saved_properties' ORDER BY ordinal_position")).rows;
    assert.deepEqual(cols.map(r => r.column_name), ['user_id', 'property_id', 'saved_at']);
});

test('Administrator bookmarks persist across sessions and duplicate saves preserve one row and original timestamp', async () => {
    await save(); const first = await ids(); assert.equal(first.length, 1);
    await save(); assert.deepEqual(await ids(), first);
    const freshSession = uuid(999); await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [freshSession, admin]);
    assert.deepEqual(await ids(admin, freshSession), first);
    assert.deepEqual(await ids(other), []);
    await assert.rejects(ids(admin, session(other)), denied);
    await asReader(() => db.query('SELECT finder_security.remove_saved_property($1::uuid,$2::uuid,$3::uuid)', [other, session(other), listing]));
    assert.equal((await ids()).length, 1, 'other account cannot delete administrator bookmark');
});

test('Database helpers enforce Premium/admin and deny unpaid, Basic, expired/revoked memberships and disabled administrators', async () => {
    await save(premium); assert.equal((await ids(premium)).length, 1);
    await assert.rejects(save(basic), denied); await assert.rejects(ids(unpaid), denied);
    for (const patch of ["payment_status='unpaid'", "status='expired'", "paid_through=now()-interval '1 hour'", "revoked_at=now()", 'account_active=false']) {
        try { await db.exec('UPDATE finder_security.memberships SET ' + patch + ` WHERE user_id='${premium}'`); await assert.rejects(ids(premium), denied); }
        finally { await db.query("UPDATE finder_security.memberships SET payment_status='paid',status='active',paid_through=now()+interval '1 day',revoked_at=NULL,account_active=true WHERE user_id=$1", [premium]); }
    }
    await db.query('UPDATE finder_security.account_roles SET is_active=false WHERE user_id=$1', [admin]);
    await assert.rejects(save(), denied); await db.query('UPDATE finder_security.account_roles SET is_active=true WHERE user_id=$1', [admin]);
    await db.query("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1", [session(admin)]);
    await assert.rejects(ids(), denied); await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1', [session(admin)]);
});

test('Shared database account rate limits persist across requests, with safe idempotent removals', async () => {
    await db.query('DELETE FROM finder_security.saved_property_limits WHERE user_id=$1', [other]);
    for (let n = 0; n < 30; n++) await asReader(() => db.query('SELECT finder_security.remove_saved_property($1::uuid,$2::uuid,$3::uuid)', [other, session(other), listing]));
    await assert.rejects(asReader(() => db.query('SELECT finder_security.remove_saved_property($1::uuid,$2::uuid,$3::uuid)', [other, session(other), listing])), /saved_rate_limited/);
    await db.query("UPDATE finder_security.saved_property_limits SET window_start=now()-interval '2 minutes' WHERE user_id=$1", [other]);
    assert.deepEqual(await ids(other), []);
});

test('Bookmark quota is bounded and a valid duplicate save remains idempotent at the limit', async () => {
    await db.query('DELETE FROM finder_security.saved_properties WHERE user_id=$1', [other]);
    await db.query('DELETE FROM finder_security.saved_property_limits WHERE user_id=$1', [other]);
    await db.query("UPDATE crawler.properties SET availability_status='active' WHERE id=$1", [listing]);
    for (let n = 3000; n < 3499; n++) await db.query('INSERT INTO finder_security.saved_properties(user_id,property_id) VALUES($1,$2)', [other, uuid(n)]);
    await save(other, listing); await save(other, listing); assert.equal((await ids(other)).length, 500);
    await db.query("INSERT INTO crawler.properties(id,source_key,listing_status,availability_status) VALUES($1,'myoko_akiya_bank','active','active')", [uuid(777)]);
    await assert.rejects(save(other, uuid(777)), /saved_limit_reached/);
});

test('Replaying the proposal fails transactionally without overwriting existing saved records', async () => {
    const before = (await db.query('SELECT user_id,property_id,saved_at FROM finder_security.saved_properties ORDER BY user_id,property_id')).rows;
    await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
    try { await assert.rejects(db.exec(migration), /Customer view changed|already or partially applied/); }
    finally { await db.exec('ROLLBACK; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
    assert.deepEqual((await db.query('SELECT user_id,property_id,saved_at FROM finder_security.saved_properties ORDER BY user_id,property_id')).rows, before);
});


// Direct HTTPS migration: PostgREST verifies signatures, then sets these claims.
// These local fixtures never issue production tokens or seed real accounts.
const rpcMigration = readFileSync('sql/proposals/004_finder_saved_properties_rpc.sql', 'utf8');
const claimsFor = (user = admin, patch: Record<string, unknown> = {}) => ({ sub: user, session_id: session(user),
    role: 'authenticated', aud: 'authenticated', iss: 'https://fgdoqsepihlzfqlqymet.supabase.co/auth/v1', is_anonymous: false,
    iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600, ...patch });
async function rpc(name: string, args: unknown[] = [], claims: Record<string, unknown> = claimsFor(), role = 'authenticated') {
    await db.exec(`SET SESSION AUTHORIZATION ${role}; RESET ROLE`);
    try {
        await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
        return (await db.query<{ data: Record<string, unknown> }>(`SELECT public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS data`, args)).rows[0].data;
    } finally { await db.exec('RESET ROLE; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
}
async function resetRpcLimits() { await db.exec('DELETE FROM finder_security.saved_property_limits'); }

test('Migration 004 exposes only narrow authenticated RPCs, preserves existing bookmarks and restores temporary ownership grants', async () => {
    await db.exec(`GRANT USAGE,CREATE ON SCHEMA public TO postgres;
        GRANT crawler_customer_reader TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
        DELETE FROM finder_security.saved_property_limits;
        UPDATE auth.sessions SET not_after=NULL;
        UPDATE finder_security.account_roles SET is_active=true;
        UPDATE crawler.properties SET availability_status='active' WHERE id='${listing}';
        INSERT INTO crawler.properties(id,source_key,asking_price_jpy,area_en,municipality,listing_status,availability_status,property_type,transaction_type,original_listing_url)
        VALUES('${listing2}','myoko_akiya_bank',1500000,'Taguchi','Myoko','active','active','house','sale','https://example.invalid/property/${listing2}') ON CONFLICT(id) DO UPDATE SET availability_status='active';
        INSERT INTO crawler.properties(id,source_key,listing_status,availability_status,portal_duplicate_review_pending)
        VALUES('${uuid(888)}','myoko_akiya_bank','active','active',true) ON CONFLICT(id) DO UPDATE SET portal_duplicate_review_pending=true;`);
    const savedBefore = (await db.query('SELECT * FROM finder_security.saved_properties ORDER BY user_id,property_id')).rows;
    const rolesBefore = (await db.query('SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor')).rows;
    await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
    try { await db.exec(rpcMigration); } catch (error) { await db.exec('ROLLBACK'); throw error; } finally { await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
    assert.deepEqual((await db.query('SELECT * FROM finder_security.saved_properties ORDER BY user_id,property_id')).rows, savedBefore);
    assert.deepEqual((await db.query('SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor')).rows, rolesBefore);
    for (const [name, signature] of [['finder_saved_ids', ''], ['finder_saved_page', 'text'], ['finder_save_property', 'uuid'], ['finder_remove_saved_property', 'uuid']]) {
        for (const role of ['anon', 'service_role', 'property_finder_web_reader', 'crawler_customer_reader']) {
            assert.equal((await db.query<{ permitted: boolean }>('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS permitted', [role, `public.${name}(${signature})`])).rows[0].permitted, false);
        }
        assert.equal((await db.query<{ permitted: boolean }>("SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS permitted", [`public.${name}(${signature})`])).rows[0].permitted, true);
    }
    for (const table of ['saved_properties', 'saved_property_limits', 'account_roles', 'memberships', 'saved_api_settings']) {
        assert.equal((await db.query<{ permitted: boolean }>("SELECT has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE') AS permitted", ['finder_security.' + table])).rows[0].permitted, false);
    }
    assert.equal((await db.query<{ permitted: boolean }>("SELECT has_function_privilege('authenticated','finder_security.saved_api_identity(boolean)','EXECUTE') AS permitted")).rows[0].permitted, false);
    assert.equal((await db.query<{ permitted: boolean }>("SELECT has_schema_privilege('crawler_customer_reader','finder_security','CREATE') AS permitted")).rows[0].permitted, false);
    assert.deepEqual((await db.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=\'finder_security.saved_api_settings\'::regclass')).rows, [{ relrowsecurity: true, relforcerowsecurity: true }]);
    await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
    try { await db.exec(readFileSync('sql/proposals/004_finder_saved_properties_rpc.verify.sql', 'utf8')); }
    catch (error) { await db.exec('ROLLBACK'); throw error; }
    finally { await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
    await db.exec('DELETE FROM finder_security.saved_properties; DELETE FROM finder_security.saved_property_limits');
});

test('Direct administrator save/IDs/page/remove survives fresh claims, is idempotent and uses current safe property data', async () => {
    const before = (await db.query('SELECT count(*)::int AS n FROM finder_security.memberships')).rows;
    assert.deepEqual(await rpc('finder_save_property', [listing]), { propertyId: listing, saved: true });
    await rpc('finder_save_property', [listing]);
    const result = await rpc('finder_saved_ids', [], claimsFor());
    assert.deepEqual(result, { userId: admin, ids: [listing], total: 1 });
    const page = await rpc('finder_saved_page', [null]);
    const item = (page.items as { propertyId: string; property: { listing_id: string; location_en: string } }[])[0];
    assert.equal(item.propertyId, listing); assert.equal(item.property.listing_id, listing); assert.equal(item.property.location_en, 'Taguchi');
    assert.equal(page.nextCursor, null);
    await db.query('UPDATE crawler.properties SET asking_price_jpy=2200000 WHERE id=$1', [listing]);
    const current = await rpc('finder_saved_page', [null]);
    assert.equal((current.items as { property: { asking_price_jpy: number } }[])[0].property.asking_price_jpy, 2200000);
    assert.deepEqual(await rpc('finder_remove_saved_property', [listing]), { propertyId: listing, saved: false });
    assert.equal((await rpc('finder_saved_ids')).total, 0);
    assert.deepEqual((await db.query('SELECT count(*)::int AS n FROM finder_security.memberships')).rows, before);
});

test('Direct RPCs deny anonymous, Basic, unpaid, forged metadata and disabled customer rollout; Premium requires live paid entitlement', async () => {
    await resetRpcLimits();
    await assert.rejects(rpc('finder_saved_ids', [], claimsFor(), 'anon'), /permission denied/);
    for (const user of [basic, unpaid]) await assert.rejects(rpc('finder_save_property', [listing], claimsFor(user, { user_metadata: { role: 'administrator' }, app_metadata: { role: 'administrator' } })), /saved_access_denied/);
    await assert.rejects(rpc('finder_save_property', [listing], claimsFor(premium)), /customer_access_disabled/);
    await db.exec('UPDATE finder_security.saved_api_settings SET customer_access_enabled=true'); // local fixture only
    try {
        await rpc('finder_save_property', [listing], claimsFor(premium));
        for (const patch of ["payment_status='unpaid'", "status='expired'", "paid_through=now()-interval '1 hour'", "revoked_at=now()", 'account_active=false']) {
            await db.exec('UPDATE finder_security.memberships SET ' + patch + ` WHERE user_id='${premium}'`);
            await assert.rejects(rpc('finder_saved_ids', [], claimsFor(premium)), /saved_access_denied/);
            await db.exec("UPDATE finder_security.memberships SET account_active=true,payment_status='paid',status='active',paid_through=now()+interval '1 day',revoked_at=NULL WHERE user_id='" + premium + "'");
        }
        await assert.rejects(rpc('finder_saved_ids', [], claimsFor(basic)), /saved_access_denied/);
    } finally { await db.exec('UPDATE finder_security.saved_api_settings SET customer_access_enabled=false'); }
});

test('Direct JWT identity cannot select another owner or bypass deleted/expired sessions, verification, bans and private administrator revocation', async () => {
    await resetRpcLimits();
    await rpc('finder_save_property', [listing]);
    await rpc('finder_save_property', [listing2], claimsFor(other));
    const otherIds = await rpc('finder_saved_ids', [], claimsFor(other));
    assert.deepEqual(otherIds.ids, [listing2]);
    await rpc('finder_remove_saved_property', [listing], claimsFor(other));
    assert.deepEqual((await rpc('finder_saved_ids')).ids, [listing]);
    for (const patch of [{ session_id: session(other) }, { session_id: null }, { session_id: 'invalid' }, { sub: 'invalid' },
        { is_anonymous: true }, { is_anonymous: null }, { exp: 1 }, { role: 'service_role' }, { iss: 'https://attacker.invalid' }]) {
        await assert.rejects(rpc('finder_saved_ids', [], claimsFor(admin, patch)), /saved_access_denied/);
    }
    await db.exec(`UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id='${session(admin)}'`);
    await assert.rejects(rpc('finder_saved_ids'), /saved_access_denied/);
    await db.exec(`UPDATE auth.sessions SET not_after=NULL WHERE id='${session(admin)}'`);
    for (const patch of ["banned_until=now()+interval '1 day'", 'email_confirmed_at=NULL', 'deleted_at=now()']) {
        await db.exec('UPDATE auth.users SET ' + patch + ` WHERE id='${admin}'`);
        await assert.rejects(rpc('finder_saved_ids'), /saved_access_denied/);
        await db.exec(`UPDATE auth.users SET banned_until=NULL,email_confirmed_at=now(),deleted_at=NULL WHERE id='${admin}'`);
    }
    await db.exec(`UPDATE finder_security.account_roles SET is_active=false WHERE user_id='${admin}'`);
    await assert.rejects(rpc('finder_saved_ids'), /saved_access_denied/);
    await db.exec(`UPDATE finder_security.account_roles SET is_active=true WHERE user_id='${admin}'`);
    await assert.rejects(rpc('finder_saved_ids', [other]), /does not exist/);
    await assert.rejects(rpc('finder_save_property', ['not-a-uuid']), /invalid input syntax/);
});

test('Direct saved projection preserves restrictive portal/customer RLS and produces removable unavailable placeholders', async () => {
    await resetRpcLimits();
    await assert.rejects(rpc('finder_save_property', [privateListing]), /saved_listing_unavailable/);
    await assert.rejects(rpc('finder_save_property', [uuid(888)]), /saved_listing_unavailable/);
    await db.exec(`UPDATE crawler.properties SET availability_status='contracted' WHERE id='${listing}'`);
    const page = await rpc('finder_saved_page', [null]);
    assert.equal((page.items as { property: unknown }[])[0].property, null);
    await assert.rejects(rpc('finder_save_property', [listing]), /saved_listing_unavailable/);
    await rpc('finder_remove_saved_property', [listing]);
    assert.equal((await rpc('finder_saved_ids')).total, 0);
    await db.exec(`UPDATE crawler.properties SET availability_status='active' WHERE id='${listing}'`);
});

test('Direct keyset pagination remains 20 per page, handles removed cursors and rejects malformed cursor payloads', async () => {
    await resetRpcLimits();
    for (let n = 500; n < 545; n++) await db.query("INSERT INTO finder_security.saved_properties(user_id,property_id,saved_at) VALUES($1,$2,'2026-10-30T00:00:00.000Z')", [admin, uuid(n)]);
    let cursor: string | null = null; const received: string[] = [];
    do {
        const page = await rpc('finder_saved_page', [cursor]);
        const items = page.items as { propertyId: string; property: unknown }[];
        assert(items.length <= 20); assert(items.every(item => item.property === null)); received.push(...items.map(item => item.propertyId));
        cursor = page.nextCursor as string | null;
        if (cursor && received.length === 20) await rpc('finder_remove_saved_property', [items.at(-1)!.propertyId]);
    } while (cursor);
    assert.equal(received.length, 45); assert.equal(new Set(received).size, 45);
    for (const invalid of ['private-owner|bad', '2026-99-99T00:00:00.000Z|' + listing, 'x'.repeat(100)]) await assert.rejects(rpc('finder_saved_page', [invalid]), /invalid_saved_request/);
    await db.query('DELETE FROM finder_security.saved_properties WHERE user_id=$1', [admin]);
});

test('Direct RPC preserves 500-save quota and rate limits without accepting owner or tier parameters', async () => {
    await resetRpcLimits();
    for (let n = 6000; n < 6499; n++) await db.query('INSERT INTO finder_security.saved_properties(user_id,property_id) VALUES($1,$2)', [admin, uuid(n)]);
    await rpc('finder_save_property', [listing]); await rpc('finder_save_property', [listing]);
    assert.equal((await rpc('finder_saved_ids')).total, 500);
    await assert.rejects(rpc('finder_save_property', [listing2]), /saved_limit_reached/);
    await db.query('UPDATE finder_security.saved_property_limits SET writes=30 WHERE user_id=$1', [admin]);
    await assert.rejects(rpc('finder_remove_saved_property', [listing]), /saved_rate_limited/);
    await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
    try { await assert.rejects(db.exec(rpcMigration), /already or partially applied/); }
    finally { await db.exec('ROLLBACK; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
});


test('Direct RPC unexpected SQL failures expose only the safe generic code and retain forced RLS', async () => {
    await resetRpcLimits();
    await db.exec('REVOKE SELECT ON property_api.customer_properties FROM crawler_customer_reader');
    try { await assert.rejects(rpc('finder_save_property', [listing]), error => (error as Error).message === 'saved_properties_unavailable'); }
    finally { await db.exec('GRANT SELECT ON property_api.customer_properties TO crawler_customer_reader'); }
    assert.equal((await db.query<{ forced: boolean }>("SELECT relforcerowsecurity AS forced FROM pg_class WHERE oid='finder_security.saved_properties'::regclass")).rows[0].forced, true);
});

const httpsMigration = readFileSync('sql/proposals/005_finder_supabase_https.sql','utf8');
test('Migration 005 preserves 004 bookmarks, private roles, crawler/Auth data and all existing RLS while adding only authenticated HTTPS interfaces', async () => {
    await resetRpcLimits();
    const roleBefore = (await db.query('SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor')).rows;
    const protectedBefore = (await db.query("SELECT md5(string_agg(to_jsonb(p)::text,',' ORDER BY id)) AS hash FROM crawler.properties p")).rows;
    const bookmarks = (await db.query('SELECT * FROM finder_security.saved_properties ORDER BY user_id,property_id')).rows;
    await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
    try { await db.exec(httpsMigration); } catch(error) { await db.exec('ROLLBACK'); throw error; }
    finally { await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
    assert.deepEqual((await db.query('SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor')).rows,roleBefore);
    await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
    try {await db.exec(readFileSync('sql/proposals/005_finder_supabase_https.verify.sql','utf8'));}
    catch(error){await db.exec('ROLLBACK');throw error;}
    finally{await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE');}
    assert.deepEqual((await db.query("SELECT md5(string_agg(to_jsonb(p)::text,',' ORDER BY id)) AS hash FROM crawler.properties p")).rows,protectedBefore);
    assert.deepEqual((await db.query('SELECT * FROM finder_security.saved_properties ORDER BY user_id,property_id')).rows,bookmarks);
    for(const name of ['finder_account','finder_properties']) {
        for(const role of ['anon','service_role','crawler_writer','crawler_customer_reader','property_finder_web_reader','authenticator']) {
            assert.equal((await db.query<{ok:boolean}>("SELECT has_function_privilege($1,$2,'EXECUTE') AS ok",[role,`public.${name}()`])).rows[0].ok,false);
        }
        assert.equal((await db.query<{ok:boolean}>("SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS ok",[`public.${name}()`])).rows[0].ok,true);
    }
    await db.exec('DELETE FROM finder_security.saved_properties; DELETE FROM finder_security.saved_property_limits');
});
test('Supabase-only administrator account, complete Finder snapshot and Saved Properties work without a membership or website-reader connection', async () => {
    const account = await rpc('finder_account');
    assert.equal(account.role,'administrator'); assert.equal(account.finderAccess,true); assert.equal(account.savedPropertiesAccess,true); assert.equal(account.paidAccessEnabled,false);
    const directory = await rpc('finder_properties');
    const rows = directory.rows as {listing_id:string}[]; assert.equal(directory.count,rows.length); assert(rows.some(r=>r.listing_id===listing));
    assert(!rows.some(r=>r.listing_id===privateListing || r.listing_id===uuid(888)),'restricted portal/source rows stay excluded');
    await rpc('finder_save_property',[listing]);
    assert.deepEqual((await rpc('finder_saved_ids')).ids,[listing]);
    assert.equal((await rpc('finder_saved_page',[null])).total,1);
    await rpc('finder_remove_saved_property',[listing]); assert.equal((await rpc('finder_saved_ids')).total,0);
});
test('PostgreSQL denies unpaid, Basic and Premium listing access while customer rollout is disabled, without disabling account management', async () => {
    for(const user of [unpaid,basic,premium]) {
        const account = await rpc('finder_account',[],claimsFor(user,{user_metadata:{role:'administrator'},app_metadata:{role:'administrator'}}));
        assert.equal(account.role,'customer'); assert.equal(account.finderAccess,false); assert.equal(account.savedPropertiesAccess,false);
        await assert.rejects(rpc('finder_properties',[],claimsFor(user)),/active_membership_required/);
        await assert.rejects(rpc('finder_saved_ids',[],claimsFor(user)),/saved_access_denied/);
    }
});
test('PostgreSQL separates Basic search from Premium saves and rechecks subscription cancellation, nonpayment, expiry and revocation', async () => {
    await resetRpcLimits();
    await db.exec('UPDATE finder_security.saved_api_settings SET customer_access_enabled=true'); // local fixtures only
    try {
        assert.equal((await rpc('finder_account',[],claimsFor(basic))).finderAccess,true);
        await rpc('finder_properties',[],claimsFor(basic));
        assert.equal((await rpc('finder_account',[],claimsFor(basic))).savedPropertiesAccess,false);
        await assert.rejects(rpc('finder_saved_ids',[],claimsFor(basic)),/saved_access_denied/);
        await rpc('finder_save_property',[listing],claimsFor(premium));
        for(const patch of ["payment_status='unpaid'","status='canceled'","paid_through=now()-interval '1 hour'","revoked_at=now()",'account_active=false']) {
            await db.exec('UPDATE finder_security.memberships SET '+patch+` WHERE user_id='${premium}'`);
            assert.equal((await rpc('finder_account',[],claimsFor(premium))).finderAccess,false);
            await assert.rejects(rpc('finder_properties',[],claimsFor(premium)),/active_membership_required/);
            await assert.rejects(rpc('finder_saved_ids',[],claimsFor(premium)),/saved_access_denied/);
            await db.exec(`UPDATE finder_security.memberships SET payment_status='paid',status='active',paid_through=now()+interval '1 day',revoked_at=NULL,account_active=true WHERE user_id='${premium}'`);
        }
    } finally {await db.exec('UPDATE finder_security.saved_api_settings SET customer_access_enabled=false');}
});
test('All HTTPS interfaces reject revoked/expired sessions, banned/deleted/unverified users and forged identity claims', async () => {
    for(const patch of [{session_id:session(other)},{sub:'invalid'},{role:'service_role'},{is_anonymous:true},{exp:1}]) {
        for(const name of ['finder_account','finder_properties']) await assert.rejects(rpc(name,[],claimsFor(admin,patch)),/authentication_required|account_unavailable/);
    }
    for(const mutation of [`UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id='${session(admin)}'`,
        `UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='${admin}'`,
        `UPDATE auth.users SET email_confirmed_at=NULL WHERE id='${admin}'`,
        `UPDATE finder_security.account_roles SET is_active=false WHERE user_id='${admin}'`]) {
        await db.exec(mutation);
        for(const name of ['finder_account','finder_properties']) await assert.rejects(rpc(name),/account_unavailable/);
        await assert.rejects(rpc('finder_saved_ids'),/saved_access_denied/);
        await db.exec(`UPDATE auth.sessions SET not_after=NULL WHERE id='${session(admin)}'; UPDATE auth.users SET banned_until=NULL,email_confirmed_at=now() WHERE id='${admin}'; UPDATE finder_security.account_roles SET is_active=true WHERE user_id='${admin}'`);
    }
    await assert.rejects(rpc('finder_account',[other]),/does not exist/);
    await assert.rejects(rpc('finder_properties',[other]),/does not exist/);
});
test('The direct directory fails closed rather than silently truncating at 500 and does not expose private source facts', async () => {
    const before = await rpc('finder_properties');
    assert(!JSON.stringify(before).includes('source_facts')); assert(!JSON.stringify(before).includes('last_checked_at'));
    for(let n=10000;n<10501;n++) await db.query("INSERT INTO crawler.properties(id,source_key,listing_status,availability_status) VALUES($1,'myoko_akiya_bank','active','active')",[uuid(n)]);
    try { await assert.rejects(rpc('finder_properties'),/directory_unavailable/); }
    finally { await db.exec("DELETE FROM crawler.properties WHERE id>='"+uuid(10000)+"' AND id<='"+uuid(10500)+"'"); }
    await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
    try {await assert.rejects(db.exec(httpsMigration),/already or partially applied/);}
    finally {await db.exec('ROLLBACK; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE');}
});

const alertsMigration = readFileSync('sql/proposals/006_finder_property_alerts.sql', 'utf8');
async function alertWorker(name: string, args: unknown[] = []) { return rpc(name, args, {}, 'service_role'); }
async function shiftAlertDays() {
    // Move oldest first so fixture date shifts preserve the immediate unique indexes.
    const rows=(await db.query<{id:string}>("SELECT id FROM finder_security.alert_deliveries WHERE user_id=$1 AND NOT is_test ORDER BY japan_day",[admin])).rows;
    for(const row of rows) await db.query("UPDATE finder_security.alert_deliveries SET japan_day=japan_day-1,accepted_day=accepted_day-1 WHERE id=$1",[row.id]);
}
test('Alerts migration preserves existing data, grants and eligibility while creating only private forced-RLS storage', async () => {
    // Extend the existing platform fixture to model columns already on hosted Auth/crawler.
    await db.exec(`ALTER TABLE auth.users ADD COLUMN email text; UPDATE auth.users SET email='synthetic-'||id||'@example.invalid';
        ALTER TABLE crawler.properties ADD COLUMN first_discovered_at timestamptz NOT NULL DEFAULT now()-interval '1 day';`);
    const before = (await db.query("SELECT md5(string_agg(to_jsonb(p)::text,',' ORDER BY id)) AS hash FROM crawler.properties p")).rows;
    const roles = (await db.query('SELECT * FROM pg_auth_members ORDER BY roleid,member,grantor')).rows;
    await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
    try { await db.exec(alertsMigration); await db.exec(readFileSync('sql/proposals/006_finder_property_alerts.verify.sql', 'utf8')); }
    catch (error) { await db.exec('ROLLBACK'); throw error; }
    finally { await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
    assert.deepEqual((await db.query("SELECT md5(string_agg(to_jsonb(p)::text,',' ORDER BY id)) AS hash FROM crawler.properties p")).rows, before);
    assert.deepEqual((await db.query('SELECT * FROM pg_auth_members ORDER BY roleid,member,grantor')).rows, roles);
    for (const role of ['anon','authenticated','service_role','crawler_writer']) {
        await db.exec(`SET SESSION AUTHORIZATION ${role}; RESET ROLE`);
        try { await assert.rejects(db.exec('SELECT * FROM finder_security.alert_preferences')); }
        finally { await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
    }
});
test('Alert preferences require a real live Premium/admin identity, persist own choices and never accept another owner', async () => {
    assert.deepEqual(await rpc('finder_alert_preferences'), { enabled: false, areas: [], deliveryNeedsReview: false });
    await assert.rejects(rpc('finder_set_alert_preferences', [true, []]), /invalid_alert_preferences/);
    await assert.rejects(rpc('finder_set_alert_preferences', [true, ['invented']]), /invalid_alert_preferences/);
    assert.deepEqual((await rpc('finder_set_alert_preferences', [true, ['myoko','joetsu']])).areas, ['joetsu','myoko']);
    assert.equal((await rpc('finder_alert_preferences')).enabled, true);
    const since=(await db.query<{since:string}>("SELECT area_since->>'myoko' AS since FROM finder_security.alert_preferences WHERE user_id=$1",[admin])).rows[0].since;
    await rpc('finder_set_alert_preferences',[true,['myoko']]);
    await rpc('finder_set_alert_preferences',[true,['myoko','joetsu']]);
    assert.equal((await db.query<{since:string}>("SELECT area_since->>'myoko' AS since FROM finder_security.alert_preferences WHERE user_id=$1",[admin])).rows[0].since,since,'changing another area never drops continuously selected pending discoveries');
    for (const user of [unpaid, basic, premium]) await assert.rejects(rpc('finder_alert_preferences', [], claimsFor(user)), /alerts_access_denied/);
    await assert.rejects(rpc('finder_alert_claim'), /permission denied/);
    await assert.rejects(rpc('finder_alert_preferences', [], {}, 'anon'), /permission denied/);
    await assert.rejects(rpc('finder_alert_preferences', [other]), /does not exist/);
    await db.exec('UPDATE finder_security.saved_api_settings SET customer_access_enabled=true'); // local fixture only
    try {
        await assert.rejects(rpc('finder_alert_preferences', [], claimsFor(basic)), /alerts_access_denied/);
        assert.equal((await rpc('finder_set_alert_preferences', [true, ['shinano','iizuna']], claimsFor(premium))).enabled, true);
        await db.exec(`UPDATE finder_security.memberships SET payment_status='unpaid' WHERE user_id='${premium}'`);
        await assert.rejects(rpc('finder_alert_preferences', [], claimsFor(premium)), /alerts_access_denied/);
        assert.equal((await db.query<{ok:boolean}>('SELECT finder_security.alert_eligible($1,false) AS ok',[premium])).rows[0].ok, false);
    } finally { await db.exec(`UPDATE finder_security.saved_api_settings SET customer_access_enabled=false; UPDATE finder_security.memberships SET payment_status='paid' WHERE user_id='${premium}'`); }
});
const alertListing = uuid(30001), laterAlert = uuid(30002);
async function newAlert(id: string, municipality='Myoko') {
    // PGlite's clock is millisecond-granular; establish a definite fixture opt-in before new events.
    await db.exec("UPDATE finder_security.alert_preferences SET enabled_since=LEAST(enabled_since,clock_timestamp()-interval '1 second'),area_since=(SELECT jsonb_object_agg(v,to_jsonb(clock_timestamp()-interval '1 second')) FROM unnest(areas) v) WHERE enabled");
    await db.query(`INSERT INTO crawler.properties(id,source_key,listing_status,availability_status,municipality,area_en,property_type,transaction_type,original_listing_url,first_discovered_at)
        VALUES($1,'myoko_akiya_bank','active','active',$2,'Taguchi','house','sale',$3,clock_timestamp())`, [id, municipality, 'https://www.city.myoko.niigata.jp/property/'+id+'.pdf']);
}
test('Daily grouping excludes existing/other-area/unsafe/source-restricted rows and leases retry the same frozen payload', async () => {
    assert.equal(await alertWorker('finder_alert_claim'), null, 'initial activation never emails the old inventory');
    await newAlert(alertListing); await newAlert(uuid(30003), 'Shinano Town');
    await newAlert(uuid(30004)); await db.query('UPDATE crawler.properties SET portal_duplicate_review_pending=true WHERE id=$1',[uuid(30004)]);
    const job = await alertWorker('finder_alert_claim'); assert(job);
    const props = job.properties as { listing_id: string }[]; assert.deepEqual(props.map(p=>p.listing_id), [alertListing]);
    assert.equal(await alertWorker('finder_alert_claim'), null, 'a concurrent workflow cannot obtain an active lease');
    await newAlert(laterAlert);
    await db.query("UPDATE finder_security.alert_deliveries SET lease_until=now()-interval '1 second' WHERE id=$1",[job.id]);
    const retry = await alertWorker('finder_alert_claim'); assert.equal(retry.id,job.id); assert.deepEqual(retry.properties,job.properties);
    assert.notEqual(retry.lease,job.lease); assert.equal(await alertWorker('finder_alert_dispatch',[job.id,job.lease]),false);
    assert.equal(await alertWorker('finder_alert_dispatch',[retry.id,retry.lease]),true);
    assert.equal(await alertWorker('finder_alert_complete',[retry.id,retry.lease,'provider-accepted-id',[alertListing]]),true);
    assert.equal(await alertWorker('finder_alert_complete',[retry.id,retry.lease,'provider-accepted-id',[alertListing]]),true);
    assert.equal(await alertWorker('finder_alert_claim'),null,'later discoveries wait for the next Japan calendar day');
    assert.deepEqual((await db.query('SELECT listing_id FROM finder_security.alert_notified WHERE user_id=$1',[admin])).rows,[{listing_id:alertListing}]);
    // Advance only fixture delivery dates: no production clock or records change.
    await shiftAlertDays();
    const nextDay=await alertWorker('finder_alert_claim'); assert(nextDay);
    assert.deepEqual((nextDay.properties as {listing_id:string}[]).map(p=>p.listing_id),[laterAlert]);
    assert.equal(await alertWorker('finder_alert_dispatch',[nextDay.id,nextDay.lease]),true);
    await alertWorker('finder_alert_complete',[nextDay.id,nextDay.lease,'provider-next-day',[laterAlert]]);
    await db.query('UPDATE crawler.properties SET asking_price_jpy=9900000,last_checked_at=clock_timestamp() WHERE id=$1',[alertListing]);
    await shiftAlertDays();
    assert.equal(await alertWorker('finder_alert_claim'),null,'recrawls and price changes do not become new listing alerts');
});
test('Opt-out and role revocation are rechecked before delivery; no empty email or arbitrary test recipient is possible', async () => {
    const testJob = await alertWorker('finder_alert_claim',[admin]); assert.equal(testJob.isTest,true);
    assert.equal((testJob.properties as unknown[]).length>0,true);
    assert.equal(testJob.userId,admin); assert.equal(testJob.recipient, 'synthetic-'+admin+'@example.invalid');
    await assert.rejects(alertWorker('finder_alert_claim',[basic]), /alerts_access_denied/);
    await db.query('UPDATE finder_security.account_roles SET is_active=false WHERE user_id=$1',[admin]);
    assert.equal(await alertWorker('finder_alert_dispatch',[testJob.id,testJob.lease]),false);
    await db.query('UPDATE finder_security.account_roles SET is_active=true WHERE user_id=$1',[admin]);
    const count=(await db.query('SELECT count(*) FROM finder_security.alert_notified')).rows;
    assert.equal(await alertWorker('finder_alert_unsubscribe',[testJob.id,other]),false);
    assert.equal(await alertWorker('finder_alert_unsubscribe',[testJob.id,admin]),true);
    assert.equal((await rpc('finder_alert_preferences')).enabled,false);
    assert.deepEqual((await db.query('SELECT count(*) FROM finder_security.alert_notified')).rows,count);
});
test('An ambiguous outcome beyond the provider idempotency window requires review rather than duplicate sends', async () => {
    await rpc('finder_set_alert_preferences',[true,['myoko']]); await newAlert(uuid(30005));
    await shiftAlertDays();
    const job=await alertWorker('finder_alert_claim'); assert(job);
    assert.equal(await alertWorker('finder_alert_dispatch',[job.id,job.lease]),true);
    await db.query("UPDATE finder_security.alert_deliveries SET first_attempt_at=now()-interval '24 hours',lease_until=now()-interval '1 second' WHERE id=$1",[job.id]);
    assert.equal(await alertWorker('finder_alert_claim'),null);
    assert.equal((await rpc('finder_alert_preferences')).deliveryNeedsReview,true);
    await newAlert(uuid(30006)); assert.equal(await alertWorker('finder_alert_claim'),null,'uncertain delivery blocks a fresh potentially duplicate batch');
});
