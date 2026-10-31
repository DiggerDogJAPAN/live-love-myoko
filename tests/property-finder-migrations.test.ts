import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { authorizeMembership, type MembershipSnapshot } from './fixtures/membership-policy';

// In-memory PostgreSQL only: no environment, credentials, network or production URLs.
let db: PGlite;
let protectedBefore: unknown;
const paid = '00000000-0000-4000-8000-000000000101', unpaid = '00000000-0000-4000-8000-000000000102', admin = '00000000-0000-4000-8000-000000000103';
const paidSession = '00000000-0000-4000-8000-000000000201', unpaidSession = '00000000-0000-4000-8000-000000000202', adminSession = '00000000-0000-4000-8000-000000000203';
async function asRole<T>(role: string, task: () => Promise<T>): Promise<T> {
    assert(['anon', 'authenticated', 'authenticator', 'service_role', 'crawler_writer', 'crawler_customer_reader', 'property_finder_web_reader'].includes(role));
    await db.exec(`SET SESSION AUTHORIZATION ${role}`);
    try { return await task(); } finally { await db.exec('RESET ROLE; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
}
const denied = (e: unknown) => (e as { code?: string }).code === '42501';
async function platformFixture(): Promise<PGlite> {
    const database = await PGlite.create();
    await database.exec(`
        -- Rename the PGlite bootstrap role so postgres can model the NON-superuser
        -- hosted role. The bootstrap role may not be demoted by PostgreSQL itself.
        CREATE ROLE fixture_superuser SUPERUSER;
        SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE;
        ALTER ROLE postgres RENAME TO fixture_bootstrap;
        CREATE ROLE postgres LOGIN NOSUPERUSER BYPASSRLS CREATEROLE CREATEDB;
        GRANT CREATE ON DATABASE postgres TO postgres;
        CREATE ROLE supabase_admin SUPERUSER;
        CREATE ROLE supabase_auth_admin NOLOGIN;
        CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
        CREATE ROLE authenticator NOLOGIN;
        CREATE ROLE crawler_writer NOLOGIN; CREATE ROLE crawler_customer_reader NOLOGIN;
        CREATE ROLE property_finder_web_reader LOGIN NOINHERIT;
        GRANT crawler_customer_reader TO property_finder_web_reader;
        CREATE SCHEMA auth AUTHORIZATION supabase_admin;
        GRANT USAGE,CREATE ON SCHEMA auth TO supabase_auth_admin;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz,deleted_at timestamptz,is_anonymous boolean,email_confirmed_at timestamptz);
        CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
        ALTER TABLE auth.users OWNER TO supabase_auth_admin; ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;
        ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY; ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;
        -- Only existing postgres access; no Auth ownership or grant authority.
        GRANT USAGE ON SCHEMA auth TO postgres;
        GRANT SELECT,REFERENCES ON auth.users,auth.sessions TO postgres;
        SET SESSION AUTHORIZATION postgres; RESET ROLE;
        CREATE SCHEMA crawler; CREATE TABLE crawler.properties(id integer PRIMARY KEY,original text);
        INSERT INTO crawler.properties VALUES(1,'Existing record remains unchanged');
        ALTER TABLE crawler.properties ENABLE ROW LEVEL SECURITY; ALTER TABLE crawler.properties FORCE ROW LEVEL SECURITY;
        CREATE POLICY original_reader ON crawler.properties FOR SELECT TO crawler_customer_reader USING(true);
        CREATE POLICY original_writer ON crawler.properties FOR ALL TO crawler_writer USING(true) WITH CHECK(true);
        GRANT USAGE ON SCHEMA crawler TO crawler_writer; GRANT SELECT,UPDATE ON crawler.properties TO crawler_writer;
        GRANT SELECT ON crawler.properties TO crawler_customer_reader;
        CREATE SCHEMA property_api; CREATE VIEW property_api.customer_properties WITH(security_invoker=true,security_barrier=true) AS SELECT id,original FROM crawler.properties;
        GRANT USAGE ON SCHEMA property_api TO crawler_customer_reader; GRANT SELECT ON property_api.customer_properties TO crawler_customer_reader;
        -- Catch accidental reliance on postgres's pre-existing permissive defaults.
        ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO authenticated,service_role;
        ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
        SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE;
    `);
    return database;
}
async function protectedState() {
    const queries = [
        `SELECT n.nspname,r.rolname,n.nspacl::text FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname IN ('auth','crawler','property_api') ORDER BY n.nspname`,
        `SELECT n.nspname,c.relname,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('auth','crawler','property_api') AND c.relkind IN ('r','v') ORDER BY n.nspname,c.relname`,
        `SELECT n.nspname,c.relname,a.attname,a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('auth','crawler','property_api') AND a.attnum>0 ORDER BY n.nspname,c.relname,a.attnum`,
        `SELECT * FROM pg_policies WHERE schemaname IN ('auth','crawler','property_api') ORDER BY schemaname,tablename,policyname`,
        `SELECT * FROM pg_auth_members ORDER BY roleid,member`,
        `SELECT * FROM pg_default_acl ORDER BY oid`,
        `SELECT rolname,rolsuper,rolbypassrls,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin FROM pg_roles ORDER BY rolname`,
        `SELECT pg_get_viewdef('property_api.customer_properties'::regclass,true)`,
        `SELECT to_jsonb(p) FROM crawler.properties p ORDER BY id`,
        `SELECT to_jsonb(u) FROM auth.users u ORDER BY id`,
        `SELECT to_jsonb(s) FROM auth.sessions s ORDER BY id`,
    ];
    const result = [];
    for (const query of queries) result.push((await db.query(query)).rows);
    return result;
}
before(async () => {
    db = await platformFixture();
    await db.query(`INSERT INTO auth.users(id,is_anonymous,email_confirmed_at) VALUES($1,false,now()),($2,false,now()),($3,false,now())`, [paid, unpaid, admin]);
    await db.query(`INSERT INTO auth.sessions(id,user_id) VALUES($1,$2),($3,$4),($5,$6)`, [paidSession, paid, unpaidSession, unpaid, adminSession, admin]);
    protectedBefore = await protectedState();
    await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
    await db.exec(readFileSync('sql/proposals/001_finder_membership_foundation.sql', 'utf8'));
    await db.exec(readFileSync('sql/proposals/002_finder_accounts.sql', 'utf8'));
    await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE');
    assert.equal((await db.query<{ count: number }>('SELECT count(*) AS count FROM finder_security.memberships')).rows[0].count, 0);
    assert.equal((await db.query<{ count: number }>('SELECT count(*) AS count FROM finder_security.account_roles')).rows[0].count, 0);
    assert.deepEqual(await protectedState(), protectedBefore, 'migrations cannot change managed Auth/property catalogs, defaults, roles or data');
    await db.query(`INSERT INTO finder_security.memberships(user_id,tier,account_active,status,payment_status,access_starts_at,paid_through) VALUES($1,'basic',true,'active','paid',now()-interval '1 day',now()+interval '1 day')`, [paid]);
    await db.query(`INSERT INTO finder_security.account_roles(user_id,account_role) VALUES($1,'administrator')`, [admin]);
});
after(async () => { await db?.close(); });

test('Both proposals execute as non-superuser postgres without Auth grant authority, changing no existing catalogs, roles or data', async () => {
    const actor = (await db.query<{ rolsuper: boolean; rolbypassrls: boolean }>(`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='postgres'`)).rows[0];
    assert.equal(actor.rolsuper, false); assert.equal(actor.rolbypassrls, true);
    const rights = (await db.query<{ can_grant: boolean; is_owner: boolean; reader_auth: boolean }>(`SELECT has_schema_privilege('postgres','auth','USAGE WITH GRANT OPTION') AS can_grant,
        pg_has_role('postgres','supabase_auth_admin','USAGE') AS is_owner,
        has_schema_privilege('property_finder_web_reader','auth','USAGE') AS reader_auth`)).rows[0];
    assert.equal(rights.can_grant, false); assert.equal(rights.is_owner, false); assert.equal(rights.reader_auth, false);
    assert.equal((await db.query(`SELECT * FROM pg_policies WHERE schemaname='auth'`)).rows.length, 0);
    assert.equal((await db.query(`SELECT * FROM pg_roles WHERE rolname='finder_entitlement_owner'`)).rows.length, 0);
    assert.deepEqual((await db.query('SELECT * FROM crawler.properties')).rows, [{ id: 1, original: 'Existing record remains unchanged' }]);
    const view = (await db.query<{ reloptions: string[] }>(`SELECT reloptions FROM pg_class WHERE oid='property_api.customer_properties'::regclass`)).rows[0];
    assert(view.reloptions.includes('security_invoker=true') && view.reloptions.includes('security_barrier=true'));
    assert.equal((await db.query(`SELECT policyname FROM pg_policies WHERE schemaname='crawler'`)).rows.length, 2);
    await asRole('crawler_writer', async () => { assert.equal((await db.query('SELECT * FROM crawler.properties')).rows.length, 1); });
    await asRole('property_finder_web_reader', async () => { await db.exec('SET ROLE crawler_customer_reader'); assert.equal((await db.query('SELECT * FROM property_api.customer_properties')).rows.length, 1); await db.exec('RESET ROLE'); });
});

test('Anonymous, authenticated, service-role and crawler writer roles cannot read or modify private roles/memberships or execute either helper', async () => {
    for (const role of ['anon', 'authenticated', 'authenticator', 'service_role', 'crawler_writer', 'crawler_customer_reader']) await asRole(role, async () => {
        for (const query of ['SELECT * FROM finder_security.memberships', 'SELECT * FROM finder_security.account_roles',
            `SELECT * FROM finder_security.membership_snapshot('${paid}','${paidSession}')`, `SELECT * FROM finder_security.account_snapshot('${paid}','${paidSession}')`,
            `UPDATE finder_security.account_roles SET account_role='administrator'`, 'DELETE FROM finder_security.memberships']) await assert.rejects(db.query(query), denied);
    });
});

test('The web login can only read fixed helper results; it cannot read Auth/ledger tables, write entitlements or SET the helper owner', async () => {
    await asRole('property_finder_web_reader', async () => {
        for (const query of ['SELECT * FROM auth.users', 'SELECT * FROM auth.sessions', 'SELECT * FROM finder_security.memberships', 'SELECT * FROM finder_security.account_roles',
            `UPDATE finder_security.memberships SET tier='premium'`, `INSERT INTO finder_security.account_roles(user_id,account_role) VALUES('${unpaid}','administrator')`, 'SET ROLE postgres', 'SET ROLE supabase_auth_admin']) await assert.rejects(db.query(query), denied);
        const rows = (await db.query<Record<string, unknown>>('SELECT * FROM finder_security.membership_snapshot($1,$2)', [paid, paidSession])).rows;
        assert.equal(rows.length, 1); assert.equal(rows[0].schema_version, 1); assert.equal(rows[0].tier, 'basic');
        assert(!Object.keys(rows[0]).some(k => ['email', 'password', 'refresh_token'].includes(k)));
    });
});

test('Unpaid accounts get a customer role and no subscription; an explicit administrator has no fabricated tier or payment', async () => {
    await asRole('property_finder_web_reader', async () => {
        const u = (await db.query<Record<string, unknown>>('SELECT * FROM finder_security.account_snapshot($1,$2)', [unpaid, unpaidSession])).rows[0];
        assert.equal(u.schema_version, 2); assert.equal(u.account_active, true); assert.equal(u.account_role, 'customer');
        assert.equal(u.tier, null); assert.equal(u.payment_status, 'unpaid'); assert.equal(u.subscription_active, false);
        const a = (await db.query<Record<string, unknown>>('SELECT * FROM finder_security.account_snapshot($1,$2)', [admin, adminSession])).rows[0];
        assert.equal(a.account_role, 'administrator'); assert.equal(a.tier, null); assert.equal(a.payment_status, 'unpaid');
        assert.equal((await db.query('SELECT * FROM finder_security.account_snapshot($1,$2)', [paid, unpaidSession])).rows.length, 0);
    });
    assert.equal((await db.query('SELECT * FROM finder_security.memberships')).rows.length, 1, 'Only the paid test fixture exists; migrations seeded nothing');
});

test('Private tables retain forced RLS and fixed postgres-owned helpers have only explicitly permitted execution', async () => {
    const functions = (await db.query<{ owner: string; prosecdef: boolean; provolatile: string; proconfig: string[] }>(`
        SELECT pg_get_userbyid(proowner) AS owner,prosecdef,provolatile,proconfig FROM pg_proc
        WHERE pronamespace='finder_security'::regnamespace ORDER BY proname`)).rows;
    assert.equal(functions.length, 2);
    for (const fn of functions) {
        assert.equal(fn.owner, 'postgres'); assert.equal(fn.prosecdef, true); assert.equal(fn.provolatile, 's');
        assert(fn.proconfig.includes('search_path=pg_catalog') && fn.proconfig.includes('row_security=on'));
    }
    const tables = (await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
        SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='finder_security'::regnamespace AND relkind='r'`)).rows;
    assert.equal(tables.length, 2); assert(tables.every(t => t.relrowsecurity && t.relforcerowsecurity));
    assert.equal((await db.query(`SELECT * FROM pg_policies WHERE schemaname='finder_security'`)).rows.length, 0);
    for (const role of ['anon', 'authenticated', 'service_role', 'authenticator', 'crawler_writer', 'crawler_customer_reader']) {
        for (const fn of ['membership_snapshot', 'account_snapshot']) {
            const row = (await db.query<{ execute: boolean }>(`SELECT has_function_privilege($1,$2,'EXECUTE') AS execute`, [role, `finder_security.${fn}(uuid,uuid)`])).rows[0];
            assert.equal(row.execute, false, `${role} cannot execute ${fn}, even through permissive global defaults`);
        }
    }
});

test('Temporary shadow tables, search_path and forged JWT settings cannot promote an unpaid account', async () => {
    await asRole('property_finder_web_reader', async () => {
        await db.exec(`CREATE TEMP TABLE memberships(user_id uuid,tier text); INSERT INTO memberships VALUES('${unpaid}','premium');
            CREATE TEMP TABLE account_roles(user_id uuid,account_role text); INSERT INTO account_roles VALUES('${unpaid}','administrator');
            SET search_path=pg_temp,public; SET request.jwt.claims='{"role":"administrator","tier":"premium"}';`);
        try {
            const row = (await db.query<Record<string, unknown>>('SELECT * FROM finder_security.account_snapshot($1,$2)', [unpaid, unpaidSession])).rows[0];
            assert.equal(row.account_role, 'customer'); assert.equal(row.tier, null); assert.equal(row.subscription_active, false);
        } finally { await db.exec('DROP TABLE pg_temp.memberships,pg_temp.account_roles; RESET search_path; RESET request.jwt.claims'); }
    });
});

function snapshot(row: Record<string, unknown>): MembershipSnapshot {
    const date = (value: unknown) => value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : null;
    return { schemaVersion: Number(row.schema_version), userId: String(row.user_id), sessionId: String(row.session_id),
        sessionActive: row.session_active === true, sessionValidUntil: date(row.session_valid_until), accountActive: row.account_active === true,
        role: row.account_role as 'customer' | 'administrator' | undefined, subscriptionActive: row.subscription_active === true,
        tier: typeof row.tier === 'string' ? row.tier : null, status: String(row.status), paymentStatus: String(row.payment_status),
        accessStartsAt: date(row.access_starts_at), paidThrough: date(row.paid_through), revokedAt: date(row.revoked_at) };
}
async function sqlSnapshot(userId: string, sessionId: string, version = 2) {
    return asRole('property_finder_web_reader', async () => {
        const fn = version === 2 ? 'account_snapshot' : 'membership_snapshot';
        return snapshot((await db.query<Record<string, unknown>>(`SELECT * FROM finder_security.${fn}($1,$2)`, [userId, sessionId])).rows[0]);
    });
}

test('Real SQL results preserve Basic/Premium checks, private administrator access and immediate expiry/disable/revocation denial', async () => {
    const identity = (userId: string, sessionId: string) => ({ kind: 'customer' as const, userId, sessionId, tokenExpiresAt: Date.now() + 60000 });
    const customer = identity(paid, paidSession), administrator = identity(admin, adminSession);
    assert.equal(authorizeMembership(customer, await sqlSnapshot(paid, paidSession), 'listings:read').tier, 'basic');
    const basic = await sqlSnapshot(paid, paidSession);
    assert.throws(() => authorizeMembership(customer, basic, 'maps:read'));
    assert.equal(authorizeMembership(administrator, await sqlSnapshot(admin, adminSession), 'maps:read').tier, null);
    const unpaidAccount = await sqlSnapshot(unpaid, unpaidSession);
    assert.throws(() => authorizeMembership(identity(unpaid, unpaidSession), unpaidAccount, 'listings:read'));
    await db.exec('BEGIN');
    try {
        await db.query(`UPDATE finder_security.memberships SET tier='premium' WHERE user_id=$1`, [paid]);
        assert.equal(authorizeMembership(customer, await sqlSnapshot(paid, paidSession), 'maps:read').tier, 'premium');
    } finally { await db.exec('ROLLBACK'); }
    for (const mutation of [
        `UPDATE finder_security.memberships SET paid_through=now()-interval '1 second' WHERE user_id='${paid}'`,
        `UPDATE finder_security.memberships SET revoked_at=now() WHERE user_id='${paid}'`,
        `UPDATE finder_security.memberships SET payment_status='unpaid' WHERE user_id='${paid}'`,
        `UPDATE auth.users SET email_confirmed_at=NULL WHERE id='${paid}'`,
    ]) {
        await db.exec('BEGIN');
        try {
            await db.exec(mutation);
            const v1 = await sqlSnapshot(paid, paidSession, 1), v2 = await sqlSnapshot(paid, paidSession, 2);
            for (const value of [v1, v2]) assert.throws(() => authorizeMembership(customer, value, 'listings:read'));
        } finally { await db.exec('ROLLBACK'); }
    }
    await db.exec('BEGIN');
    try {
        await db.query(`UPDATE finder_security.account_roles SET is_active=false WHERE user_id=$1`, [admin]);
        const disabled = await sqlSnapshot(admin, adminSession);
        assert.throws(() => authorizeMembership(administrator, disabled, 'maps:read'));
    } finally { await db.exec('ROLLBACK'); }
});

test('Missing existing Auth privileges and running 002 before revised 001 abort without leaving partial objects', async () => {
    const fresh = await platformFixture();
    try {
        await fresh.exec('SET SESSION AUTHORIZATION property_finder_web_reader; RESET ROLE');
        await assert.rejects(fresh.exec(readFileSync('sql/proposals/001_finder_membership_foundation.sql', 'utf8')), e => (e as { code?: string }).code === 'P0001');
        await fresh.exec('ROLLBACK; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE');
        await fresh.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
        await assert.rejects(fresh.exec(readFileSync('sql/proposals/002_finder_accounts.sql', 'utf8')), e => (e as { code?: string }).code === 'P0001');
        await fresh.exec('ROLLBACK; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE');
        await fresh.exec('REVOKE SELECT ON auth.users FROM postgres; SET SESSION AUTHORIZATION postgres; RESET ROLE');
        await assert.rejects(fresh.exec(readFileSync('sql/proposals/001_finder_membership_foundation.sql', 'utf8')), e => (e as { code?: string }).code === 'P0001');
        await fresh.exec('ROLLBACK; SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE');
        assert.equal((await fresh.query<{ schema: string | null }>(`SELECT to_regnamespace('finder_security') AS schema`)).rows[0].schema, null);
        assert.equal((await fresh.query(`SELECT * FROM pg_roles WHERE rolname='finder_entitlement_owner'`)).rows.length, 0);
    } finally { await fresh.close(); }
});

test('Application foreign keys preserve normal managed Auth deletion and cascade only the matching private account rows', async () => {
    await db.exec('BEGIN');
    try {
        await db.exec('SET LOCAL ROLE supabase_auth_admin');
        await db.query('DELETE FROM auth.sessions WHERE user_id=$1', [admin]);
        await db.query('DELETE FROM auth.users WHERE id=$1', [admin]);
        await db.exec('RESET ROLE');
        assert.equal((await db.query('SELECT * FROM finder_security.account_roles WHERE user_id=$1', [admin])).rows.length, 0);
        assert.equal((await db.query('SELECT * FROM finder_security.memberships WHERE user_id=$1', [paid])).rows.length, 1);
        assert.equal((await db.query('SELECT * FROM crawler.properties')).rows.length, 1);
    } finally { await db.exec('ROLLBACK'); }
});

test('Live session removal, expiry, disabled accounts, unverified email, bans and anonymous users fail closed', async () => {
    for (const mutation of [`UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id='${unpaidSession}'`,
        `INSERT INTO finder_security.account_roles(user_id,is_active) VALUES('${unpaid}',false)`,
        `UPDATE auth.users SET email_confirmed_at=NULL WHERE id='${unpaid}'`, `UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='${unpaid}'`,
        `UPDATE auth.users SET deleted_at=now() WHERE id='${unpaid}'`, `UPDATE auth.users SET is_anonymous=true WHERE id='${unpaid}'`]) {
        await db.exec('BEGIN');
        try { await db.exec(mutation); await asRole('property_finder_web_reader', async () => {
            const row = (await db.query<Record<string, unknown>>('SELECT * FROM finder_security.account_snapshot($1,$2)', [unpaid, unpaidSession])).rows[0];
            assert(row.account_active === false || row.session_active === false);
        }); } finally { await db.exec('ROLLBACK'); }
    }
    await db.query('DELETE FROM auth.sessions WHERE id=$1', [unpaidSession]);
    await asRole('property_finder_web_reader', async () => { assert.equal((await db.query('SELECT * FROM finder_security.account_snapshot($1,$2)', [unpaid, unpaidSession])).rows.length, 0); });
});
