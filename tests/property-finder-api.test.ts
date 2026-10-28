import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { before, test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { authenticateAdministrator, FinderHttpError } from '../server/property-finder/access';
import { handleFinderRequest, type FinderEnv } from '../server/property-finder/api';
import { customerProperty, databaseConfiguration, databaseClientConfiguration, type CustomerViewRow } from '../server/property-finder/database';
import { enquiryMailto, finderMunicipalities, visibleThumbnail, propertyArea, propertyDisplayArea, propertyLocation, propertyTitle } from '../src/lib/property-finder/model';
import { initialFilters, searchProperties } from '../src/lib/property-finder/search';

// Synthetic signing keys/rows only. No live credentials, DB calls or stored inventory.
const env: FinderEnv = {
    FINDER_ACCESS_TEAM_DOMAIN: 'https://test-team.cloudflareaccess.com',
    FINDER_ACCESS_AUD: 'test-application-audience',
    FINDER_ADMIN_EMAILS: 'admin@example.com',
};
let PropertyFinderCard: typeof import('../src/components/property-finder/PropertyFinderCard').default;
let PropertyFinderDirectory: typeof import('../src/components/property-finder/PropertyFinderDirectory').default;
let privateKey: CryptoKey;
let keys: JWTVerifyGetKey;
before(async () => {
    // Node renders the real components; CSS is handled by Next in production.
    const require = createRequire(`${process.cwd()}/package.json`);
    require.extensions['.css'] = (module) => { module.exports = {}; };
    PropertyFinderCard = (await import('../src/components/property-finder/PropertyFinderCard')).default;
    PropertyFinderDirectory = (await import('../src/components/property-finder/PropertyFinderDirectory')).default;
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
    municipality: 'Myoko', property_type: null, transaction_type: null, purchase_conditions_ja: null,
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
    assert.deepEqual(await response.json(), { properties: [property], count: 1, municipalities: finderMunicipalities });
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
    assert.equal(customerProperty({ ...row, source_attribution: 'Source: Another agency', municipality: 'Another town' })!.municipality, 'Another town');
    assert.equal(customerProperty({ ...row, original_pdf_url: 'https://example.com/' })!.originalListingUrl, null);
    assert.throws(() => customerProperty({ ...row, asking_price_jpy: '9007199254740992' }));
    const email = new URL(enquiryMailto(property)).searchParams;
    assert.equal(email.get('subject'), 'Property Enquiry — Property in Myoko (Test Area)');
    assert.match(email.get('body')!, /Price: ¥12,500,000/);
    assert.match(email.get('body')!, /Area: Myoko \(Test Area\)/);
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
    assert.deepEqual(property.thumbnail, { src: url, alt: propertyTitle(property), permission: 'permitted' });
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
    assert.equal(searchProperties([property], { ...initialFilters, area: 'Myoko (Hidanomori)' }).length, 1);
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

test('All Myoko neighbourhoods use municipality and locality consistently', () => {
    for (const [ja, en, region, regionJa] of reviewedAreas) {
        const property = regionalProperty(ja, en, region, regionJa);
        const label = `Myoko (${en})`;
        assert.equal(property.area, en);
        assert.equal(propertyArea(property), label);
        assert.equal(propertyDisplayArea(property), label);
        assert.equal(propertyLocation(property), label);
        assert.equal(propertyTitle(property), `Property in ${label}`);
        assert.equal(property.thumbnail!.alt, `Property in ${label}`);
        assert.equal(searchProperties([property], { ...initialFilters, area: label }).length, 1);
        assert(new URL(enquiryMailto(property)).searchParams.get('body')!.includes(`Area: ${label}`));
    }
});

const shinano: CustomerViewRow = {
    ...row, municipality: 'Shinano Town', property_type: 'lodge', transaction_type: 'sale',
    source_attribution: 'Source: Shinano Town Akiya Bank', location_en: 'Nojiri', location_ja: '野尻',
    region_en: 'Kurohime, Fujisato', region_ja: '黒姫、富士里',
    original_pdf_url: 'https://shinanomachi-iju.jp/akiya/offline-test/',
    thumbnail_url: 'https://shinanomachi-iju.jp/shinanomachi/wordpress/wp-content/uploads/offline-test/pension.jpg',
};

test('Shinano uses structured municipality, explicit pension type, original links and image URLs', () => {
    const property = customerProperty({ ...shinano, source_facts: { private: 'must-not-leak' } } as CustomerViewRow)!;
    assert.equal(property.municipality, 'Shinano Town');
    assert.equal(propertyLocation(property), 'Shinano (Nojiri)');
    assert.equal(propertyTitle(property), 'Property in Shinano (Nojiri)');
    assert.equal(property.propertyType, 'Pension/Lodge');
    assert.equal(property.thumbnail?.src, shinano.thumbnail_url);
    assert.equal(property.thumbnail?.alt, propertyTitle(property));
    assert.equal(property.originalListingUrl, shinano.original_pdf_url);
    assert.equal(property.sourceName, 'Shinano Town Akiya Bank');
    assert(!JSON.stringify(property).includes('must-not-leak'));
    const body = new URL(enquiryMailto(property)).searchParams.get('body')!;
    assert(body.includes('Area: Shinano (Nojiri)'));
    assert(body.includes(`Original listing: ${shinano.original_pdf_url}`));
    assert(body.includes('Source: Shinano Town Akiya Bank'));
    for (const [kind, label] of [['house', 'House'], ['apartment', 'Apartment'], ['commercial', 'Commercial']]) {
        assert.equal(customerProperty({ ...shinano, property_type: kind })!.propertyType, label);
    }
    assert.equal(customerProperty({ ...row, property_type: 'unknown' })!.propertyType, null);
    assert.equal(customerProperty({ ...row, municipality: null })!.municipality, null);
});

test('Shinano excludes restricted, terminal, rental and unclassified buildings', () => {
    for (const availability_status of ['under_negotiation', 'sold', 'unknown', 'viewings_closed']) {
        assert.equal(customerProperty({ ...shinano, availability_status }), null);
    }
    for (const publication_status of ['sold', 'withdrawn', 'not_found']) {
        assert.equal(customerProperty({ ...shinano, publication_status }), null);
    }
    for (const transaction_type of [null, 'rent', 'unknown']) {
        assert.equal(customerProperty({ ...shinano, transaction_type }), null);
    }
    for (const property_type of [null, 'land', 'other', 'unknown', 'future-kind']) {
        assert.equal(customerProperty({ ...shinano, property_type }), null);
    }
    // Myoko requires no sale backfill and retains its previous eligibility.
    assert(customerProperty({ ...row, transaction_type: null, property_type: 'land' }));
});

test('Thumbnail source, HTTPS host, upload path and file format must all match', () => {
    const valid = shinano.thumbnail_url!;
    for (const extension of ['jpg', 'jpeg', 'PNG', 'webp']) {
        const thumbnail_url = valid.replace('jpg', extension) + '?original=1';
        assert.equal(customerProperty({ ...shinano, thumbnail_url })!.thumbnail?.src, thumbnail_url);
    }
    for (const thumbnail_url of [null, '', 'invalid', valid.replace('https:', 'http:'),
        valid.replace('/shinanomachi/wordpress/wp-content/uploads/', '/uploads/'),
        valid.replace('shinanomachi-iju.jp/', 'shinanomachi-iju.jp.evil.example/'),
        valid.replace('https://', 'https://user:password@'), valid.replace('.jpg', '.svg'),
        valid.replace('shinanomachi-iju.jp/', 'shinanomachi-iju.jp:8443/'),
        'https://www.city.myoko.niigata.jp/fs/offline-test/house.jpg']) {
        assert.equal(customerProperty({ ...shinano, thumbnail_url })!.thumbnail, null);
    }
    assert.equal(customerProperty({ ...row, thumbnail_url: valid })!.thumbnail, null);
    const thumbnail = customerProperty(shinano)!.thumbnail;
    assert.equal(visibleThumbnail(thumbnail, valid), null);
});

test('Mixed sources filter by municipality, combined location, Japanese, type and price; sorting retains actions', () => {
    const myoko = regionalProperty('田口', 'Taguchi', 'Myoko Kogen', '妙高高原');
    const pension = customerProperty(shinano)!;
    const unknownPrice = customerProperty({ ...shinano, asking_price_jpy: null })!;
    const properties = [pension, myoko, unknownPrice];
    assert.equal(searchProperties(properties, { ...initialFilters, municipality: 'Myoko' }).length, 1);
    assert.equal(searchProperties(properties, { ...initialFilters, municipality: 'Shinano' }).length, 2);
    assert.equal(searchProperties(properties, { ...initialFilters, area: 'Shinano (Nojiri)' }).length, 2);
    assert.equal(searchProperties(properties, { ...initialFilters, municipality: 'Myoko', area: 'Shinano (Nojiri)' }).length, 0);
    for (const keyword of ['野尻', 'Nojiri', 'Shinano (Nojiri)', 'pension']) {
        assert.equal(searchProperties(properties, { ...initialFilters, keyword }).length, 2);
    }
    assert.deepEqual(searchProperties(properties, { ...initialFilters, propertyType: 'Pension/Lodge', minPrice: '12500000', maxPrice: '12500000' }), [pension]);
    assert.deepEqual(searchProperties(properties, { ...initialFilters }), [myoko, pension, unknownPrice]);
    assert.deepEqual(searchProperties(properties, { ...initialFilters, sort: 'price-desc' }), [pension, myoko, unknownPrice]);
    assert.equal(searchProperties(properties, { ...initialFilters, minPrice: '20', maxPrice: '10' }).length, 0);
    assert.deepEqual(searchProperties([{ ...pension, listedAt: '2026-10-28' }, myoko], { ...initialFilters, sort: 'newest' }).map(p => p.sourceName), [pension.sourceName, myoko.sourceName]);
});

test('Location uses Japanese for unknown readings and ignores district tags; duplicates and missing locality collapse', () => {
    for (const location_en of [null, '']) {
        const property = customerProperty({ ...shinano, location_en, location_needs_review: true, location_ja: '未確認地区' })!;
        assert.equal(propertyLocation(property), 'Shinano (未確認地区)');
        assert.equal(property.locationNeedsReview, true);
    }
    const reviewedLocality = customerProperty({ ...shinano, location_needs_review: true, region_ja: '未確認地区' })!;
    assert.equal(propertyLocation(reviewedLocality), 'Shinano (Nojiri)');
    assert.equal(reviewedLocality.locationNeedsReview, true);
    const unknown = customerProperty({ ...shinano, location_en: null, location_needs_review: false })!;
    assert.equal(unknown.locationNeedsReview, true);
    assert.equal(propertyLocation(unknown), 'Shinano (野尻)');
    for (const location_en of [null, '', 'Shinano', 'Shinano Town', 'Unknown', '<Nojiri>']) {
        const property = customerProperty({ ...shinano, location_en, location_ja: null })!;
        assert.equal(propertyArea(property), 'Shinano');
    }
    assert.equal(propertyLocation(customerProperty({ ...shinano, location_en: ' Furumi ' })!), 'Shinano (Furumi)');
    assert.equal(propertyLocation(regionalProperty('関川', 'Sekigawa', 'Arai', '妙高高原')), 'Myoko (Sekigawa)');
});


test('Rendered Shinano card hotlinks permitted originals and shows conditions, source and enquiry actions', () => {
    const property = customerProperty(shinano)!;
    const html = renderToStaticMarkup(createElement(PropertyFinderCard, { property }));
    assert(html.includes(`src="${shinano.thumbnail_url}"`));
    assert(!html.includes('/_next/image'));
    assert(html.includes('Property in Shinano (Nojiri)'));
    assert(html.includes('Pension/Lodge'));
    assert(html.includes('>Shinano Town Akiya Bank</a>'));
    assert(html.includes(`href="${shinano.original_pdf_url}"`));
    assert(html.includes('href="mailto:info@myokoworks.com'));
    assert(html.includes('https://www.town.shinano.lg.jp/docs/369.html'));
    assert(html.includes('Investment or commercial use is not assured.'));
    assert(!renderToStaticMarkup(createElement(PropertyFinderCard, { property: customerProperty(row)! })).includes('Programme conditions'));
    const placeholder = renderToStaticMarkup(createElement(PropertyFinderCard, { property: { ...property, thumbnail: null } }));
    assert(placeholder.includes('Property image unavailable'));
});

test('Rendered live directory offers Myoko/Shinano municipalities and consistent location/type options', () => {
    const html = renderToStaticMarkup(createElement(PropertyFinderDirectory, {
        mode: 'live', properties: [regionalProperty('田口', 'Taguchi', 'Myoko Kogen', '妙高高原'), customerProperty(shinano)!],
    }));
    for (const label of ['Myoko', 'Shinano', 'Joetsu', 'Myoko (Taguchi)', 'Shinano (Nojiri)', 'Pension/Lodge']) {
        assert(html.includes(`<option>${label}</option>`));
    }
    assert(!html.includes('<option>Shinano Town</option>'));
    assert(html.includes('id="finder-min"'));
    assert(html.includes('id="finder-max"'));
    assert(html.includes('Price: low to high'));
    assert(html.includes('Price: high to low'));
});


const joetsu: CustomerViewRow = {
    ...row, municipality: 'Joetsu', property_type: 'house', transaction_type: 'sale',
    source_attribution: 'Source: Joetsu City Akiya Bank', location_en: 'Takada', location_ja: '高田',
    original_pdf_url: 'https://joetsu-akiyabank.jp/archives/realestate/1-999-offline-test/',
    purchase_conditions_ja: 'その他：心理的瑕疵あり。\n付帯物件：未登記建物あり。\n現状：居住中',
};

test('Joetsu projects only public conditions, keeps source links and accepts only approved-source thumbnails', () => {
    const property = customerProperty({ ...joetsu, source_facts: { agent: 'private-agent', thumbnail_candidate_url: 'private-image' } } as CustomerViewRow)!;
    assert.equal(property.municipality, 'Joetsu');
    assert.equal(propertyLocation(property), 'Joetsu (Takada)');
    assert.equal(property.sourceName, 'Joetsu City Akiya Bank');
    assert.equal(property.originalListingUrl, joetsu.original_pdf_url);
    assert.equal(property.purchaseConditionsJa, joetsu.purchase_conditions_ja);
    assert(!JSON.stringify(property).includes('private-agent'));
    assert(!JSON.stringify(property).includes('private-image'));
    for (const thumbnail_url of [null,
        'https://www.city.myoko.niigata.jp/fs/test.jpg', shinano.thumbnail_url]) {
        assert.equal(customerProperty({ ...joetsu, thumbnail_url })!.thumbnail, null);
    }
    assert.equal(customerProperty({ ...joetsu, thumbnail_url: 'https://joetsu-akiyabank.jp/wp-content/uploads/test.jpg' })!.thumbnail?.src, 'https://joetsu-akiyabank.jp/wp-content/uploads/test.jpg');
    for (const purchase_conditions_ja of [null, '', '   ']) {
        assert.equal(customerProperty({ ...joetsu, purchase_conditions_ja })!.purchaseConditionsJa, null);
    }
    const original = '  その他：要確認。\n追加費用あり。  ';
    assert.equal(customerProperty({ ...joetsu, purchase_conditions_ja: original })!.purchaseConditionsJa, original);
    assert(new URL(enquiryMailto(property)).searchParams.get('body')!.includes(joetsu.purchase_conditions_ja!));
});

test('Joetsu sale-building eligibility excludes rentals, unknown types and unavailable listings', () => {
    for (const transaction_type of [null, 'rent', 'unknown']) assert.equal(customerProperty({ ...joetsu, transaction_type }), null);
    for (const property_type of [null, 'land', 'unknown', 'other']) assert.equal(customerProperty({ ...joetsu, property_type }), null);
    for (const availability_status of ['sold', 'under_negotiation', 'unknown', 'viewings_closed']) assert.equal(customerProperty({ ...joetsu, availability_status }), null);
    assert.equal(customerProperty({ ...joetsu, publication_status: 'not_found' }), null);
    for (const property_type of ['house', 'apartment', 'lodge', 'commercial']) assert(customerProperty({ ...joetsu, property_type }));
});

test('Joetsu district labels, Japanese fallback, price/type filters and sorting share existing behaviour', () => {
    for (const [location_en, location_ja] of [['Takada', '高田'], ['Naoetsu', '直江津'], ['Nakago', '中郷']]) {
        const property = customerProperty({ ...joetsu, location_en, location_ja })!;
        const label = `Joetsu (${location_en})`;
        assert.equal(propertyLocation(property), label);
        assert.equal(propertyTitle(property), `Property in ${label}`);
        assert.equal(searchProperties([property], { ...initialFilters, municipality: 'Joetsu', area: label, keyword: location_ja, minPrice: '12500000', maxPrice: '12500000', propertyType: 'House' }).length, 1);
        assert(new URL(enquiryMailto(property)).searchParams.get('body')!.includes(label));
    }
    const fallback = customerProperty({ ...joetsu, location_en: null, location_ja: '未確認地区', location_needs_review: true })!;
    assert.equal(propertyLocation(fallback), 'Joetsu (未確認地区)');
    assert.equal(fallback.locationNeedsReview, true);
    const properties = [customerProperty(joetsu)!, customerProperty(shinano)!, customerProperty({ ...row, asking_price_jpy: '100' })!];
    assert.equal(searchProperties(properties, { ...initialFilters, municipality: 'Joetsu' }).length, 1);
    assert.equal(searchProperties(properties, { ...initialFilters, sort: 'price-desc' }).length, 3);
    assert.equal(searchProperties(properties, { ...initialFilters })[0].askingPriceJpy, 100);
});

test('Non-Joetsu conditions render as exact escaped Japanese before enquiry, with linked attribution and placeholder', () => {
    const property = customerProperty({ ...row, purchase_conditions_ja: joetsu.purchase_conditions_ja })!;
    const html = renderToStaticMarkup(createElement(PropertyFinderCard, { property }));
    assert(html.includes('Important Property Conditions'));
    assert(html.includes('Source disclosure (Japanese)'));
    assert(html.includes(`lang="ja"`));
    assert(html.includes(joetsu.purchase_conditions_ja!));
    assert(html.indexOf('Important Property Conditions') < html.indexOf('Ask Us for Help'));
    assert(html.includes(`href="${property.originalListingUrl}" target="_blank" rel="noopener noreferrer">Myoko Akiya Bank</a>`));
    assert(html.includes('Property image unavailable'));
    assert(!html.includes('<img'));
    assert(!html.includes('psychological'));
    const unsafe = '<script>alert("test")</script>\n条件：<b>原文</b> & 追加費用';
    const escaped = renderToStaticMarkup(createElement(PropertyFinderCard, { property: { ...property, purchaseConditionsJa: unsafe } }));
    assert(escaped.includes('&lt;script&gt;'));
    assert(!escaped.includes('<script>'));
    assert(!escaped.includes('<b>原文</b>'));
    const without = renderToStaticMarkup(createElement(PropertyFinderCard, { property: { ...property, purchaseConditionsJa: null } }));
    assert(!without.includes('Important Property Conditions'));
    const accidentalImage = renderToStaticMarkup(createElement(PropertyFinderCard, { property: { ...property, thumbnail: customerProperty({ ...row, thumbnail_url: 'https://www.city.myoko.niigata.jp/fs/test.jpg' })!.thumbnail } }));
    assert(accidentalImage.includes('<img')); // Only the protected API constructs approved thumbnail objects.
});

test('API and empty live directory advertise all three municipalities before Joetsu import', async () => {
    const response = await handleFinderRequest(request(await token()), env, {
        authenticate: (req, settings) => authenticateAdministrator(req, settings, keys), load: async () => [],
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { properties: [], count: 0, municipalities: ['Myoko', 'Shinano', 'Joetsu'] });
    const html = renderToStaticMarkup(createElement(PropertyFinderDirectory, { properties: [], mode: 'live' }));
    for (const municipality of ['Myoko', 'Shinano', 'Joetsu']) assert(html.includes(`<option>${municipality}</option>`));
});


test('Joetsu images use exact source URL validation and retain missing/failed placeholders', () => {
    const src='https://joetsu-akiyabank.jp/wp-content/uploads/2026/10/exterior.jpg';
    const property=customerProperty({...joetsu,thumbnail_url:src})!;
    assert.equal(property.thumbnail?.src,src);
    const html=renderToStaticMarkup(createElement(PropertyFinderCard,{property}));
    assert(html.includes('<img'));assert(html.includes(src));
    assert.equal(visibleThumbnail(property.thumbnail,src),null);
    for(const thumbnail_url of ['https://joetsu-akiyabank.jp.evil.invalid/wp-content/uploads/a.jpg','https://evil.invalid/wp-content/uploads/a.jpg','http://joetsu-akiyabank.jp/wp-content/uploads/a.jpg','https://u:p@joetsu-akiyabank.jp/wp-content/uploads/a.jpg','https://joetsu-akiyabank.jp:8443/wp-content/uploads/a.jpg','https://joetsu-akiyabank.jp/other/a.jpg',src+'?download=1',src+'#x','https://joetsu-akiyabank.jp/wp-content/uploads/2-2seiyaku.png','https://joetsu-akiyabank.jp/wp-content/uploads/floorplan.jpg']) {
        assert.equal(customerProperty({...joetsu,thumbnail_url})!.thumbnail,null);
    }
    assert(renderToStaticMarkup(createElement(PropertyFinderCard,{property:{...property,thumbnail:null}})).includes('Property image unavailable'));
});


test('Joetsu cards omit disclosure sections while preserving approved photos, source links and enquiry data', () => {
    const src = 'https://joetsu-akiyabank.jp/wp-content/uploads/2026/10/exterior.jpg';
    const property = customerProperty({ ...joetsu, thumbnail_url: src })!;
    const before = JSON.stringify(property);
    const html = renderToStaticMarkup(createElement(PropertyFinderCard, { property }));
    assert(html.includes(`src="${src}"`));
    assert(!html.includes('Important Property Conditions'));
    assert(!html.includes('Source disclosure (Japanese)'));
    assert(!html.includes('lang="ja"'));
    assert(!html.includes(joetsu.purchase_conditions_ja!));
    assert(html.includes(`href="${joetsu.original_pdf_url}"`));
    assert(html.includes('Ask Us for Help'));
    assert(html.includes('Source:'));
    assert.equal(JSON.stringify(property), before);
    assert.equal(property.purchaseConditionsJa, joetsu.purchase_conditions_ja);
    assert(new URL(enquiryMailto(property)).searchParams.get('body')!.includes(joetsu.purchase_conditions_ja!));
    const placeholder = renderToStaticMarkup(createElement(PropertyFinderCard, { property: { ...property, thumbnail: null } }));
    assert(placeholder.includes('Property image unavailable'));
    assert(!placeholder.includes('Important Property Conditions'));
    assert.equal(visibleThumbnail(property.thumbnail, src), null);
});

test('Myoko and Shinano retain their Japanese condition presentation and existing image behaviour', () => {
    for (const input of [row, shinano]) {
        const property = customerProperty({ ...input, purchase_conditions_ja: joetsu.purchase_conditions_ja })!;
        const html = renderToStaticMarkup(createElement(PropertyFinderCard, { property }));
        assert(html.includes('Important Property Conditions'));
        assert(html.includes('Source disclosure (Japanese)'));
        assert(html.includes(joetsu.purchase_conditions_ja!));
        if (property.thumbnail) assert(html.includes(`src="${property.thumbnail.src}"`));
        if (input === shinano) assert(html.includes('Programme conditions'));
    }
});
