import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { authenticateAdministrator, FinderHttpError } from '../server/property-finder/access';
import { handleFinderRequest, type FinderEnv } from '../server/property-finder/api';
import { customerProperty, databaseConfiguration, databaseClientConfiguration, type CustomerViewRow } from '../server/property-finder/database';
import { enquiryMailto } from '../src/lib/property-finder/model';
import { initialFilters, searchProperties } from '../src/lib/property-finder/search';

// Synthetic signing keys/rows only. No live credentials, DB calls or stored inventory.
const env: FinderEnv = {
    FINDER_ACCESS_TEAM_DOMAIN: 'https://test-team.cloudflareaccess.com',
    FINDER_ACCESS_AUD: 'test-application-audience',
    FINDER_ADMIN_EMAILS: 'admin@example.com',
};
let privateKey: CryptoKey;
let keys: JWTVerifyGetKey;
before(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    keys = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test-key', alg: 'RS256' }] });
});
async function token(overrides: Record<string, unknown> = {}, key = privateKey) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: env.FINDER_ACCESS_TEAM_DOMAIN, aud: env.FINDER_ACCESS_AUD,
        sub: 'synthetic-admin', email: 'admin@example.com', type: 'app', iat: now, exp: now + 600, ...overrides,
    }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(key);
}
function request(jwt?: string, path = '/properties') {
    return new Request(`https://website.example/api/property-finder${path}`, { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} });
}
const row: CustomerViewRow = {
    title: 'Property in Test Area', asking_price_jpy: '12500000',
    location_en: 'Test Area', location_display: 'Test Area', location_ja: 'テスト',
    publication_status: 'active', availability_status: 'active',
    source_attribution: 'Source: Myoko Akiya Bank',
    original_pdf_url: 'https://example.com/property/test-only.pdf',
};

test('Access validates signature, issuer, audience, expiry, identity and admin entitlement', async () => {
    const authorize = (jwt: string) => authenticateAdministrator(request(jwt), env, keys);
    assert.equal((await authorize(await token())).email, 'admin@example.com');
    for (const patch of [{ iss: 'https://wrong.cloudflareaccess.com' }, { aud: 'wrong-app' }, { aud: 'search-page-application-audience' },
        { exp: 1 }, { exp: undefined }, { nbf: Math.floor(Date.now() / 1000) + 600 }, { type: 'service' }, { sub: '' }]) {
        await assert.rejects(authorize(await token(patch)), (error) => error instanceof FinderHttpError && error.status === 401);
    }
    const stranger = await generateKeyPair('RS256');
    await assert.rejects(authorize(await token({}, stranger.privateKey)), (error) => error instanceof FinderHttpError && error.status === 401);
    await assert.rejects(authorize(await token({ email: 'not-an-admin@example.com' })), (error) => error instanceof FinderHttpError && error.status === 403);
    await assert.rejects(authenticateAdministrator(request(await token()), {}, keys));
    await assert.rejects(authenticateAdministrator(new Request(request().url, { headers: { 'Cf-Access-Authenticated-User-Email': 'admin@example.com' } }), env, keys));
});

test('Unauthorized/missing configuration never reaches database; no cross-origin read', async () => {
    let reads = 0;
    const dependencies = { authenticate: (req: Request, settings: FinderEnv) => authenticateAdministrator(req, settings, keys), load: async () => { reads++; return []; } };
    assert.equal((await handleFinderRequest(request(), env, dependencies)).status, 401);
    assert.equal((await handleFinderRequest(request('forged'), env, dependencies)).status, 401);
    assert.equal((await handleFinderRequest(request(await token({ email: 'other@example.com' })), env, dependencies)).status, 403);
    assert.equal((await handleFinderRequest(request(await token()), {}, dependencies)).status, 503);
    const cross = new Request(request().url, { headers: { Origin: 'https://other.example' } });
    const response = await handleFinderRequest(cross, env, dependencies);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(reads, 0);
});

test('Authorized API projects eligible rows, derives counts, is private and signs in safely', async () => {
    const property = customerProperty(row)!;
    const dependencies = { authenticate: (req: Request, settings: FinderEnv) => authenticateAdministrator(req, settings, keys), load: async () => [property] };
    const jwt = await token();
    const response = await handleFinderRequest(request(jwt), env, dependencies);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Cache-Control')!, /no-store/);
    assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { properties: [property], count: 1 });
    const loginRequest = new Request(request(jwt, '/login?return=https://attacker.example'), { headers: { 'Cf-Access-Jwt-Assertion': jwt, 'Sec-Fetch-Site': 'cross-site' } });
    const login = await handleFinderRequest(loginRequest, env, dependencies);
    assert.equal(login.status, 303);
    assert.equal(login.headers.get('Location'), 'https://love-live-myoko.com/property-finder/search/');
    const failed = await handleFinderRequest(request(jwt), env, { ...dependencies, load: async () => { throw new Error('private postgres://password'); } });
    assert.equal(await failed.text(), '{"code":"directory_unavailable"}');
});

test('View mapping excludes unavailable rows, keeps absent fields null and preserves listing actions', () => {
    const property = customerProperty({ ...row, internal_id: 'must-never-leak' } as CustomerViewRow)!;
    assert.equal(property.askingPriceJpy, 12500000);
    assert.equal(property.municipality, 'Myoko');
    assert.equal(property.sourceName, 'Myoko Akiya Bank');
    assert.equal(property.originalListingUrl, row.original_pdf_url);
    for (const field of ['thumbnail', 'listedAt', 'propertyType'] as const) assert.equal(property[field], null);
    assert(!JSON.stringify(property).includes('must-never-leak'));
    assert.equal(customerProperty({ ...row, availability_status: 'negotiating' }), null);
    assert.equal(customerProperty({ ...row, publication_status: 'withdrawn' }), null);
    assert.equal(customerProperty({ ...row, asking_price_jpy: null })!.askingPriceJpy, null);
    assert.equal(customerProperty({ ...row, source_attribution: 'Source: Another agency' })!.municipality, null);
    assert.equal(customerProperty({ ...row, original_pdf_url: 'https://example.com/' })!.originalListingUrl, null);
    assert.throws(() => customerProperty({ ...row, asking_price_jpy: '9007199254740992' }));
    const email = new URL(enquiryMailto(property)).searchParams;
    assert.equal(email.get('subject'), 'Property Enquiry — Property in Test Area');
    assert.match(email.get('body')!, /Price: ¥12,500,000/);
    assert.match(email.get('body')!, /Area: Test Area \/ Myoko/);
    assert(email.get('body')!.includes(`Original listing: ${row.original_pdf_url}`));
    assert.equal(searchProperties([property], { ...initialFilters, municipality: 'Myoko', keyword: 'test', maxPrice: '12500000' }).length, 1);
    assert.equal(searchProperties([property], { ...initialFilters, maxPrice: '1000000' }).length, 0);
});

test('Only dedicated login/expected Supabase host allowed; TLS cannot be downgraded by URI', () => {
    const ref = 'abcdefghijklmnopqrst';
    const settings = { FINDER_DATABASE_PROJECT_REF: ref, FINDER_DATABASE_URL: `postgresql://property_finder_web_reader:test-only@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full` };
    const config = databaseConfiguration(settings);
    assert.equal(config.host, `db.${ref}.supabase.co`);
    assert.equal(typeof config.ssl, 'object');
    if (typeof config.ssl !== 'object') throw new Error('Verified TLS required');
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(config.ssl.servername, config.host);
    assert.equal(typeof config.ssl.checkServerIdentity, 'function');
    const hyperdrive = databaseClientConfiguration({ ...settings, FINDER_HYPERDRIVE: { connectionString: 'postgresql://test-reader:test-only@internal-proxy.example:1234/postgres' } });
    assert.equal(hyperdrive.connectionString, 'postgresql://test-reader:test-only@internal-proxy.example:1234/postgres');
    assert.equal(hyperdrive.ssl, undefined); // Origin TLS is verified by Hyperdrive, not overridden by pg.
    assert.throws(() => databaseClientConfiguration({ ...settings, FINDER_DATABASE_URL: settings.FINDER_DATABASE_URL.replace('property_finder_web_reader', 'postgres'), FINDER_HYPERDRIVE: { connectionString: hyperdrive.connectionString! } }));
    for (const url of [settings.FINDER_DATABASE_URL.replace('verify-full', 'disable'), settings.FINDER_DATABASE_URL.replace('property_finder_web_reader', 'postgres'), settings.FINDER_DATABASE_URL.replace(`db.${ref}.supabase.co`, 'attacker.example'), settings.FINDER_DATABASE_URL + '&options=malicious']) {
        assert.throws(() => databaseConfiguration({ ...settings, FINDER_DATABASE_URL: url }));
    }
});
