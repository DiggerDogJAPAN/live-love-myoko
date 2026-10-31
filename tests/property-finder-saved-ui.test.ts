import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createRequire } from 'node:module';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { AccountDetails } from '../src/lib/auth/types';
import { optimisticSave, savedIds, savedPage, setSavedProperty, savedError } from '../src/lib/property-finder/saved-client';
let Section: ComponentType<{ account: AccountDetails }>, Provider: ComponentType<{ children: ReactNode }>, Button: ComponentType<{ propertyId: string; title: string }>;
before(async () => {
    const require = createRequire(`${process.cwd()}/package.json`); require.extensions['.css'] = module => { module.exports = {}; };
    Section = (await import('../src/components/property-finder/SavedPropertiesSection')).default;
    const saved = await import('../src/components/property-finder/SavedPropertiesProvider'); Provider = saved.SavedPropertiesProvider; Button = saved.SavePropertyButton;
});
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: 'saved-test' };
const id = '00000000-0000-4000-8000-000000000101';
const account: AccountDetails = { user: { id, email: 'synthetic@example.invalid', name: 'Synthetic', verified: true }, sessionExpiresAt: Date.now() + 3600000,
    role: 'customer', membership: { tier: null, status: 'inactive', paidThrough: null, active: false }, finderAccess: false, paidAccessEnabled: false, savedPropertiesAccess: false };
function render(children: ReactNode) { return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, children)); }
test('Basic/unpaid account shows the Premium lock and membership link without listing data or payment controls', () => {
    for (const tier of [null, 'basic'] as const) {
        const html = render(createElement(Section, { account: { ...account, membership: { ...account.membership, tier } } }));
        assert(html.includes('Saved Properties')); assert(html.includes('Save your favourite properties and access them anytime with a Premium membership.'));
        assert(html.includes('href="/membership"')); assert(!html.includes('<article')); assert(!html.includes('synthetic@example.invalid'));
    }
});
test('Heart controls have keyboard-native buttons, accessible pressed/busy state and stay disabled before server authorization loads', () => {
    const html = render(createElement(Provider, null, createElement(Button, { propertyId: id, title: 'Property in Myoko Kogen (Taguchi)' })));
    assert(html.includes('type="button"')); assert(html.includes('aria-pressed="false"')); assert(html.includes('aria-busy="false"')); assert(html.includes('disabled=""'));
    assert(html.includes('aria-label="Save Property in Myoko Kogen (Taguchi)"')); assert(html.includes('fill="none"')); assert(!html.includes('onclick='));
});
test('Saving and unsaving update immediately, roll back failures, and never restore an old user state after logout', async () => {
    for (const previous of [false, true]) {
        const changes: boolean[] = []; let reject!: (reason: Error) => void;
        const pending = optimisticSave(previous, value => changes.push(value), () => new Promise((_, fail) => { reject = fail; }), () => true);
        assert.deepEqual(changes, [!previous], 'visible heart changes before network completes'); reject(new Error('synthetic failure'));
        await assert.rejects(pending); assert.deepEqual(changes, [!previous, previous]);
        const successful: boolean[] = []; await optimisticSave(previous, value => successful.push(value), async () => ({}), () => true); assert.deepEqual(successful, [!previous]);
    }
    const changes: boolean[] = [];
    await assert.rejects(optimisticSave(false, value => changes.push(value), async () => { throw Error('signed out'); }, () => false));
    assert.deepEqual(changes, [true], 'late failures cannot restore a previous account after invalidation');
});
const bridge = { supabaseOrigin: 'https://fgdoqsepihlzfqlqymet.supabase.co', publishableKey: 'sb_publishable_synthetic_only', accessToken: 'synthetic-existing-access-token' };
test('Saved operations use direct Supabase RPCs with the existing bearer, no cookies/owner fields and bounded IDs/pages', async t => {
    const calls: { url: string; init: RequestInit }[] = [];
    t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
        const url = String(input); calls.push({ url, init });
        if (url === '/api/auth/supabase-access') return Response.json(bridge);
        if (url.endsWith('/finder_saved_ids')) return Response.json({ userId: id, ids: [id], total: 1 });
        if (url.endsWith('/finder_save_property')) return Response.json({ propertyId: id, saved: true });
        return Response.json({ items: [{ propertyId: id, savedAt: new Date().toISOString(), property: null }], total: 1, nextCursor: null });
    });
    assert.deepEqual(await savedIds(), { userId: id, ids: [id] }); assert.equal((await savedPage(null)).items[0].property, null); await setSavedProperty(id, true);
    for (const { url, init } of calls) {
        assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error');
        if (url.startsWith('/api/')) { assert.equal(url, '/api/auth/supabase-access'); assert.equal(init.credentials, 'same-origin'); assert.equal(init.body, '{}'); }
        else { assert(url.startsWith(bridge.supabaseOrigin + '/rest/v1/rpc/')); assert.equal(init.credentials, 'omit'); assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer ' + bridge.accessToken); assert.equal(new Headers(init.headers).get('apikey'), bridge.publishableKey); assert(!/userId|owner|sessionId|tier/.test(String(init.body))); }
    }
    t.mock.method(globalThis, 'fetch', async (url: string) => Response.json(String(url).startsWith('/api/') ? bridge : { userId: id, ids: [id, 'invalid'], total: 2 })); await assert.rejects(savedIds());
    assert(!savedError('postgresql://private').includes('private')); assert.match(savedError('saved_rate_limited'), /wait a minute/);
});
test('Direct save/remove and a fresh IDs read preserve saved state without a second browser session store', async t => {
    const saved = new Set<string>();
    t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
        const url = String(input);
        if (url === '/api/auth/supabase-access') return Response.json(bridge);
        if (url.endsWith('/finder_saved_ids')) return Response.json({ userId: id, ids: [...saved], total: saved.size });
        const { p_property } = JSON.parse(String(init.body));
        const saving = url.endsWith('/finder_save_property'); if (saving) saved.add(p_property); else saved.delete(p_property);
        return Response.json({ propertyId: p_property, saved: saving });
    });
    await setSavedProperty(id, true); assert.deepEqual((await savedIds()).ids, [id]);
    await setSavedProperty(id, true); assert.equal((await savedIds()).ids.length, 1);
    await setSavedProperty(id, false); assert.deepEqual((await savedIds()).ids, []);
    await assert.rejects(setSavedProperty('invalid', true), /invalid_listing_id/);
});
test('Direct RPC errors are safe, do not retry uncertain writes, and cannot redirect the bearer to another host', async t => {
    let requests = 0;
    for (const [status, message, expected] of [[503, 'postgresql://private-password', 'supabase_unavailable'], [403, 'saved_access_denied', 'saved_access_denied'], [400, 'saved_limit_reached', 'saved_limit_reached']]) {
        requests = 0;
        t.mock.method(globalThis, 'fetch', async (url: string) => { requests++; return String(url).startsWith('/api/') ? Response.json(bridge) : Response.json({ message }, { status: Number(status) }); });
        await assert.rejects(setSavedProperty(id, true), new RegExp(String(expected))); assert.equal(requests, 2);
    }
    requests = 0;
    t.mock.method(globalThis, 'fetch', async () => { requests++; return Response.json({ ...bridge, supabaseOrigin: 'https://attacker.invalid' }); });
    await assert.rejects(savedIds(), /supabase_unavailable/); assert.equal(requests, 1);
});
test('Expired direct RPC credentials refresh the existing cookie session once before retrying', async t => {
    let attempts = 0, refreshes = 0;
    t.mock.method(globalThis, 'fetch', async (input: string) => {
        const url = String(input);
        if (url === '/api/auth/supabase-access') return Response.json(bridge);
        if (url === '/api/auth/refresh') { refreshes++; return Response.json({ ok: true }); }
        attempts++;
        return attempts === 1 ? Response.json({ code: 'PGRST303' }, { status: 401 }) : Response.json({ userId: id, ids: [], total: 0 });
    });
    assert.deepEqual((await savedIds()).ids, []); assert.equal(refreshes, 1); assert.equal(attempts, 2);
});

test('Direct saved dashboard data uses the shared location, current-price, source-link and permitted-thumbnail projection', async t => {
    const row = { listing_id: id, title: 'Original municipal title', asking_price_jpy: 2200000, location_en: 'Taguchi', location_display: 'Taguchi', location_ja: '田口',
        publication_status: 'active', availability_status: 'active', source_attribution: 'Source: Myoko Akiya Bank',
        original_pdf_url: 'https://www.city.myoko.niigata.jp/property/123.pdf', thumbnail_url: 'https://www.city.myoko.niigata.jp/fs/12345/property.jpg',
        location_needs_review: false, region_en: 'Myoko Kogen', region_ja: '妙高高原', municipality: 'Myoko', property_type: 'house', transaction_type: 'sale', purchase_conditions_ja: null };
    t.mock.method(globalThis, 'fetch', async (url: string) => Response.json(String(url).startsWith('/api/') ? bridge
        : { items: [{ propertyId: id, savedAt: '2026-10-30T00:00:00.000Z', property: row }], total: 1, nextCursor: null }));
    const property = (await savedPage(null)).items[0].property!;
    assert.equal(property.id, id); assert.equal(property.title, 'Property in Myoko Kogen (Taguchi)'); assert.equal(property.askingPriceJpy, 2200000);
    assert.equal(property.originalListingUrl, row.original_pdf_url); assert.equal(property.thumbnail?.src, row.thumbnail_url); assert.equal(property.sourceName, 'Myoko Akiya Bank');
    row.thumbnail_url = 'https://unauthorized.invalid/private.jpg'; assert.equal((await savedPage(null)).items[0].property?.thumbnail, null);
});
