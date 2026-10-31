import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AccountDetails } from '../src/lib/auth/types';
let Panels: typeof import('../src/components/auth/AccountDashboard')['AccountPanels'];
let Header: typeof import('../src/components/auth/AccountDashboard')['AccountHeader'];
let SavedHeader: typeof import('../src/components/property-finder/SavedPropertiesSection')['SavedPropertiesHeader'];
before(async () => {
    const require = createRequire(`${process.cwd()}/package.json`);
    require.extensions['.css'] = module => { module.exports = {}; };
    const dashboard = await import('../src/components/auth/AccountDashboard');
    Panels = dashboard.AccountPanels; Header = dashboard.AccountHeader;
    SavedHeader = (await import('../src/components/property-finder/SavedPropertiesSection')).SavedPropertiesHeader;
});
const account: AccountDetails = { user: { id: 'synthetic', email: 'long-private-account@example.invalid', name: 'Example Person', verified: true },
    role: 'customer', membership: { tier: null, status: 'inactive', paidThrough: null, active: false },
    sessionExpiresAt: Date.now() + 3600000, finderAccess: false, savedPropertiesAccess: false, paidAccessEnabled: false };
const render = (value: AccountDetails, busy = false) => renderToStaticMarkup(createElement(Panels, { account: value, name: value.user.name, busy, onSave() {}, onNameChange() {} }));
test('Account panels display real verified profile values and preserve accessible name editing and recovery', () => {
    const html = render(account);
    for (const value of [account.user.email, 'Example Person', 'Email verified', 'Customer', 'Yes']) assert(html.includes(value));
    assert(html.includes('for="account-name"')); assert(html.includes('autoComplete="name"')); assert(html.includes('maxLength="80"'));
    assert(html.includes('value="Example Person"')); assert(html.includes('type="submit"')); assert.match(html, /href="\/forgot-password\/?"/);
    assert(!/info@myokoworks|David Bolwell|<select|name="(?:tier|role)"/.test(html));
    assert(render(account, true).includes('aria-busy="true"')); assert.equal((render(account, true).match(/disabled=""/g) || []).length, 2);
    assert(render({ ...account, user: { ...account.user, verified: false } }).includes('>No</span>'));
});
test('Administrators retain no-payment membership wording and the actual Finder route', () => {
    const html = render({ ...account, role: 'administrator', finderAccess: true, savedPropertiesAccess: true });
    for (const value of ['Administrator', 'Not required', 'Administrator access', 'Your administrator role does not require a paid subscription.', 'Open administrator Property Finder']) assert(html.includes(value));
    assert.match(html, /href="\/property-finder\/search\/?"/); assert(!html.includes('No membership'));
});
test('Unpaid and inactive customers retain locked membership messaging; recorded memberships respect the rollout flag', () => {
    for (const tier of [null, 'basic', 'premium'] as const) {
        const html = render({ ...account, membership: { ...account.membership, tier } });
        assert(html.includes('Property Finder listings remain locked.')); assert(html.includes('View membership options'));
        assert(!html.includes('Open administrator')); assert(!html.includes('href="/property-finder/search'));
    }
    const active = { ...account, membership: { ...account.membership, tier: 'premium' as const, active: true, paidThrough: '2026-12-01T00:00:00Z' } };
    assert(render(active).includes('member listing access has not been activated yet'));
    assert(!render(active).includes('href="/property-finder/search'));
    for (const tier of ['basic', 'premium'] as const) {
        const html = render({ ...active, membership: { ...active.membership, tier }, finderAccess: true, paidAccessEnabled: true });
        assert(html.includes('Your membership includes Property Finder access.')); assert(html.includes('Paid through')); assert(html.includes('1 Dec 2026'));
    }
});
test('Account header shows signout only when authenticated; saved counts distinguish unknown, zero and plural counts', () => {
    const signedOut = renderToStaticMarkup(createElement(Header));
    assert(signedOut.includes('<h1>Your account</h1>')); assert(signedOut.includes('LOVE LIVE MYOKO · PROPERTY FINDER')); assert(!signedOut.includes('Sign out'));
    const signedIn = renderToStaticMarkup(createElement(Header, { onSignout() {}, busy: true }));
    assert(signedIn.includes('Sign out')); assert(signedIn.includes('disabled=""'));
    assert(!renderToStaticMarkup(createElement(SavedHeader)).includes('0 saved'));
    for (const count of [0, 1, 27]) {
        const html = renderToStaticMarkup(createElement(SavedHeader, { count }));
        assert(html.includes(`${count} saved ${count === 1 ? 'property' : 'properties'}`)); assert(html.includes('aria-live="polite"'));
        assert.match(html, /href="\/property-finder\/search\/?"/);
    }
});
