import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createRequire } from 'node:module';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { AccountDetails } from '../src/lib/auth/types';
import { optimisticSave, savedIds, savedPage, savedRequest, savedError } from '../src/lib/property-finder/saved-client';
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
test('Saved requests send no owner/body/token, use private same-origin transport, and validate bounded IDs/pages', async t => {
    const calls: RequestInit[] = [];
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
        calls.push(init); assert(String(url).startsWith('/api/property-finder/saved-properties'));
        return Response.json(url.endsWith('/ids') ? { ids: [id], total: 1 } : { items: [{ propertyId: id, savedAt: new Date().toISOString(), property: null }], total: 1, nextCursor: null });
    });
    assert.deepEqual(await savedIds(), [id]); assert.equal((await savedPage(null)).items[0].property, null); await savedRequest('/' + id, 'PUT');
    for (const init of calls) { assert.equal(init.credentials, 'same-origin'); assert.equal(init.cache, 'no-store'); assert.equal(init.body, undefined); assert.equal(new Headers(init.headers).get('Authorization'), null); }
    t.mock.method(globalThis, 'fetch', async () => Response.json({ ids: [id, 'private-invalid-id'] })); await assert.rejects(savedIds());
    assert(!savedError('postgresql://private').includes('private')); assert.match(savedError('saved_rate_limited'), /wait a minute/);
});
