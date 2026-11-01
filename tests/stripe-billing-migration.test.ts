import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { privacyDatabase, privacyUuid as id } from './fixtures/privacy-database';
import { deriveBillingState, type BillingState, type BillingRecord } from '../server/billing/model';
import { paidState, stripeCustomer, stripePrices, stripeSubscription } from './fixtures/stripe-billing';
let db: PGlite;
const admin = id(1); let eventNumber = 0;
async function user(n: number, administrator = false) {
    await db.query('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())', [id(n), `synthetic${n}@example.invalid`]);
    await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [id(n + 1000), id(n)]);
    if (administrator) await db.query("INSERT INTO finder_security.account_roles(user_id,account_role) VALUES($1,'administrator')", [id(n)]);
    return id(n);
}
async function rpc(role: string, name: string, args: unknown[] = [], asUser?: string) {
    await db.exec(`SET SESSION AUTHORIZATION ${role}; RESET ROLE`);
    try {
        if (asUser) await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: asUser, session_id: id(Number(asUser.slice(-12)) + 1000), role: 'authenticated', aud: 'authenticated',
            iss: 'https://fgdoqsepihlzfqlqymet.supabase.co/auth/v1', is_anonymous: false, iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600 })]);
        return (await db.query<{ result: Record<string, unknown> }>(`SELECT ${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS result`, args)).rows[0].result;
    } finally { await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
}
const service = (name: string, args: unknown[]) => rpc('service_role', 'public.' + name, args);
async function acquire(owner: string) { return await service('finder_billing_lock', [owner, null, true, null]) as unknown as BillingRecord; }
async function save(b: BillingRecord, state: BillingState, event = 'evt_MigrationTest' + (++eventNumber)) {
    return service('finder_billing_apply', [b.id, b.lease_token, state, event, 'customer.subscription.updated', new Date().toISOString()]);
}
const unlock = (b: BillingRecord) => service('finder_billing_release', [b.id, b.lease_token]);
async function bind(owner: string, customer: string) {
    const b = await acquire(owner); await service('finder_billing_customer', [b.id, b.lease_token, customer, false]); b.customer_id = customer; return b;
}
const membership = async (u: string) => (await db.query<Record<string, unknown>>('SELECT * FROM finder_security.memberships WHERE user_id=$1', [u])).rows[0];
before(async () => {
    db = await privacyDatabase();
    await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
    await db.exec(readFileSync('sql/proposals/007_finder_privacy_requests_and_retention.sql', 'utf8'));
    const https = readFileSync('sql/proposals/005_finder_supabase_https.sql', 'utf8');
    await db.exec(https.slice(https.indexOf('CREATE FUNCTION public.finder_account()'), https.indexOf('CREATE FUNCTION public.finder_properties()')));
    await db.exec('REVOKE ALL ON FUNCTION public.finder_account() FROM PUBLIC,anon,service_role; GRANT EXECUTE ON FUNCTION public.finder_account() TO authenticated');
    await db.exec(readFileSync('sql/proposals/008_finder_stripe_billing.sql', 'utf8'));
    // Live-mode ledger behavior is tested only with synthetic in-memory data.
    await db.exec(readFileSync('sql/proposals/008_finder_stripe_billing.verify.sql', 'utf8'));
    await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE');
    await user(1, true);
    await db.query('INSERT INTO crawler.properties(id) VALUES($1)', [id(999)]);
});
after(async () => { if (db) { assert.equal((await db.query<{ n: number }>('SELECT count(*)::integer n FROM crawler.properties')).rows[0].n, 1); await db.close(); } });

test('Billing tables force RLS; only service RPCs can write paid status, and administrators remain subscription-free', async () => {
    for (const role of ['anon', 'authenticated', 'service_role', 'property_finder_web_reader']) {
        await db.exec(`SET SESSION AUTHORIZATION ${role}; RESET ROLE`);
        try {
            for (const sql of ['SELECT * FROM finder_security.billing_customers', 'SELECT * FROM finder_security.billing_events', "UPDATE finder_security.memberships SET tier='premium',payment_status='paid'"])
                await assert.rejects(db.query(sql), /permission denied/);
        } finally { await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
    }
    await assert.rejects(rpc('authenticated', 'public.finder_billing_lock', [admin, null, true, null], admin), /permission denied/);
    await assert.rejects(acquire(admin), /billing_account_unavailable/);
    const snapshot = await rpc('authenticated', 'public.finder_account', [], admin);
    assert.equal(snapshot.finderAccess, true); assert.equal(snapshot.savedPropertiesAccess, true);
});
test('The production-default database mode refuses Sandbox writes and clients cannot switch modes', async () => {
    const u = await user(6);
    await assert.rejects(service('finder_billing_lock', [u, null, false, null]), /invalid_billing_request/);
    await db.exec('SET SESSION AUTHORIZATION service_role; RESET ROLE');
    try { await assert.rejects(db.exec("UPDATE finder_security.billing_settings SET mode='test'"), /permission denied/); }
    finally { await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
    assert.equal((await db.query<{ n: number }>('SELECT count(*)::integer n FROM finder_security.billing_customers WHERE user_id=$1', [u])).rows[0].n, 0);
});
test('Sandbox is administrator-only and stores a separate simulation without changing accounts, live memberships or privileges', async () => {
    const u = await user(10); const live = await bind(u, 'cus_SameReferenceAcrossModes');
    const liveState = { ...paidState('basic'), subscriptionId: 'sub_ModeIsolation' };
    await save(live, liveState, 'evt_SameReferenceAcrossModes'); await unlock(live);
    await db.query("INSERT INTO finder_security.account_roles(user_id,account_role) VALUES($1,'administrator') ON CONFLICT(user_id) DO UPDATE SET account_role='administrator',is_active=true", [u]);
    const originalMembership = await membership(u);
    const originalAccount = await rpc('authenticated', 'public.finder_account', [], u);
    const originalAuth = (await db.query('SELECT * FROM auth.users WHERE id=$1', [u])).rows;
    const ordinary = await user(11);
    await db.exec("UPDATE finder_security.billing_settings SET mode='test'");
    try {
        await assert.rejects(service('finder_billing_lock', [ordinary, null, false, null]), /billing_account_unavailable/);
        const sandbox = await service('finder_billing_lock', [u, null, false, null]) as unknown as BillingRecord;
        assert.notEqual(sandbox.id, live.id); assert.equal(sandbox.livemode, false);
        assert.deepEqual(sandbox.state, {}, 'live billing proof is never carried into a test record');
        await service('finder_billing_customer', [sandbox.id, sandbox.lease_token, live.customer_id, false]);
        const simulated = { ...paidState('premium'), subscriptionId: liveState.subscriptionId };
        await save(sandbox, simulated, 'evt_SameReferenceAcrossModes');
        assert.deepEqual(await membership(u), originalMembership);
        assert.deepEqual(await rpc('authenticated', 'public.finder_account', [], u), originalAccount);
        assert.deepEqual((await db.query('SELECT * FROM auth.users WHERE id=$1', [u])).rows, originalAuth);
        assert.equal((await db.query<{ n: number }>("SELECT count(*)::integer n FROM finder_security.billing_events WHERE id='evt_SameReferenceAcrossModes'")).rows[0].n, 2);
        await save(sandbox, { ...simulated, status: 'canceled', active: false, entitledPlan: null });
        assert.deepEqual(await membership(u), originalMembership, 'a test cancellation cannot revoke real access');
        await db.exec("UPDATE finder_security.billing_settings SET mode='live'");
        await assert.rejects(save(sandbox, simulated), /billing_mode_mismatch/);
        await db.exec("UPDATE finder_security.billing_settings SET mode='test'");
        await db.query("UPDATE finder_security.account_roles SET account_role='customer' WHERE user_id=$1", [u]);
        await assert.rejects(save(sandbox, simulated), /billing_account_unavailable/);
        await db.query("UPDATE finder_security.account_roles SET account_role='administrator' WHERE user_id=$1", [u]);
        await unlock(sandbox);
    } finally { await db.exec("UPDATE finder_security.billing_settings SET mode='live'"); }
    await assert.rejects(service('finder_billing_lock', [u, null, false, null]), /invalid_billing_request/);
    await db.query("UPDATE finder_security.account_roles SET account_role='customer' WHERE user_id=$1", [u]);
    const reopened = await acquire(u); assert.equal(reopened.id, live.id); assert.equal(reopened.state.entitledPlan, 'basic'); await unlock(reopened);
    assert.deepEqual(await service('finder_billing_lock', [null, live.customer_id, true, 'evt_SameReferenceAcrossModes']), { duplicate: true });
});
test('Leases serialize synchronization, fence expired writers and make duplicate events idempotent', async () => {
    const u = await user(2); const old = await bind(u, 'cus_LeaseTest');
    await assert.rejects(acquire(u), /billing_busy/);
    await db.query("UPDATE finder_security.billing_customers SET lease_until=now()-interval '1 second' WHERE id=$1", [old.id]);
    const fresh = await acquire(u); assert.notEqual(fresh.lease_token, old.lease_token);
    const state = paidState(); state.subscriptionId = 'sub_LeaseTest';
    await assert.rejects(save(old, state), /billing_lease_expired/);
    assert.equal(await unlock(old), false);
    await save(fresh, state, 'evt_DedupTest'); await unlock(fresh);
    assert.deepEqual(await service('finder_billing_lock', [null, 'cus_LeaseTest', true, 'evt_DedupTest']), { duplicate: true });
    assert.equal((await membership(u)).tier, 'premium');
    assert.equal((await db.query<{ n: number }>("SELECT count(*)::integer n FROM finder_security.billing_events WHERE id='evt_DedupTest'")).rows[0].n, 1);
});
test('A scheduled downgrade or its cancellation/replacement changes intent only; effective Basic and paid upgrades change the ledger', async () => {
    const u = await user(3); let b = await bind(u, 'cus_TransitionTest');
    const premium = paidState(); premium.subscriptionId = 'sub_TransitionTest';
    const pending = { ...premium, scheduleId: 'sub_sched_PendingTest', scheduledPlan: 'basic' as const, scheduledAt: premium.paidEnd };
    await save(b, pending); await unlock(b); assert.equal((await membership(u)).tier, 'premium');
    b = await acquire(u); await save(b, { ...pending, scheduleId: 'sub_sched_ReplacementTest' }); await unlock(b);
    assert.equal(new Date((await membership(u)).paid_through as string).toISOString(), premium.paidEnd);
    b = await acquire(u); await save(b, premium); await unlock(b); assert.equal((await membership(u)).tier, 'premium');
    const basic = { ...paidState('basic'), subscriptionId: premium.subscriptionId };
    b = await acquire(u); await save(b, basic); await unlock(b); assert.equal((await membership(u)).tier, 'basic');
    const waiting = deriveBillingState(stripeSubscription('premium', false), paidState('basic'), null, stripePrices, stripeCustomer, false); waiting.subscriptionId = premium.subscriptionId;
    b = await acquire(u); await save(b, waiting); await unlock(b); assert.equal((await membership(u)).tier, 'basic');
    b = await acquire(u);
    await assert.rejects(save(b, { ...waiting, entitledPlan: 'premium' }), /invalid_billing_entitlement/);
    await save(b, premium); await unlock(b); assert.equal((await membership(u)).tier, 'premium');
    await db.exec('UPDATE finder_security.saved_api_settings SET customer_access_enabled=true');
    const snapshot = await rpc('authenticated', 'public.finder_account', [], u); assert.equal(snapshot.savedPropertiesAccess, true);
});
test('Privacy exports include only the owner billing identifiers/state/events, without service leases or other customers', async () => {
    const u = await user(4); const b = await bind(u, 'cus_ExportTest'); const state = { ...paidState('basic'), subscriptionId: 'sub_ExportTest' };
    await save(b, state); await unlock(b);
    const request = (await rpc('authenticated', 'public.finder_privacy_submit', ['access', '', null, crypto.randomUUID()], u)).request as Record<string, unknown>;
    await rpc('authenticated', 'public.finder_privacy_admin_update', [request.id, 'in_progress', 'Verified synthetic request', '', true, true, false, request.updatedAt], admin);
    const data = await rpc('authenticated', 'public.finder_privacy_admin_export', [request.id], admin); const text = JSON.stringify(data);
    assert(text.includes('cus_ExportTest')); assert(text.includes('sub_ExportTest'));
    assert(!text.includes('cus_TransitionTest')); assert(!text.includes('lease_token')); assert(!text.includes('NEVER_EXPORT'));
});
test('Account deletion blocks active billing/open Checkout/stale checks and preserves only necessary billing references after resolved closure', async () => {
    const u = await user(5); const b = await bind(u, 'cus_DeletionTest');
    const active = { ...paidState('basic'), subscriptionId: 'sub_DeletionTest' }; await save(b, active); await unlock(b);
    const resolved = () => rpc('postgres', 'finder_privacy.billing_resolved', [u]);
    assert.equal(await resolved(), false);
    let current = await acquire(u); const canceled = { ...active, status: 'canceled', active: false, entitledPlan: null };
    await save(current, canceled); await unlock(current); assert.equal(await resolved(), true);
    current = await acquire(u); assert.equal(await resolved(), false, 'operation lease prevents closure');
    await service('finder_billing_customer', [current.id, current.lease_token, current.customer_id, true]); await unlock(current);
    assert.equal(await resolved(), false, 'ambiguous/pending Checkout prevents closure');
    current = await acquire(u); await save(current, { ...canceled, checkoutUntil: null }); await unlock(current);
    await db.query("UPDATE finder_security.billing_customers SET synced_at=now()-interval '16 minutes' WHERE user_id=$1", [u]);
    assert.equal(await resolved(), false);
    current = await acquire(u); await save(current, canceled); await unlock(current); assert.equal(await resolved(), true);
    const request = (await rpc('authenticated', 'public.finder_privacy_submit', ['deletion', '', 'account', crypto.randomUUID()], u)).request as Record<string, unknown>;
    await rpc('authenticated', 'public.finder_privacy_admin_update', [request.id, 'in_progress', 'Identity, provider cancellation and retention checked.', '', true, true, false, request.updatedAt], admin);
    await assert.rejects(rpc('authenticated', 'public.finder_privacy_admin_delete_account', [request.id, 'wrong'], admin), /privacy_confirmation_required/);
    const result = await rpc('authenticated', 'public.finder_privacy_admin_delete_account', [request.id, `DELETE ${u} FOR ${request.id}`], admin); assert.equal(result.completed, true);
    const retained = (await db.query<Record<string, unknown>>('SELECT * FROM finder_security.billing_customers WHERE id=$1', [b.id])).rows[0];
    assert.equal(retained.user_id, null); assert.equal(retained.customer_id, 'cus_DeletionTest');
    assert.equal((await db.query<{ n: number }>('SELECT count(*)::integer n FROM finder_security.memberships WHERE user_id=$1', [u])).rows[0].n, 0);
    assert.equal(await service('finder_billing_lock', [null, 'cus_DeletionTest', true, 'evt_AfterDeletion']), null);
});
