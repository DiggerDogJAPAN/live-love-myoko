import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { Client } from 'pg';
import { savedPropertyOperation } from '../server/property-finder/saved-database';
import type { CustomerGrant } from '../server/property-finder/membership';

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

test('Current saved dashboard prices use the eligible view; removed/unpublished/private rows become safe removable tombstones', async () => {
    await save(admin, listing2);
    await db.query("INSERT INTO crawler.properties(id,source_key,listing_status,availability_status) VALUES($1,'myoko_akiya_bank','active','active')", [uuid(104)]);
    await save(admin, uuid(104));
    await db.query('UPDATE crawler.properties SET asking_price_jpy=2200000 WHERE id=$1', [listing]);
    const adapter = { connect: async () => undefined, end: async () => undefined, query: async (query: string, args?: unknown[]) => db.query(query, args) } as unknown as Client;
    const grant: CustomerGrant = { kind: 'customer', role: 'administrator', userId: admin, sessionId: session(admin), tier: null, validUntil: Date.now() + 3600000 };
    const result = await asReader(() => savedPropertyOperation({}, grant, { operation: 'list' }, adapter));
    assert('items' in result); assert.equal(result.items.find(item => item.propertyId === listing)?.property?.askingPriceJpy, 2200000);
    await db.query("UPDATE crawler.properties SET availability_status='contracted' WHERE id=$1", [listing]);
    await db.query('DELETE FROM crawler.properties WHERE id=$1', [listing2]);
    await db.query("UPDATE crawler.properties SET listing_status='unpublished' WHERE id=$1", [uuid(104)]);
    const hidden = await asReader(() => savedPropertyOperation({}, grant, { operation: 'list' }, adapter));
    assert('items' in hidden); assert.equal(hidden.items.length, 3); assert(hidden.items.every(item => item.property === null));
    await assert.rejects(save(admin, listing), /saved_listing_unavailable/); await assert.rejects(save(admin, privateListing), /saved_listing_unavailable/);
    for (const id of [listing, listing2, uuid(104)]) await asReader(() => db.query('SELECT finder_security.remove_saved_property($1::uuid,$2::uuid,$3::uuid)', [admin, session(admin), id]));
    assert.equal((await ids()).length, 0);
});

test('Shared database account rate limits persist across requests, with safe idempotent removals', async () => {
    await db.query('DELETE FROM finder_security.saved_property_limits WHERE user_id=$1', [other]);
    for (let n = 0; n < 30; n++) await asReader(() => db.query('SELECT finder_security.remove_saved_property($1::uuid,$2::uuid,$3::uuid)', [other, session(other), listing]));
    await assert.rejects(asReader(() => db.query('SELECT finder_security.remove_saved_property($1::uuid,$2::uuid,$3::uuid)', [other, session(other), listing])), /saved_rate_limited/);
    await db.query("UPDATE finder_security.saved_property_limits SET window_start=now()-interval '2 minutes' WHERE user_id=$1", [other]);
    assert.deepEqual(await ids(other), []);
});

test('Keyset pagination handles same-millisecond saves and a removed cursor without duplicates or stale snapshots', async () => {
    await db.query('DELETE FROM finder_security.saved_properties WHERE user_id=$1', [admin]);
    await db.query('DELETE FROM finder_security.saved_property_limits WHERE user_id=$1', [admin]);
    for (let n = 200; n < 245; n++) await db.query("INSERT INTO finder_security.saved_properties(user_id,property_id,saved_at) VALUES($1,$2,'2026-10-29T00:00:00.000Z')", [admin, uuid(n)]);
    const adapter = { connect: async () => undefined, end: async () => undefined, query: async (query: string, args?: unknown[]) => db.query(query, args) } as unknown as Client;
    const grant: CustomerGrant = { kind: 'customer', role: 'administrator', userId: admin, sessionId: session(admin), tier: null, validUntil: Date.now() + 3600000 };
    const received: string[] = []; let cursor: string | undefined;
    do {
        const result = await asReader(() => savedPropertyOperation({}, grant, { operation: 'list', cursor }, adapter)); assert('items' in result);
        assert(result.items.length <= 20); assert(result.items.every(item => item.property === null)); received.push(...result.items.map(item => item.propertyId));
        cursor = result.nextCursor || undefined;
        if (cursor && received.length === 20) await db.query('DELETE FROM finder_security.saved_properties WHERE user_id=$1 AND property_id=$2', [admin, result.items.at(-1)!.propertyId]);
    } while (cursor);
    assert.equal(received.length, 45); assert.equal(new Set(received).size, 45);
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

test('Saved operations explicitly scope private writes while preserving the existing reader read-only default', async () => {
    await db.query('DELETE FROM finder_security.saved_property_limits WHERE user_id=$1', [admin]);
    const adapter = { connect: async () => undefined, end: async () => undefined, query: async (query: string, args?: unknown[]) => db.query(query, args) } as unknown as Client;
    const grant: CustomerGrant = { kind: 'customer', role: 'administrator', userId: admin, sessionId: session(admin), tier: null, validUntil: Date.now() + 3600000 };
    await db.exec('SET default_transaction_read_only=on');
    try {
        await asReader(() => savedPropertyOperation({}, grant, { operation: 'remove', propertyId: listing }, adapter));
        const setting = await db.query<{ default_transaction_read_only: string }>('SHOW default_transaction_read_only');
        assert.equal(setting.rows[0].default_transaction_read_only, 'on');
    } finally { await db.exec('SET default_transaction_read_only=off'); }
});

test('Replaying the proposal fails transactionally without overwriting existing saved records', async () => {
    const before = (await db.query('SELECT user_id,property_id,saved_at FROM finder_security.saved_properties ORDER BY user_id,property_id')).rows;
    await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
    try { await assert.rejects(db.exec(migration), /Customer view changed|already or partially applied/); }
    finally { await db.exec('ROLLBACK; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
    assert.deepEqual((await db.query('SELECT user_id,property_id,saved_at FROM finder_security.saved_properties ORDER BY user_id,property_id')).rows, before);
});


test('Saved mutations honor restrictive customer RLS even though the helper owner can see a broader view', async () => {
    const hidden = uuid(888);
    await db.query("INSERT INTO crawler.properties(id,source_key,listing_status,availability_status,portal_duplicate_review_pending) VALUES($1,'myoko_akiya_bank','active','active',true)", [hidden]);
    assert.equal((await db.query('SELECT listing_id FROM property_api.customer_properties WHERE listing_id=$1', [hidden])).rows.length, 1, 'fixture owner bypasses restrictive RLS');
    const adapter = { connect: async () => undefined, end: async () => undefined, query: async (query: string, args?: unknown[]) => db.query(query, args) } as unknown as Client;
    const grant: CustomerGrant = { kind: 'customer', role: 'administrator', userId: admin, sessionId: session(admin), tier: null, validUntil: Date.now() + 3600000 };
    await assert.rejects(asReader(() => savedPropertyOperation({}, grant, { operation: 'save', propertyId: hidden }, adapter)), e => (e as { code?: string }).code === 'saved_listing_unavailable');
    assert.equal((await db.query('SELECT * FROM finder_security.saved_properties WHERE user_id=$1 AND property_id=$2', [admin, hidden])).rows.length, 0);
    const allowed = uuid(777);
    await asReader(() => savedPropertyOperation({}, grant, { operation: 'save', propertyId: allowed }, adapter));
    assert.equal((await db.query('SELECT * FROM finder_security.saved_properties WHERE user_id=$1 AND property_id=$2', [admin, allowed])).rows.length, 1);
});
