import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { before, test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { FinderHttpError } from '../server/property-finder/errors';
import { verifySupabaseIdentity, type CustomerIdentity, type CustomerAuthEnv } from '../server/property-finder/customer-auth';
import { authorizeMembership, requireCurrentGrant, type MembershipSnapshot, type FinderPermission } from './fixtures/membership-policy';
import { finderArtifactProblem, checkFinderExport } from '../scripts/check-finder-export.mjs';

const env: CustomerAuthEnv = {
    FINDER_AUTH_ENABLED: 'enabled', FINDER_CUSTOMER_ACCESS: 'enabled', FINDER_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
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
    return new SignJWT({ iss: `https://${env.FINDER_SUPABASE_PROJECT_REF}.supabase.co/auth/v1`, aud: 'authenticated',
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
function status(error: unknown, value: number) { return error instanceof FinderHttpError && error.status === value; }

test('Customer JWT verification pins project issuer, audience, role, real session identity and RSA/EC algorithms', async () => {
    await assert.rejects(verifySupabaseIdentity(request(await adminToken()),env,keys));
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
        writeFileSync(path.join(directory, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/auth', '/api/auth/*'], exclude: [] }));
        writeFileSync(path.join(directory, 'property-finder/search/index.html'), '<main>Authentication required</main>');
        assert.equal(checkFinderExport(directory), 2);
        mkdirSync(path.join(directory, 'login'), { recursive: true });
        writeFileSync(path.join(directory, 'login/index.html'), '<main>Sign in</main>');
        writeFileSync(path.join(directory, '_routes.json'), JSON.stringify({version:1,include:[],exclude:[]}));
        assert.throws(() => checkFinderExport(directory), /Auth API Pages Functions routing/);
        rmSync(path.join(directory, 'login'), { recursive: true });
        writeFileSync(path.join(directory, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/auth', '/api/auth/*'], exclude: ['/a*'] }));
        assert.throws(() => checkFinderExport(directory));
        writeFileSync(path.join(directory, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/auth', '/api/auth/*'], exclude: [] }));
        writeFileSync(path.join(directory, 'inventory.json'), '{"askingPriceJpy":123456}');
        assert.throws(() => checkFinderExport(directory));
    } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Only Auth Functions remain; production code has no SQL client, database credential or Hyperdrive binding', () => {
    assert.deepEqual(readdirSync('functions', { recursive: true }).filter(n => typeof n === 'string' && n.endsWith('.ts')), ['api/auth/[[path]].ts']);
    const config = readFileSync('wrangler.jsonc','utf8'); assert(!/hyperdrive|FINDER_DATABASE_URL/i.test(config));
    for (const directory of ['server','src']) for (const name of readdirSync(directory,{recursive:true})) {
        if (typeof name !== 'string' || !/\.tsx?$/.test(name)) continue;
        const source = readFileSync(path.join(directory,name),'utf8');
        assert(!/FINDER_HYPERDRIVE|FINDER_DATABASE_URL|from ['"]pg['"]|node:tls/.test(source),name);
    }
    const packages = JSON.parse(readFileSync('package.json','utf8'));
    assert(!packages.dependencies.pg && !packages.devDependencies['@types/pg']);
    assert(packages.scripts.build.includes('check-finder-export'));
});
