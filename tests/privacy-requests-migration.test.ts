import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { privacyDatabase, privacyUuid as id } from './fixtures/privacy-database';

let db: PGlite;
let crawlerBefore: unknown;
const admin = id(1), listing = id(500);
const denied = /permission denied|privacy_admin_required|authentication_required|account_unavailable/;
async function addUser(n: number, administrator = false) {
    const u = id(n);
    await db.query(`INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,now(),$3)`, [u, `user${n}@example.invalid`, JSON.stringify({ full_name: `User ${n}` })]);
    await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [id(n + 10000), u]);
    if (administrator) await db.query(`INSERT INTO finder_security.account_roles(user_id,account_role) VALUES($1,'administrator')`, [u]);
    return u;
}
async function rpc(user: string, name: string, args: unknown[] = [], role = 'authenticated') {
    assert(['authenticated', 'anon', 'service_role', 'finder_privacy_retention_worker'].includes(role));
    await db.exec(`SET SESSION AUTHORIZATION ${role}; RESET ROLE`);
    try {
        await db.query(`SELECT set_config('request.jwt.claims',$1,false)`, [JSON.stringify({ sub: user, session_id: id(Number(user.slice(-12)) + 10000), role: 'authenticated', aud: 'authenticated',
            iss: 'https://fgdoqsepihlzfqlqymet.supabase.co/auth/v1', is_anonymous: false, iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600 })]);
        return (await db.query<{ result: Record<string, unknown> }>(`SELECT public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS result`, args)).rows[0].result;
    } finally { await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
}
async function submit(user: string, type = 'access', scope: string | null = null, details = 'Please review my information', nonce = crypto.randomUUID()) {
    return (await rpc(user, 'finder_privacy_submit', [type, details, scope, nonce])).request as Record<string, unknown>;
}
async function review(request: Record<string, unknown>, status = 'in_progress', hold = false) {
    return rpc(admin, 'finder_privacy_admin_update', [request.id, status, 'Identity and records reviewed; no unresolved external records.', '', true, true, hold, request.updatedAt || request.updated_at]);
}
before(async () => {
    db = await privacyDatabase();
    await addUser(1, true);
    await db.query('INSERT INTO crawler.properties(id) VALUES($1)', [listing]);
    crawlerBefore = (await db.query('SELECT * FROM crawler.properties ORDER BY id')).rows;
    await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
    await db.exec(readFileSync('sql/proposals/007_finder_privacy_requests_and_retention.sql', 'utf8'));
    await db.exec(readFileSync('sql/proposals/007_finder_privacy_requests_and_retention.verify.sql', 'utf8'));
    await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE');
});
after(async () => { if (db) { assert.deepEqual((await db.query('SELECT * FROM crawler.properties ORDER BY id')).rows, crawlerBefore); await db.close(); } });

test('New tables force RLS and deny raw client/service/worker access; cleanup has only its restricted role', async () => {
    const rows = (await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(`SELECT c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='finder_privacy' AND c.relkind='r'`)).rows;
    assert.equal(rows.length, 5); assert(rows.every(r => r.relrowsecurity && r.relforcerowsecurity));
    for (const role of ['anon', 'authenticated', 'service_role', 'finder_privacy_retention_worker']) {
        await db.exec(`SET SESSION AUTHORIZATION ${role}; RESET ROLE`);
        try {
            for (const sql of ['SELECT * FROM finder_privacy.requests', "UPDATE finder_privacy.requests SET status='completed'", "UPDATE finder_privacy.requests SET admin_notes='forged'", 'DELETE FROM finder_privacy.requests']) {
                await assert.rejects(db.query(sql), /permission denied/);
            }
        }
        finally { await db.exec('SET SESSION AUTHORIZATION fixture_superuser; RESET ROLE'); }
    }
    await assert.rejects(rpc(admin, 'finder_privacy_cleanup'), /permission denied/);
    await assert.rejects(rpc(admin, 'finder_privacy_cleanup', [], 'service_role'), /permission denied/);
    const role = (await db.query<{ rolcanlogin: boolean; rolbypassrls: boolean; rolsuper: boolean }>(`SELECT rolcanlogin,rolbypassrls,rolsuper FROM pg_roles WHERE rolname='finder_privacy_retention_worker'`)).rows[0];
    assert(role.rolcanlogin && !role.rolbypassrls && !role.rolsuper);
});
test('Unpaid customers can submit all request types, view only their own status and never see admin notes', async () => {
    const a = await addUser(2), b = await addUser(3);
    for (const type of ['access', 'correction', 'deletion', 'information']) await submit(a, type, type === 'deletion' ? 'personal_data' : null);
    assert.equal(((await rpc(a, 'finder_privacy_requests')).requests as unknown[]).length, 4);
    assert.deepEqual((await rpc(b, 'finder_privacy_requests')).requests, []);
    assert(!JSON.stringify(await rpc(a, 'finder_privacy_requests')).includes('admin_notes'));
    for (const fn of ['finder_privacy_admin_requests', 'finder_privacy_admin_export', 'finder_privacy_admin_delete_account']) {
        const args = fn.endsWith('export') ? [id(999)] : fn.endsWith('account') ? [id(999), 'forged'] : [];
        await assert.rejects(rpc(a, fn, args), denied);
    }
    await assert.rejects(rpc(a, 'finder_privacy_requests', [], 'anon'), /permission denied/);
    await assert.rejects(rpc(id(999), 'finder_privacy_requests'), denied);
});
test('Duplicate active deletion and nonce reuse cannot create duplicate requests or change scope/owner', async () => {
    const u = await addUser(4), nonce = crypto.randomUUID();
    const one = await submit(u, 'deletion', 'account', '', nonce);
    assert.equal((await submit(u, 'deletion', 'account', '', nonce)).id, one.id);
    await assert.rejects(submit(u, 'deletion', 'personal_data'), /privacy_deletion_request_active/);
    await assert.rejects(submit(u, 'access', null, '', nonce), /invalid_privacy_request/);
    assert.equal(((await rpc(u, 'finder_privacy_requests')).requests as unknown[]).length, 1);
    await assert.rejects(submit(u, 'access', 'account'), /invalid_privacy_request/);
    await assert.rejects(submit(u, 'access', null, 'x'.repeat(2001)), /invalid_privacy_request/);
});
test('Administrator processing uses optimistic concurrency, requires rejection reasons and protects privileged fields', async () => {
    const u = await addUser(5), req = await submit(u);
    await assert.rejects(rpc(u, 'finder_privacy_admin_update', [req.id, 'completed', 'forged', '', true, true, false, req.updatedAt]), denied);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_update', [req.id, 'rejected', 'review', '', true, false, false, req.updatedAt]), /privacy_reason_required/);
    const changed = await review(req);
    await assert.rejects(review(req), /privacy_request_changed/);
    const completed = await rpc(admin, 'finder_privacy_admin_update', [req.id, 'completed', 'Provided verified information securely.', 'Response delivered.', true, false, false, changed.updated_at]);
    assert.equal(completed.status, 'completed');
    const own = (await rpc(u, 'finder_privacy_requests')).requests as Record<string, unknown>[];
    assert.equal(own[0].response, 'Response delivered.'); assert(!JSON.stringify(own).includes('Provided verified'));
    assert.equal(own[0].details, '', 'confirmed closure minimises original free text');
});
test('Exports are identity-reviewed, target only the request owner, and exclude passwords/tokens/admin notes/other users', async () => {
    const u = await addUser(6), other = await addUser(7), req = await submit(u);
    await db.query('INSERT INTO finder_security.saved_properties(user_id,property_id) VALUES($1,$2),($3,$2)', [u, listing, other]);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_export', [req.id]), /privacy_review_required/);
    await review(req); const data = await rpc(admin, 'finder_privacy_admin_export', [req.id]), text = JSON.stringify(data);
    assert.equal((data.account as Record<string, unknown>).id, u);
    assert.equal((data.savedProperties as unknown[]).length, 1);
    for (const forbidden of [other, 'user7@example.invalid', 'NEVER_EXPORT', 'admin_notes', 'Identity and records reviewed']) assert(!text.includes(forbidden));
    await db.query("UPDATE finder_privacy.requests SET identity_verified_at=now()-interval '8 days' WHERE id=$1", [req.id]);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_export', [req.id]), /privacy_review_required/);
});
test('Verified deletion is explicit, atomic, own-target only, idempotent and leaves only a minimised case record', async () => {
    const u = await addUser(8), other = await addUser(9), req = await submit(u, 'deletion', 'account', 'PII TO REMOVE');
    await db.query('INSERT INTO finder_security.saved_properties(user_id,property_id) VALUES($1,$2),($3,$2)', [u, listing, other]);
    await db.query("INSERT INTO finder_security.alert_preferences(user_id,enabled,areas) VALUES($1,true,ARRAY['myoko'])", [u]);
    await db.query("INSERT INTO finder_security.account_roles(user_id,account_role) VALUES($1,'customer')", [u]);
    await db.query('INSERT INTO finder_security.saved_property_limits(user_id,window_start) VALUES($1,now())', [u]);
    await db.query("INSERT INTO finder_security.memberships(user_id,tier,account_active,status,payment_status,access_starts_at,paid_through) VALUES($1,'basic',false,'expired','refunded',now()-interval '3 days',now()-interval '2 days')", [u]);
    const delivery = (await db.query<{ id: string }>("INSERT INTO finder_security.alert_deliveries(user_id,japan_day,recipient,properties,status) VALUES($1,current_date,'user8@example.invalid','[{}]','sent') RETURNING id", [u])).rows[0].id;
    await db.query('INSERT INTO finder_security.alert_notified(user_id,listing_id,delivery_id) VALUES($1,$2,$3)', [u, listing, delivery]);
    await db.query("INSERT INTO finder_privacy.alert_unsubscribe_receipts(delivery_id,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [id(808), u]);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [req.id, `DELETE ${u} FOR ${req.id}`]), /privacy_review_required/);
    const reviewed = await review(req);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_update', [req.id, 'completed', 'reviewed', '', true, true, false, reviewed.updated_at]), /privacy_use_deletion_procedure/);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [req.id, `DELETE ${other} FOR ${req.id}`]), /privacy_confirmation_required/);
    const result = await rpc(admin, 'finder_privacy_admin_delete_account', [req.id, `DELETE ${u} FOR ${req.id}`]); assert.equal(result.completed, true);
    assert.equal((await db.query('SELECT * FROM auth.users WHERE id=$1', [u])).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM auth.sessions WHERE user_id=$1', [u])).rows.length, 0);
    for (const table of ['saved_properties', 'saved_property_limits', 'alert_preferences', 'alert_deliveries', 'alert_notified', 'memberships', 'account_roles']) {
        assert.equal((await db.query(`SELECT * FROM finder_security.${table} WHERE user_id=$1`, [u])).rows.length, 0);
    }
    assert.equal((await db.query('SELECT * FROM auth.users WHERE id=$1', [other])).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM finder_security.saved_properties WHERE user_id=$1', [other])).rows.length, 1);
    const row = (await db.query<Record<string, unknown>>('SELECT * FROM finder_privacy.requests WHERE id=$1', [req.id])).rows[0];
    assert.equal(row.user_id, null); assert.equal(row.details, ''); assert.equal(row.admin_notes, ''); assert.equal(row.status, 'completed');
    assert.equal((await rpc(admin, 'finder_privacy_admin_delete_account', [req.id, 'repeat'])).completed, true);
    await assert.rejects(rpc(u, 'finder_privacy_requests'), denied);
    assert.equal((await db.query('SELECT * FROM crawler.properties WHERE id=$1', [listing])).rows.length, 1);
});
test('Holds, administrator targets, active billing, future Stripe, Storage and uncertain delivery all fail closed', async () => {
    const u = await addUser(10), req = await submit(u, 'deletion', 'account'); await review(req, 'in_progress', true);
    const confirm = `DELETE ${u} FOR ${req.id}`;
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [req.id, confirm]), /privacy_legal_hold/);
    await db.query('UPDATE finder_privacy.requests SET legal_hold=false WHERE id=$1', [req.id]);
    await db.exec("UPDATE finder_privacy.settings SET billing_mode='external_check_required'");
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [req.id, confirm]), /privacy_billing_unresolved/);
    await db.exec("UPDATE finder_privacy.settings SET billing_mode='not_integrated'");
    await db.query("INSERT INTO finder_security.memberships(user_id,tier,account_active,status,payment_status,access_starts_at,paid_through) VALUES($1,'premium',true,'active','paid',now(),now()+interval '1 day')", [u]);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [req.id, confirm]), /privacy_billing_unresolved/);
    await db.query('DELETE FROM finder_security.memberships WHERE user_id=$1', [u]);
    await db.query('INSERT INTO storage.objects(id,owner_id) VALUES($1,$2)', [id(999), u]);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [req.id, confirm]), /privacy_external_records_review/);
    await db.exec('DELETE FROM storage.objects');
    await db.query('INSERT INTO auth.scim_users(id,user_id) VALUES($1,$2)', [id(999), u]);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [req.id, confirm]), /privacy_external_records_review/);
    await db.exec('DELETE FROM auth.scim_users');
    await db.query("INSERT INTO finder_security.alert_deliveries(user_id,japan_day,recipient,properties,status) VALUES($1,current_date,'user10@example.invalid','[{}]','uncertain')", [u]);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [req.id, confirm]), /privacy_delivery_unresolved/);
    await db.query("UPDATE finder_security.alert_deliveries SET status='pending',lease_until=now()+interval '5 minutes' WHERE user_id=$1", [u]);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [req.id, confirm]), /privacy_delivery_unresolved/);
    const adminReq = await submit(admin, 'deletion', 'account'); await review(adminReq);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [adminReq.id, `DELETE ${admin} FOR ${adminReq.id}`]), /privacy_admin_account_protected/);
    assert.equal((await db.query('SELECT * FROM auth.users WHERE id=$1', [u])).rows.length, 1);
});
test('An unexpected dependent record rolls the entire deletion/minimisation transaction back', async () => {
    const u = await addUser(11), req = await submit(u, 'deletion', 'account', 'Must survive failed transaction'); await review(req);
    await db.exec('CREATE TABLE public.unexpected_dependency(user_id uuid REFERENCES auth.users(id))');
    await db.query('INSERT INTO public.unexpected_dependency VALUES($1)', [u]);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [req.id, `DELETE ${u} FOR ${req.id}`]), /foreign key/);
    const row = (await db.query<Record<string, unknown>>('SELECT * FROM finder_privacy.requests WHERE id=$1', [req.id])).rows[0];
    assert.equal(row.user_id, u); assert.equal(row.details, 'Must survive failed transaction'); assert.equal(row.account_deleted_at, null);
    assert.equal((await db.query('SELECT * FROM auth.users WHERE id=$1', [u])).rows.length, 1);
    await db.exec('DROP TABLE public.unexpected_dependency');
});
test('Account deletion cannot silently complete another unfulfilled privacy request', async () => {
    const u = await addUser(16), access = await submit(u), deletion = await submit(u, 'deletion', 'account');
    await review(deletion);
    const confirm = `DELETE ${u} FOR ${deletion.id}`;
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [deletion.id, confirm]), /privacy_other_requests_active/);
    await review(access, 'completed');
    assert.equal((await rpc(admin, 'finder_privacy_admin_delete_account', [deletion.id, confirm])).completed, true);
});
test('Future public/crawler ownership cascades cannot silently delete public information', async () => {
    const u = await addUser(15), req = await submit(u, 'deletion', 'account'); await review(req);
    await db.exec('CREATE TABLE crawler.future_public_listing(user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,title text)');
    await db.query("INSERT INTO crawler.future_public_listing VALUES($1,'Public listing must survive')", [u]);
    await assert.rejects(rpc(admin, 'finder_privacy_admin_delete_account', [req.id, `DELETE ${u} FOR ${req.id}`]), /privacy_external_records_review/);
    assert.equal((await db.query('SELECT * FROM crawler.future_public_listing')).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM auth.users WHERE id=$1', [u])).rows.length, 1);
    await db.exec('DROP TABLE crawler.future_public_listing');
});
test('90-day cleanup preserves holds, active/uncertain deliveries, duplicate suppression and 180-day unsubscribe', async () => {
    const u = await addUser(12), held = await addUser(13), active = await addUser(14);
    await db.query("INSERT INTO finder_security.alert_preferences(user_id,enabled,areas,area_since) VALUES($1,true,ARRAY['myoko'],jsonb_build_object('myoko',now()-interval '200 days'))", [u]);
    async function delivery(user: string, days: number, status: string, test = true) {
        return (await db.query<{ id: string }>(`INSERT INTO finder_security.alert_deliveries(user_id,japan_day,is_test,status,recipient,properties,created_at,sent_at)
         VALUES($1,current_date-$2::integer,$3,$4,'private@example.invalid','[{"listing_id":"${listing}"}]',now()-$2::integer*interval '1 day',now()-$2::integer*interval '1 day') RETURNING id`, [user, days, test, status])).rows[0].id;
    }
    const old = await delivery(u, 91, 'sent', false), recent = await delivery(u, 89, 'sent'), uncertain = await delivery(u, 100, 'uncertain');
    const expired = await delivery(u, 200, 'sent');
    const recentAttempt = await delivery(u, 100, 'sent');
    await db.query('UPDATE finder_security.alert_deliveries SET last_attempt_at=now() WHERE id=$1', [recentAttempt]);
    const heldId = await delivery(held, 120, 'sent'), activeId = await delivery(active, 120, 'cancelled');
    await db.query('INSERT INTO finder_security.alert_notified(user_id,listing_id,delivery_id) VALUES($1,$2,$3)', [u, listing, old]);
    await db.query("INSERT INTO finder_privacy.holds(user_id,reason) VALUES($1,'Unresolved investigation')", [held]);
    await submit(active);
    await db.query("INSERT INTO finder_privacy.alert_unsubscribe_receipts(delivery_id,user_id,expires_at) VALUES($1,$2,now()-interval '1 day')", [id(551), u]);
    const result = await rpc(admin, 'finder_privacy_cleanup', [], 'finder_privacy_retention_worker'); assert.equal(result.deliveryRowsDeleted, 2);
    assert.equal(result.expiredReceiptsDeleted, 1);
    assert.equal((await db.query('SELECT * FROM finder_security.alert_deliveries WHERE id=$1', [old])).rows.length, 0);
    for (const keep of [recent, uncertain, heldId, activeId, recentAttempt]) assert.equal((await db.query('SELECT * FROM finder_security.alert_deliveries WHERE id=$1', [keep])).rows.length, 1);
    assert.equal((await db.query<{ delivery_id: string | null }>('SELECT delivery_id FROM finder_security.alert_notified WHERE user_id=$1', [u])).rows[0].delivery_id, null);
    assert.equal((await db.query('SELECT * FROM finder_privacy.alert_unsubscribe_receipts WHERE delivery_id=$1', [old])).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM finder_privacy.alert_unsubscribe_receipts WHERE delivery_id=$1', [expired])).rows.length, 0);
    // Existing candidate logic still excludes previously notified listings after delivery deletion.
    assert.deepEqual((await db.query<{ p: unknown }>('SELECT finder_security.alert_candidates($1,false) AS p', [u])).rows[0].p, []);
    assert.equal(await rpc(u, 'finder_alert_unsubscribe', [old, u], 'service_role'), true);
    assert.equal(await rpc(u, 'finder_alert_unsubscribe', [old, held], 'service_role'), false);
    assert.equal((await db.query<{ enabled: boolean }>('SELECT enabled FROM finder_security.alert_preferences WHERE user_id=$1', [u])).rows[0].enabled, false);
    assert.equal((await rpc(admin, 'finder_privacy_cleanup', [], 'finder_privacy_retention_worker')).deliveryRowsDeleted, 0);
    assert.equal((await db.query('SELECT * FROM crawler.properties WHERE id=$1', [listing])).rows.length, 1);
});
