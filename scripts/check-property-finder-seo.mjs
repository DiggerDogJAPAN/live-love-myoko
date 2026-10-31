import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] || 'out');
const origin = 'https://love-live-myoko.com';
const canonical = origin + '/property-finder/';
const html = fs.readFileSync(path.join(out, 'property-finder/index.html'), 'utf8');
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&apos;|&#39;/g, "'");
const attr = (tag, name) => decode(tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '');
const tags = [...html.matchAll(/<(?:meta|link)\b[^>]*>/g)].map(match => match[0]);
const meta = name => tags.filter(tag => attr(tag, 'name') === name || attr(tag, 'property') === name).map(tag => attr(tag, 'content'));
const oneMeta = name => { const values = meta(name); assert.equal(values.length, 1, `Expected one ${name} tag`); return values[0]; };
const title = decode(html.match(/<title>([^<]+)<\/title>/)?.[1] || '');
assert.equal((html.match(/<title>/g) || []).length, 1);
assert.equal(title, 'Myoko Property Finder | Houses & Land for Sale | Love Live Myoko');
const description = oneMeta('description');
assert(description.startsWith('Search properties for sale in Myoko, Joetsu, Kurohime'));
const canonicals = tags.filter(tag => attr(tag, 'rel') === 'canonical').map(tag => attr(tag, 'href'));
assert.deepEqual(canonicals, [canonical]);
assert.match(html, /<html\b[^>]*lang="en"/);
assert.equal(oneMeta('robots'), 'index, follow');
for (const prefix of ['og', 'twitter']) {
    assert.equal(oneMeta(`${prefix}:title`), title);
    assert.equal(oneMeta(`${prefix}:description`), description);
    assert.equal(oneMeta(`${prefix}:image`), origin + '/images/akakura-onsen-hero.jpg');
    assert(oneMeta(`${prefix}:image:alt`).includes('Mount Myoko'));
}
assert.equal(oneMeta('og:url'), canonical);
assert.equal(oneMeta('og:type'), 'website');
assert.equal(oneMeta('twitter:card'), 'summary_large_image');
assert(fs.statSync(path.join(out, 'images/akakura-onsen-hero.jpg')).size > 0);

const visible = decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert(visible.includes('Find Your Place in Myoko and Beyond'));
for (const text of ['local Japanese property sources', 'English interface', 'municipal vacant-home banks', 'Our main focus is Myoko City', 'Basic: ¥2,000/month', 'Premium: ¥4,000/month', 'Saved Properties and Property Alerts', 'only when there are new matching listings', 'Subscriptions are coming soon', 'Existing administrator access remains available during testing']) assert(visible.includes(text), `Missing crawlable text: ${text}`);
assert(!visible.includes('Explore Properties'));
const hero = html.match(/<section\b[^>]*>[\s\S]*?<\/section>/)?.[0] || '';
assert(hero.includes('View Membership Plans') && hero.includes('Log In'));

const entities = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap(match => { const schema = JSON.parse(match[1]); return schema['@graph'] || [schema]; });
const ids = entities.map(entity => entity['@id']).filter(Boolean);
assert.equal(new Set(ids).size, ids.length, 'Duplicate structured-data entity identifiers');
for (const type of ['Organization', 'WebSite', 'WebPage', 'Service', 'BreadcrumbList']) assert.equal(entities.filter(entity => entity['@type'] === type).length, 1, `Duplicate or missing ${type}`);
assert(!entities.some(entity => ['Product', 'RealEstateListing', 'FAQPage'].includes(entity['@type'])));
const page = entities.find(entity => entity['@type'] === 'WebPage');
const service = entities.find(entity => entity['@type'] === 'Service');
const breadcrumb = entities.find(entity => entity['@type'] === 'BreadcrumbList');
assert.equal(page['@id'], canonical + '#webpage');
assert.equal(page.name, title); assert.equal(page.description, description); assert.equal(page.inLanguage, 'en');
assert.equal(page.mainEntity['@id'], service['@id']);
assert.equal(page.isPartOf['@id'], origin + '/#website');
assert.equal(page.breadcrumb['@id'], breadcrumb['@id']);
assert.equal(service.provider['@id'], origin + '/#organization');
assert.equal(service.areaServed.length, 4);
assert(service.areaServed[0].name.startsWith('Myoko City'));
for (const area of ['Joetsu', 'Shinano Town / Kurohime', 'Iizuna']) assert(service.areaServed.some(place => place.name.includes(area)));
assert(service.description.includes('Paid subscriptions are coming soon'));
assert(!service.offers && !service.aggregateRating && !service.review);
assert.deepEqual(breadcrumb.itemListElement.map(item => item.item), [origin + '/', canonical]);
for (const href of ['/membership/', '/properties/', '/purchase-property/', '/why-myoko/', '/buying-property-japan/']) assert(html.includes(`href="${href}"`), `Missing contextual link: ${href}`);

const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
assert(urls.includes(canonical)); assert.equal(new Set(urls).size, urls.length);
for (const url of urls) {
    assert(url.startsWith(origin + '/'));
    const route = decodeURIComponent(new URL(url).pathname);
    assert(!/^\/(?:api|account|login|register|forgot-password|reset-password|verify-email)(?:\/|$)|^\/property-finder\/search(?:\/|$)/.test(route), `Private route in sitemap: ${route}`);
    assert(fs.existsSync(path.join(out, route.slice(1), 'index.html')), `Sitemap route missing from export: ${route}`);
}
const robots = fs.readFileSync(path.join(out, 'robots.txt'), 'utf8');
assert(robots.includes('Sitemap: ' + origin + '/sitemap.xml'));
assert(robots.includes('Allow: /'));
assert(robots.includes('Disallow: /api/'));
assert(!/Disallow:\s*\/property-finder\/?\s*$/m.test(robots));
const search = fs.readFileSync(path.join(out, 'property-finder/search/index.html'), 'utf8');
assert.match(search, /<meta name="robots" content="noindex, nofollow"/);
assert(!/<article\b|data-fixture-preview=|originalListingUrl/.test(search));
console.log(JSON.stringify({ metadata: 'passed', structured_data_entities: entities.length, duplicate_entities: 0, static_explanatory_content: 'passed', sitemap_urls: urls.length, landing_indexable: true, private_search_noindex_preserved: true }));
