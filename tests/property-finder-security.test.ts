import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { before, test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { FinderHttpError } from '../server/property-finder/errors';
import { verifySupabaseIdentity, type CustomerIdentity } from '../server/property-finder/customer-auth';
import { authorizeFinderRequest } from '../server/property-finder/authorization';
import { authorizeMembership, requireCurrentGrant, type MembershipSnapshot, type FinderPermission } from '../server/property-finder/membership';
import { handleFinderRequest, type FinderEnv } from '../server/property-finder/api';
import { finderArtifactProblem, checkFinderExport } from '../scripts/check-finder-export.mjs';

const env: FinderEnv = {
    FINDER_AUTH_ENABLED: 'enabled', FINDER_CUSTOMER_ACCESS: 'enabled', FINDER_DATABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
};
const user = '00000000-0000-4000-8000-000000000001';
const session = '00000000-0000-4000-8000-000000000002';
const anotherUser = '00000000-0000-4000-8000-000000000003';
const anotherSession = '00000000-0000-4000-8000-000000000004';
let privateKey: CryptoKey, ecPrivateKey: CryptoKey, keys: JWTVerifyGetKey;
before(async () => {
    const rsa = await generateKeyPair('RS256', { extractable: true });
    const ec = await generateKeyPair('ES256', { extractable: true });
    privateKey = rsa.privateKey; ecPrivateKey = ec.privateKey;
    keys = createLocalJWKSet({ keys: [{ ...await exportJWK(rsa.publicKey), kid: 'rsa', alg: 'RS256' }, { ...await exportJWK(ec.publicKey), kid: 'ec', alg: 'ES256' }] });
});
async function customerToken(patch: Record<string, unknown> = {}, ec = false) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: `https://${env.FINDER_DATABASE_PROJECT_REF}.supabase.co/auth/v1`, aud: 'authenticated',
        sub: user, session_id: session, role: 'authenticated', is_anonymous: false, iat: now, exp: now + 3600, ...patch,
    }).setProtectedHeader({ alg: ec ? 'ES256' : 'RS256', kid: ec ? 'ec' : 'rsa' }).sign(ec ? ecPrivateKey : privateKey);
}
async function adminToken(patch: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: 'https://legacy.cloudflareaccess.com', aud: 'legacy-access-app', sub: 'real-admin-subject',
        email: 'admin@example.com', type: 'app', iat: now, exp: now + 600, ...patch,
    }).setProtectedHeader({ alg: 'RS256', kid: 'rsa' }).sign(privateKey);
}
function request(token?: string, suffix = '/properties', extra: Record<string, string> = {}) {
    return new Request('https://website.example/api/property-finder' + suffix, { headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra } });
}
const identity = (): CustomerIdentity => ({ kind: 'customer', userId: user, sessionId: session, tokenExpiresAt: Date.now() + 3600000 });
function membership(patch: Partial<MembershipSnapshot> = {}): MembershipSnapshot {
    return { schemaVersion: 2, role: 'customer', subscriptionActive: true, userId: user, sessionId: session, sessionActive: true, sessionValidUntil: null, accountActive: true,
        tier: 'basic', status: 'active', paymentStatus: 'paid', accessStartsAt: new Date(Date.now() - 1000).toISOString(),
        paidThrough: new Date(Date.now() + 3600000).toISOString(), revokedAt: null, ...patch };
}
const verifyCustomer = (req: Request, settings: FinderEnv) => verifySupabaseIdentity(req, settings, keys);
function status(error: unknown, value: number) { return error instanceof FinderHttpError && error.status === value; }

test('Customer JWT verification pins project issuer, audience, role, real session identity and RSA/EC algorithms', async () => {
    for (const ec of [false, true]) {
        const result = await verifySupabaseIdentity(request(await customerToken({}, ec)), env, keys);
        assert.equal(result.userId, user); assert.equal(result.sessionId, session); assert.equal(result.kind, 'customer');
    }
    for (const patch of [{ iss: 'https://other.supabase.co/auth/v1' }, { aud: 'other-app' }, { aud: ['authenticated', 'other-app'] },
        { role: 'service_role' }, { role: 'crawler_writer' }, { role: 'anon' }, { is_anonymous: true }, { is_anonymous: undefined },
        { sub: '' }, { sub: 'not-a-uuid' }, { session_id: anotherUser + ',sql' }, { session_id: undefined }, { exp: 1 },
        { exp: undefined }, { iat: 0 }, { iat: -1 }, { iat: undefined }, { iat: Date.now() / 1000 + 600 }, { nbf: Math.floor(Date.now() / 1000) + 600 }]) {
        await assert.rejects(verifySupabaseIdentity(request(await customerToken(patch)), env, keys), e => status(e, 401));
    }
    for (const token of ['forged', (await customerToken()).replace(/\.[^.]+$/, '.forged'), 'a'.repeat(17000)]) {
        await assert.rejects(verifySupabaseIdentity(request(token), env, keys), e => status(e, 401));
    }
    const stranger = await generateKeyPair('RS256');
    const forged = await new SignJWT({ sub: user }).setProtectedHeader({ alg: 'RS256', kid: 'rsa' }).sign(stranger.privateKey);
    await assert.rejects(verifySupabaseIdentity(request(forged), env, keys), e => status(e, 401));
    const sharedSecret = await new SignJWT({ sub: user }).setProtectedHeader({ alg: 'HS256', kid: 'rsa' }).sign(new Uint8Array(32));
    await assert.rejects(verifySupabaseIdentity(request(sharedSecret), env, keys), e => status(e, 401));
});

test('Authentication fails closed when disabled; customers stay gated while administrators bypass only the paid rollout', async () => {
    let lookups = 0, propertyReads = 0;
    const dependencies = { verifyIdentity: verifyCustomer, loadMembership: async () => { lookups++; return membership(); }, load: async () => { propertyReads++; return []; } };
    const jwt = await customerToken();
    for (const flag of [undefined, 'disabled', 'true']) {
        assert.equal((await handleFinderRequest(request(jwt), { ...env, FINDER_AUTH_ENABLED: flag }, dependencies)).status, 503);
    }
    assert.equal(lookups, 0);
    for (const setting of [undefined, 'disabled']) {
        const settings = { ...env, FINDER_CUSTOMER_ACCESS: setting };
        assert.equal((await handleFinderRequest(request(), settings, dependencies)).status, 401);
        assert.equal((await handleFinderRequest(request(jwt), settings, dependencies)).status, 403);
    }
    for (const setting of ['true', 'test', 'shadow', 'enabled ']) assert.equal((await handleFinderRequest(request(jwt), { ...env, FINDER_CUSTOMER_ACCESS: setting }, dependencies)).status, 503);
    assert.equal((await handleFinderRequest(request(jwt), { ...env, FINDER_DATABASE_PROJECT_REF: undefined }, dependencies)).status, 503);
    assert.equal(propertyReads, 0);
});

test('Basic and Premium capability sets are server-chosen; refund permission only requests a review', () => {
    for (const permission of ['listings:read', 'search:use'] as const) assert.equal(authorizeMembership(identity(), membership(), permission).tier, 'basic');
    for (const permission of ['saved-properties:use', 'saved-searches:use', 'maps:read', 'refund:request-review'] as const) {
        assert.throws(() => authorizeMembership(identity(), membership(), permission), e => status(e, 403));
        assert.equal(authorizeMembership(identity(), membership({ tier: 'premium' }), permission).tier, 'premium');
    }
    assert.throws(() => authorizeMembership(identity(), membership({ tier: 'premium' }), 'refund:pay' as FinderPermission), e => status(e, 403));
    assert.throws(() => authorizeMembership(identity(), membership({ tier: 'admin' }), 'listings:read'), e => status(e, 403));
});

test('Inactive, unpaid, past-due, expired, future, refunded, revoked and mismatched records fail closed', () => {
    const past = new Date(Date.now() - 1).toISOString(), future = new Date(Date.now() + 100000).toISOString();
    for (const patch of [{ schemaVersion: 0 }, { userId: anotherUser }, { sessionId: anotherSession }, { sessionActive: false },
        { accountActive: false }, { tier: 'enterprise' }, { tier: 'toString' }, { status: 'inactive' }, { status: 'past_due' },
        { status: 'unpaid' }, { status: 'canceled' }, { status: 'expired' }, { paymentStatus: 'unpaid' }, { paymentStatus: 'refunded' },
        { accessStartsAt: future }, { accessStartsAt: 'invalid' }, { paidThrough: past }, { paidThrough: 'invalid' },
        { revokedAt: past }, { revokedAt: future }, { sessionValidUntil: past }, { sessionValidUntil: 'invalid' }]) {
        assert.throws(() => authorizeMembership(identity(), membership(patch), 'listings:read'), e => status(e, 403));
    }
    assert.throws(() => authorizeMembership(identity(), null, 'listings:read'), e => status(e, 403));
    assert.throws(() => authorizeMembership({ ...identity(), tokenExpiresAt: Date.now() - 1 }, membership(), 'listings:read'), e => status(e, 403));
    assert.throws(() => requireCurrentGrant({ ...authorizeMembership(identity(), membership(), 'listings:read'), validUntil: Date.now() - 1 }), e => status(e, 403));
});

test('Request flags and account IDs cannot select a victim membership or upgrade a Basic account', async () => {
    const jwt = await customerToken({ user_metadata: { tier: 'premium', is_subscribed: true }, app_metadata: { tier: 'premium' }, is_subscribed: true });
    let lookedUp: CustomerIdentity | undefined;
    const deps = { verifyIdentity: verifyCustomer, loadMembership: async (_env: FinderEnv, who: CustomerIdentity) => { lookedUp = who; return membership(); } };
    const req = request(jwt, `/properties?user_id=${anotherUser}&tier=premium&is_subscribed=true`, { 'X-User-Id': anotherUser, 'X-Membership-Tier': 'premium', 'Cf-Access-Authenticated-User-Email': 'admin@example.com' });
    const grant = await authorizeFinderRequest(req, env, 'listings:read', deps);
    assert.equal(grant.kind, 'customer'); assert.equal(lookedUp!.userId, user); assert.equal(lookedUp!.sessionId, session);
    await assert.rejects(authorizeFinderRequest(req, env, 'maps:read', deps), e => status(e, 403));
    await assert.rejects(authorizeFinderRequest(request(undefined, '/properties?access_token=' + jwt), env, 'listings:read', deps), e => status(e, 401));
});

test('Only private Supabase administrator roles authorize; real/forged Access assertions, email headers and cookies never grant access', async () => {
    let record = membership({ role: 'administrator', subscriptionActive: false, tier: null, status: 'inactive', paymentStatus: 'unpaid' });
    const deps = { verifyIdentity: verifyCustomer, loadMembership: async () => record };
    const settings = { ...env, FINDER_CUSTOMER_ACCESS: 'disabled' };
    const jwt = await customerToken();
    await assert.rejects(authorizeFinderRequest(request(await adminToken()), settings, 'listings:read', deps), error => status(error, 401));
    for (const assertion of ['forged', '', await adminToken(), await adminToken({ email: 'not-admin@example.com' })]) {
        const headers = { 'Cf-Access-Jwt-Assertion': assertion, 'Cf-Access-Authenticated-User-Email': 'admin@example.com', Cookie: 'CF_Authorization=' + assertion };
        await assert.rejects(authorizeFinderRequest(request(undefined, '/properties', headers), settings, 'listings:read', deps), error => status(error, 401));
        assert.equal((await authorizeFinderRequest(request(jwt, '/properties', headers), settings, 'maps:read', deps)).role, 'administrator');
        await assert.rejects(authorizeFinderRequest(request('forged-supabase', '/properties', headers), settings, 'listings:read', deps), error => status(error, 401));
    }
    record = membership({ role: 'customer', subscriptionActive: false, tier: null, status: 'inactive', paymentStatus: 'unpaid' });
    await assert.rejects(authorizeFinderRequest(request(jwt, '/properties', { 'Cf-Access-Jwt-Assertion': await adminToken() }), settings, 'listings:read', deps), error => status(error, 403));
    record = membership({ schemaVersion: 1, role: 'administrator' });
    await assert.rejects(authorizeFinderRequest(request(jwt), settings, 'listings:read', deps), error => status(error, 403));
});

test('Disabled/revoked administrator accounts, sessions and tokens cannot bypass checks or fall back to Access', async () => {
    let reads = 0;
    const jwt = await customerToken();
    for (const record of [null, membership({ role: 'administrator', accountActive: false }),
        membership({ role: 'administrator', sessionActive: false }),
        membership({ role: 'administrator', sessionValidUntil: new Date(Date.now() - 1000).toISOString() }),
        membership({ role: 'administrator', userId: anotherUser })]) {
        const response = await handleFinderRequest(request(jwt, '/properties', { 'Cf-Access-Jwt-Assertion': await adminToken() }),
            { ...env, FINDER_CUSTOMER_ACCESS: 'disabled' },
            { verifyIdentity: verifyCustomer, loadMembership: async () => record, load: async () => { reads++; return []; } });
        assert.equal(response.status, 403);
    }
    const response = await handleFinderRequest(request(await customerToken({ exp: 1 })), env,
        { verifyIdentity: verifyCustomer, loadMembership: async () => membership({ role: 'administrator' }), load: async () => { reads++; return []; } });
    assert.equal(response.status, 401); assert.equal(reads, 0);
});

test('Every data response requires fresh authorization; revocation, downgrade, lookup failures and invalid tokens never read properties', async (t) => {
    let propertyReads = 0, membershipReads = 0;
    let snapshot: MembershipSnapshot | null = membership({ tier: 'premium' });
    const dependencies = { verifyIdentity: verifyCustomer,
        loadMembership: async () => { membershipReads++; return snapshot; }, load: async () => { propertyReads++; return []; } };
    const jwt = await customerToken();
    assert.equal((await handleFinderRequest(request(jwt), env, dependencies)).status, 200);
    snapshot = membership({ status: 'inactive' });
    assert.equal((await handleFinderRequest(request(jwt), env, dependencies)).status, 403);
    assert.equal(propertyReads, 1); assert.equal(membershipReads, 2);
    snapshot = membership({ tier: 'basic' });
    assert.equal((await authorizeFinderRequest(request(jwt), env, 'listings:read', dependencies)).kind, 'customer');
    await assert.rejects(authorizeFinderRequest(request(jwt), env, 'maps:read', dependencies), e => status(e, 403));
    const before = membershipReads;
    assert.equal((await handleFinderRequest(request('forged'), env, dependencies)).status, 401);
    assert.equal((await handleFinderRequest(request(await customerToken({ exp: 1 })), env, dependencies)).status, 401);
    assert.equal(membershipReads, before); assert.equal(propertyReads, 1);
    const failed = await handleFinderRequest(request(jwt), env, { ...dependencies, loadMembership: async () => { throw new Error('private postgres://secret'); } });
    assert.equal(failed.status, 503); assert.equal(await failed.text(), '{"code":"directory_unavailable"}'); assert.equal(propertyReads, 1);
    const later = Date.now() + 7200000;
    const expiredWhileLoading = await handleFinderRequest(request(jwt), env, {
        ...dependencies, loadMembership: async () => membership(),
        load: async () => { t.mock.method(Date, 'now', () => later); return []; },
    });
    assert.equal(expiredWhileLoading.status, 403);

});

test('No unguarded details, pagination variants, Premium endpoints, alternate verbs, cross-origin reads or customer admin-login redirects', async () => {
    let reads = 0;
    const deps = { verifyIdentity: verifyCustomer, loadMembership: async () => membership(), load: async () => { reads++; return []; } };
    const jwt = await customerToken();
    for (const suffix of ['/properties/id', '/details/1', '/properties.json', '/properties/page/2', '/saved-searches', '/maps', '/premium', '/refund', '/']) {
        assert.equal((await handleFinderRequest(request(jwt, suffix), env, deps)).status, 404);
    }
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']) assert.equal((await handleFinderRequest(new Request(request(jwt), { method }), env, deps)).status, 405);
    for (const extra of [{ Origin: 'https://attacker.example' }, { 'Sec-Fetch-Site': 'cross-site' }] as Record<string, string>[]) assert.equal((await handleFinderRequest(request(jwt, '/properties', extra), env, deps)).status, 403);
    assert.equal((await handleFinderRequest(request(jwt, '/login'), env, deps)).status, 404);
    assert.equal(reads, 0);
    for (const suffix of ['/properties?page=2&limit=1', '/properties?user_id=' + anotherUser]) assert.equal((await handleFinderRequest(request(undefined, suffix), env, deps)).status, 401);
});

test('Authorized and denied responses disable browser/CDN caching and vary by every authentication mechanism', async () => {
    const deps = { verifyIdentity: verifyCustomer, loadMembership: async () => membership(), load: async () => [] };
    const jwt = await customerToken();
    const responses = [await handleFinderRequest(request(jwt, '/properties', { 'If-None-Match': '*' }), env, deps),
        await handleFinderRequest(request(), env, deps), await handleFinderRequest(request('forged'), env, deps),
        await handleFinderRequest(request(jwt), env, { ...deps, loadMembership: async () => null })];
    assert.deepEqual(responses.map(r => r.status), [200, 401, 401, 403]);
    for (const response of responses) {
        assert.match(response.headers.get('cache-control')!, /private, no-store/);
        for (const name of ['CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control']) assert.equal(response.headers.get(name), 'no-store');
        for (const header of ['Authorization', 'Cookie']) assert(response.headers.get('vary')!.includes(header));
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), null); assert.equal(response.headers.get('ETag'), null);
        assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
    }
});

test('Static export guard rejects inventory, RSC leaks, API artifacts, development records and server credentials', () => {
    for (const [name, body] of [['api/property-finder/properties.json', '{}'], ['data.json', '{"originalListingUrl":"https://source.example/property/1"}'],
        ['payload.txt', '\\"originalListingUrl\\":\\"https://source.example/property/1\\"'], ['data.js', 'const data={originalListingUrl:"https://source.example/property/1"}'],
        ['x.json', '{"askingPriceJpy":123456}'], ['price.js', 'const p={askingPriceJpy:123456}'], ['.env.local', 'x=y'], ['backup.sql', 'select 1'], ['private.js', 'const uri="postgresql://user:secret@host/db"'], ['x.js', 'const key="FINDER_DATABASE_URL"'], ['x.html', 'Synthetic Akakura lodge'], ['server/config.txt', '{}']]) {
        assert(finderArtifactProblem(name, body), name);
    }
    assert.equal(finderArtifactProblem('property/public-cms/index.html', '<h1>Public Directus property</h1>'), null);
    assert.equal(finderArtifactProblem('app.js', 'const sourceName="SUUMO"; fetch("/api/property-finder/properties")'), null);
    const directory = mkdtempSync(path.join(tmpdir(), 'finder-export-security-'));
    try {
        mkdirSync(path.join(directory, 'property-finder/search'), { recursive: true });
        writeFileSync(path.join(directory, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/property-finder', '/api/property-finder/*'], exclude: [] }));
        writeFileSync(path.join(directory, 'property-finder/search/index.html'), '<main>Authentication required</main>');
        assert.equal(checkFinderExport(directory), 2);
        mkdirSync(path.join(directory, 'login'), { recursive: true });
        writeFileSync(path.join(directory, 'login/index.html'), '<main>Sign in</main>');
        assert.throws(() => checkFinderExport(directory), /Auth API Pages Functions routing/);
        rmSync(path.join(directory, 'login'), { recursive: true });
        writeFileSync(path.join(directory, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/property-finder', '/api/property-finder/*'], exclude: ['/a*'] }));
        assert.throws(() => checkFinderExport(directory));
        writeFileSync(path.join(directory, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/property-finder', '/api/property-finder/*'], exclude: [] }));
        writeFileSync(path.join(directory, 'inventory.json'), '{"askingPriceJpy":123456}');
        assert.throws(() => checkFinderExport(directory));
    } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Route inventory has exactly one runtime Finder handler, no static API files and no browser database client', () => {
    assert.deepEqual(readdirSync('functions', { recursive: true }).filter((name): name is string => typeof name === 'string' && name.endsWith('.ts')), ['api/auth/[[path]].ts', 'api/property-finder/[[path]].ts']);
    assert(readFileSync('functions/api/property-finder/[[path]].ts', 'utf8').includes('handleFinderRequest(context.request, context.env)'));
    const access = readFileSync('src/components/property-finder/PropertyFinderAccess.tsx', 'utf8');
    assert(access.includes("cache: 'no-store'"));
    assert(access.includes('href="/login"')); assert(!access.includes('/api/property-finder/login'));
    const source = ['server/property-finder/authorization.ts', 'server/property-finder/api.ts', 'src/components/auth/AuthForm.tsx',
        'src/components/auth/AccountDashboard.tsx', 'src/components/property-finder/PropertyFinderAccess.tsx', '.dev.vars.example']
        .map(file => readFileSync(file, 'utf8')).join('\n');
    assert(!/FINDER_ACCESS_TEAM_DOMAIN|FINDER_ACCESS_AUD|FINDER_ADMIN_EMAILS|authenticateAdministrator|cloudflareaccess\.com|Cloudflare Access|\/api\/property-finder\/login/.test(source));
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
    assert(scripts.build.includes('node scripts/check-finder-export.mjs'));
    assert.equal(scripts.postinstall, 'node scripts/check-finder-export.mjs');
    for (const dir of ['src/components/property-finder', 'src/lib/property-finder']) {
        for (const name of readdirSync(dir).filter(name => /\.tsx?$/.test(name))) assert(!/@supabase\/|createClient\(|FINDER_DATABASE_URL|service_role/.test(readFileSync(path.join(dir, name), 'utf8')), name);
    }
});
