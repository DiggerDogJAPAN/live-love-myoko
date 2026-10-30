import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT, type JWTVerifyGetKey } from 'jose';
import { handleFinderRequest, type FinderEnv } from '../server/property-finder/api';
import { verifySupabaseIdentity } from '../server/property-finder/customer-auth';
import type { MembershipSnapshot } from '../server/property-finder/membership';
import type { SavedQuery, SavedResult } from '../server/property-finder/saved-database';
import { accountDetails } from '../server/auth/account';
import { FinderHttpError } from '../server/property-finder/errors';

const origin = 'https://love-live-myoko.com', issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1';
const user = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
const session = '00000000-0000-4000-8000-000000000011', property = '00000000-0000-4000-8000-000000000101';
const env: FinderEnv = { FINDER_AUTH_ENABLED: 'enabled', FINDER_CUSTOMER_ACCESS: 'disabled', FINDER_DATABASE_PROJECT_REF: 'abcdefghijklmnopqrst', FINDER_AUTH_SITE_ORIGIN: origin };
let pair: Awaited<ReturnType<typeof generateKeyPair>>, key: JWTVerifyGetKey;
before(async () => { pair = await generateKeyPair('ES256'); key = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'saved-test', alg: 'ES256' }] }); });
async function token(patch: Record<string, unknown> = {}) {
    return new SignJWT({ sub: user, session_id: session, role: 'authenticated', is_anonymous: false, iss: issuer, aud: 'authenticated', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...patch })
        .setProtectedHeader({ alg: 'ES256', kid: 'saved-test' }).sign(pair.privateKey);
}
function snapshot(patch: Partial<MembershipSnapshot> = {}): MembershipSnapshot {
    return { schemaVersion: 2, userId: user, sessionId: session, sessionActive: true, sessionValidUntil: null, accountActive: true,
        role: 'administrator', subscriptionActive: false, tier: null, status: 'inactive', paymentStatus: 'unpaid', accessStartsAt: null, paidThrough: null, revokedAt: null, ...patch };
}
const premium = () => snapshot({ role: 'customer', subscriptionActive: true, tier: 'premium', status: 'active', paymentStatus: 'paid', accessStartsAt: new Date(Date.now() - 10000).toISOString(), paidThrough: new Date(Date.now() + 3600000).toISOString() });
function request(jwt: string | null, path = '', method = 'GET', extra: RequestInit = {}) {
    return new Request(origin + '/api/property-finder/saved-properties' + path, { method, ...extra,
        headers: { ...(jwt ? { Authorization: 'Bearer ' + jwt } : {}), ...(method !== 'GET' ? { Origin: origin } : {}), ...extra.headers } });
}
function harness(record: MembershipSnapshot | null = snapshot()) {
    const stored = new Map<string, Set<string>>(); let calls = 0;
    const dependencies = {
        verifyIdentity: (req: Request, settings: FinderEnv) => verifySupabaseIdentity(req, settings, key),
        loadMembership: async () => record,
        load: async () => { throw new Error('Saved API must not fall through to full inventory'); },
        saved: async (_env: FinderEnv, grant: { userId: string }, query: SavedQuery): Promise<SavedResult> => {
            calls++; const ids = stored.get(grant.userId) || new Set<string>(); stored.set(grant.userId, ids);
            if (query.operation === 'save') { ids.add(query.propertyId!); return { propertyId: query.propertyId!, saved: true }; }
            if (query.operation === 'remove') { ids.delete(query.propertyId!); return { propertyId: query.propertyId!, saved: false }; }
            if (query.operation === 'ids') return { ids: [...ids], total: ids.size };
            return { items: [...ids].map(propertyId => ({ propertyId, savedAt: new Date().toISOString(), property: null })), total: ids.size, nextCursor: null };
        },
    };
    return { dependencies, stored, calls: () => calls };
}
test('Administrator can save, view IDs/dashboard and remove while customers stay disabled; duplicate PUT is idempotent', async () => {
    const h = harness(), jwt = await token();
    for (let n = 0; n < 2; n++) assert.equal((await handleFinderRequest(request(jwt, '/' + property, 'PUT'), env, h.dependencies)).status, 200);
    assert.deepEqual(await (await handleFinderRequest(request(jwt, '/ids'), env, h.dependencies)).json(), { ids: [property], total: 1 });
    const page = await (await handleFinderRequest(request(jwt), env, h.dependencies)).json(); assert.equal(page.total, 1); assert.equal(page.items[0].property, null);
    for (let n = 0; n < 2; n++) assert.equal((await handleFinderRequest(request(jwt, '/' + property, 'DELETE'), env, h.dependencies)).status, 200);
    assert.deepEqual(await (await handleFinderRequest(request(jwt, '/ids'), env, h.dependencies)).json(), { ids: [], total: 0 });
});
test('Enabled Premium can save/view/remove; Basic, unpaid and disabled Premium never invoke saved storage', async () => {
    const jwt = await token(), enabled = { ...env, FINDER_CUSTOMER_ACCESS: 'enabled' };
    for (const [record, settings, expected] of [[premium(), enabled, 200], [premium(), env, 403], [snapshot({ role: 'customer' }), enabled, 403], [{ ...premium(), tier: 'basic' }, enabled, 403]] as const) {
        const h = harness(record);
        for (const [path, method] of [['/' + property, 'PUT'], ['/ids', 'GET'], ['', 'GET'], ['/' + property, 'DELETE']]) {
            assert.equal((await handleFinderRequest(request(jwt, path, method), settings, h.dependencies)).status, expected);
        }
        if (expected === 403) assert.equal(h.calls(), 0);
    }
});
test('Anonymous, expired/invalid JWT, missing snapshot, revoked/expired entitlements and disabled administrators fail closed', async () => {
    const enabled = { ...env, FINDER_CUSTOMER_ACCESS: 'enabled' }, jwt = await token();
    for (const invalid of [null, 'forged', await token({ exp: 1 }), await token({ session_id: undefined }), await token({ role: 'service_role' })]) {
        const h = harness(); assert.equal((await handleFinderRequest(request(invalid, '/ids'), enabled, h.dependencies)).status, 401); assert.equal(h.calls(), 0);
    }
    for (const record of [null, snapshot({ accountActive: false }), snapshot({ sessionActive: false }), snapshot({ userId: other }), snapshot({ sessionValidUntil: new Date(0).toISOString() }),
        { ...premium(), revokedAt: new Date().toISOString() }, { ...premium(), paidThrough: new Date(0).toISOString() }, { ...premium(), status: 'expired' }]) {
        const h = harness(record); assert.equal((await handleFinderRequest(request(jwt, '/ids'), enabled, h.dependencies)).status, 403); assert.equal(h.calls(), 0);
    }
});
test('Browser account IDs, query escalation, malformed IDs, unsupported methods and cross-origin mutations are rejected', async () => {
    const h = harness(), jwt = await token();
    const attempts = [request(jwt, '/' + property, 'PUT', { body: JSON.stringify({ userId: other }), headers: { 'Content-Type': 'application/json' } }),
        request(jwt, '/ids?user_id=' + other), request(jwt, '?limit=10000'), request(jwt, '?cursor=not-a-cursor'), request(jwt, '/invalid-id', 'PUT'),
        request(jwt, '/' + property + '?userId=' + other, 'DELETE'), request(jwt, '/' + property, 'POST')];
    for (const req of attempts) assert([400, 405].includes((await handleFinderRequest(req, env, h.dependencies)).status));
    for (const headers of [{ Origin: 'https://attacker.invalid' }, { Origin: origin, 'Sec-Fetch-Site': 'cross-site' }] as Record<string, string>[]) {
        assert.equal((await handleFinderRequest(request(jwt, '/' + property, 'PUT', { headers }), env, h.dependencies)).status, 403);
    }
    assert.equal((await handleFinderRequest(new Request(origin + '/api/property-finder/saved-properties/' + property, { method: 'DELETE', headers: { Authorization: 'Bearer ' + jwt } }), env, h.dependencies)).status, 403);
    assert.equal(h.calls(), 0);
});
test('Owner always comes from signed identity, never a forged Access header or another account session', async () => {
    const h = harness(), jwt = await token();
    await handleFinderRequest(request(jwt, '/' + property, 'PUT', { headers: { 'Cf-Access-Authenticated-User-Email': 'another@example.invalid', 'X-User-ID': other } }), env, h.dependencies);
    assert.deepEqual([...h.stored.get(user)!], [property]); assert.equal(h.stored.has(other), false);
    for (const headers of [{ 'Cf-Access-Jwt-Assertion': 'forged' }, { Cookie: 'CF_Authorization=forged' }] as Record<string, string>[]) assert.equal((await handleFinderRequest(request(null, '/ids', 'GET', { headers }), env, h.dependencies)).status, 401);
});
test('Saved routes are private/no-store; quota/rate/unavailable errors are safe and a missing migration fails closed', async () => {
    const jwt = await token(), h = harness();
    for (const error of [new FinderHttpError(429, 'saved_rate_limited'), new FinderHttpError(404, 'saved_listing_unavailable'), new Error('private SQL credentials must never escape')]) {
        const response = await handleFinderRequest(request(jwt, '/ids'), env, { ...h.dependencies, saved: async () => { throw error; } });
        assert.equal(response.status, error instanceof FinderHttpError ? error.status : 503);
        assert.match(response.headers.get('Cache-Control')!, /private, no-store/); assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), null); assert.equal(response.headers.get('ETag'), null);
        if (response.status === 429) assert.equal(response.headers.get('Retry-After'), '60');
        assert(!(await response.text()).includes('credentials'));
    }
});


test('Account capability comes from server authorization, including disabled customer rollout and independent administrators', () => {
    for (const [record, settings, expected] of [[snapshot(), env, true], [premium(), env, false], [premium(), { ...env, FINDER_CUSTOMER_ACCESS: 'enabled' }, true],
        [snapshot({ role: 'customer' }), env, false], [{ ...premium(), tier: 'basic' }, { ...env, FINDER_CUSTOMER_ACCESS: 'enabled' }, false]] as const) {
        const result = accountDetails({ identity: { kind: 'customer', userId: user, sessionId: session, tokenExpiresAt: Date.now() + 3600000 }, snapshot: record,
            user: { id: user, email: 'synthetic@example.invalid', email_confirmed_at: new Date().toISOString() }, access: 'synthetic-only' }, settings);
        assert.equal(result.savedPropertiesAccess, expected);
    }
});
