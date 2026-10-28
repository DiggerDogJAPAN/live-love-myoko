import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { authenticateAdministrator, FinderHttpError } from '../server/property-finder/access';
import { handleFinderRequest, type FinderEnv } from '../server/property-finder/api';
import { customerProperty, databaseConfiguration, databaseClientConfiguration, type CustomerViewRow } from '../server/property-finder/database';
import { enquiryMailto, visibleThumbnail, propertyArea, propertyLocation, propertyTitle } from '../src/lib/property-finder/model';
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
    thumbnail_url: null, location_needs_review: false, region_en: null, region_ja: null,
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


test('Permitted city thumbnail is mapped without exposing private data or changing source links', () => {
    const url = 'https://www.city.myoko.niigata.jp/fs/offline-test/house.jpg';
    const property = customerProperty({ ...row, thumbnail_url: url })!;
    assert.deepEqual(property.thumbnail, { src: url, alt: row.title, permission: 'permitted' });
    assert.equal(property.originalListingUrl, row.original_pdf_url);
    assert.equal(property.sourceName, 'Myoko Akiya Bank');
    for (const thumbnail_url of [null, '', 'not-a-url', 'http://www.city.myoko.niigata.jp/fs/house.jpg',
        'https://other.example/house.jpg', 'https://www.city.myoko.niigata.jp/fs/house.svg',
        'https://user:password@www.city.myoko.niigata.jp/fs/house.jpg']) {
        assert.equal(customerProperty({ ...row, thumbnail_url })!.thumbnail, null);
    }
    assert.equal(customerProperty({ ...row, thumbnail_url: url, source_attribution: 'Source: Other agency' })!.thumbnail, null);
});

test('Missing and failed thumbnail use placeholder; a changed URL can render again', () => {
    const thumbnail = { src: 'https://www.city.myoko.niigata.jp/fs/offline-test/house.jpg', alt: 'Test house', permission: 'permitted' as const };
    assert.equal(visibleThumbnail(null, null), null);
    assert.deepEqual(visibleThumbnail(thumbnail, null), thumbnail);
    assert.equal(visibleThumbnail(thumbnail, thumbnail.src), null);
    const replacement = { ...thumbnail, src: 'https://www.city.myoko.niigata.jp/fs/offline-test/changed.jpg' };
    assert.deepEqual(visibleThumbnail(replacement, thumbnail.src), replacement);
});

test('English card/filter names retain Japanese references and unknown-name review state', () => {
    const property = customerProperty({ ...row, title: 'Property in Hidanomori', location_en: 'Hidanomori',
        location_display: 'Hidanomori', location_ja: '美守', location_needs_review: false })!;
    assert.equal(property.area, 'Hidanomori');
    assert.equal(property.areaJa, '美守');
    assert.equal(property.locationNeedsReview, false);
    assert.equal(searchProperties([property], { ...initialFilters, area: 'Hidanomori' }).length, 1);
    assert.equal(searchProperties([property], { ...initialFilters, keyword: '美守' }).length, 1);
    const unknown = customerProperty({ ...row, location_en: null, location_display: '未確認地区',
        location_ja: '未確認地区', location_needs_review: true })!;
    assert.equal(unknown.area, '未確認地区');
    assert.equal(unknown.locationNeedsReview, true);
});


const reviewedAreas = [
    ['石塚町', 'Ishizukacho', 'Arai', '新井', 4],
    ['経塚町', 'Kyozukacho', 'Arai', '新井', 1],
    ['白山町', 'Hakusancho', 'Arai', '新井', 2],
    ['小出雲', 'Oizumo', 'Arai', '新井', 1],
    ['美守', 'Hidanomori', 'Arai', '新井', 1],
    ['栗原', 'Kurihara', 'Arai', '新井', 1],
    ['学校町', 'Gakkocho', 'Arai', '新井', 1],
    ['上馬場', 'Kamibaba', 'Arai', '新井', 1],
    ['籠町', 'Kagomachi', 'Arai', '新井', 1],
    ['朝日町', 'Asahicho', 'Arai', '新井', 1],
    ['中央町', 'Chuocho', 'Arai', '新井', 1],
    ['雪森', 'Yukimori', 'Arai', '新井', 1],
    ['月岡', 'Tsukioka', 'Arai', '新井', 1],
    ['関川', 'Sekigawa', 'Myoko Kogen', '妙高高原', 1],
    ['杉野沢', 'Suginosawa', 'Myoko Kogen', '妙高高原', 1],
    ['田口', 'Taguchi', 'Myoko Kogen', '妙高高原', 1],
] as const;

function regionalProperty(ja: string, en: string, region_en: string, region_ja: string, id = 1) {
    return customerProperty({ ...row, title: `Property in ${en}`, location_en: en, location_display: en,
        location_ja: ja, region_en, region_ja, asking_price_jpy: id * 100000,
        original_pdf_url: `https://example.com/property/region-test-${id}.pdf`,
        thumbnail_url: `https://www.city.myoko.niigata.jp/fs/offline-test/region-${id}.jpg` })!;
}

test('All 16 neighbourhoods use their verified source region in visible Finder labels', () => {
    for (const [ja, en, region, regionJa] of reviewedAreas) {
        const property = regionalProperty(ja, en, region, regionJa);
        assert.equal(property.area, region);
        assert.equal(propertyArea(property), region);
        assert.equal(propertyLocation(property), `${region} / Myoko`);
        assert.equal(propertyTitle(property), `Property in ${region}`);
        assert.equal(property.thumbnail!.alt, `Property in ${region}`);
        assert.equal(property.neighbourhood, en);
        assert.equal(property.areaJa, ja);
        assert(!new URL(enquiryMailto(property)).searchParams.get('body')!.includes(`Area: ${en} /`));
    }
});

test('Arai filter collects 17 listings while the three Myoko Kogen listings remain separate', () => {
    let id = 0;
    const properties = reviewedAreas.flatMap(([ja, en, region, regionJa, count]) =>
        Array.from({ length: count }, () => regionalProperty(ja, en, region, regionJa, ++id)));
    assert.equal(properties.length, 20);
    assert.deepEqual([...new Set(properties.map(propertyArea))].sort(), ['Arai', 'Myoko Kogen']);
    assert.equal(searchProperties(properties, { ...initialFilters, area: 'Arai' }).length, 17);
    const kogen = searchProperties(properties, { ...initialFilters, area: 'Myoko Kogen' });
    assert.equal(kogen.length, 3);
    assert.deepEqual(kogen.map(p => p.neighbourhood).sort(), ['Sekigawa', 'Suginosawa', 'Taguchi']);
    assert.equal(searchProperties(properties, { ...initialFilters, keyword: '白山町' }).length, 2);
    assert.equal(searchProperties(properties, { ...initialFilters, keyword: 'Hakusancho' }).length, 2);
    const descending = searchProperties(properties, { ...initialFilters, sort: 'price-desc' });
    assert.equal(descending.length, 20);
    assert.equal(descending[0].askingPriceJpy, 2000000);
    assert.equal(descending[19].askingPriceJpy, 100000);
    assert.equal(new Set(descending.map(p => p.originalListingUrl)).size, 20);
    assert(descending.every(p => p.thumbnail?.permission === 'permitted'));
});

test('Outside Arai, missing metadata and conflicting regions are not guessed as Arai', () => {
    const sekiyama = regionalProperty('関山', 'Sekiyama', 'Myoko', '妙高');
    assert.equal(sekiyama.area, 'Myoko');
    const missing = customerProperty({ ...row, location_en: 'Hakusancho', location_display: 'Hakusancho', location_ja: '白山町' })!;
    assert.equal(propertyArea(missing), 'Hakusancho');
    const conflict = regionalProperty('関川', 'Sekigawa', 'Arai', '妙高高原');
    assert.equal(propertyArea(conflict), 'Sekigawa');
    const other = { ...missing, municipality: 'Joetsu', regionEn: 'Arai', regionJa: '新井' };
    assert.equal(propertyArea(other), 'Hakusancho');
});
