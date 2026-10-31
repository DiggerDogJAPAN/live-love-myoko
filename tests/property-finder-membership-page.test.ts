import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AccountDetails } from '../src/lib/auth/types';

type CardsProps = { account?: AccountDetails | null; unavailable?: boolean };
let Page: ComponentType, Landing: ComponentType, Cards: ComponentType<CardsProps>;
before(async () => {
    const require = createRequire(`${process.cwd()}/package.json`);
    require.extensions['.css'] = module => { module.exports = {}; };
    Page = (await import('../src/app/membership/page')).default;
    Landing = (await import('../src/app/property-finder/page')).default;
    Cards = (await import('../src/components/membership/MembershipPlans')).MembershipPlanCards;
});
const unpaid: AccountDetails = { user: { id: 'synthetic-user', email: 'private-test@example.invalid', name: 'Synthetic', verified: true },
    sessionExpiresAt: Date.now() + 3600000, role: 'customer', membership: { tier: null, status: 'inactive', active: false, paidThrough: null },
    finderAccess: false, savedPropertiesAccess: false, paidAccessEnabled: false };
const render = (account?: AccountDetails | null, unavailable = false) => renderToStaticMarkup(createElement(Cards, { account, unavailable }));
function section(html: string, plan: 'basic' | 'premium') {
    return html.match(new RegExp(`<section[^>]+aria-labelledby="${plan}-plan"[^>]*>([\\s\\S]*?)</section>`))![1];
}

test('Membership reference layout retains real prices, precise introduction, registration disclaimer and only existing navigation routes', () => {
    const html = renderToStaticMarkup(createElement(Page));
    for (const text of ['LOVE LIVE MYOKO · PROPERTY FINDER', 'A membership for your property search.',
        'Compare our upcoming monthly membership plans. Subscriptions are not available to purchase yet.', '¥2,000', '¥4,000',
        'Registration is free and does not provide access to Property Finder listings. No payment is taken and no subscription starts when you register.']) assert(html.includes(text));
    assert.equal((html.match(/<h1\b/g) || []).length, 1); assert.equal((html.match(/<h2\b/g) || []).length, 2);
    for (const [label, href] of [['Already registered? Sign in', '/login'], ['Your account', '/account'], ['About Property Finder', '/property-finder']]) {
        assert(html.includes(`href="${href}">${label}</a>`)); assert(existsSync(`src/app${href}/page.tsx`));
    }
    assert(!/href="#"|<form|checkout|<main\b|private-test@example/.test(html));
});
test('Only interactive maps carry the PLANNED badge; saved properties are included and refunds remain conditional intended benefits', () => {
    const html = renderToStaticMarkup(createElement(Page)), premium = section(html, 'premium');
    assert.equal((html.match(/PLANNED/g) || []).length, 1);
    const features = premium.match(/<li\b[^>]*>[\s\S]*?<\/li>/g)!;
    assert.equal(features.length, 4);
    assert(features.find(f => f.includes('Saved Properties'))!.includes('✓')); assert(!features.find(f => f.includes('Saved Properties'))!.includes('PLANNED'));
    assert(features.find(f => f.includes('Interactive Map Viewing'))!.includes('PLANNED'));
    const refund = features.find(f => f.includes('Eligible refund'))!;
    assert(!refund.includes('PLANNED')); assert(refund.includes('up to three months of Premium membership fees following a qualifying property purchase through our agency'));
    assert(html.includes('intended Premium benefit, not an active online refund service'));
    assert(html.includes('subject to verification and would not be automatic'));
});
test('Neither Membership nor the Finder landing page advertises Saved Searches', () => {
    assert(!/saved searches|saved search/i.test(renderToStaticMarkup(createElement(Page))));
    assert(!/saved searches|saved search/i.test(renderToStaticMarkup(createElement(Landing))));
});
test('Logged-out visitors receive two working registration links without any protected data or payment actions', () => {
    const html = render();
    assert.equal((html.match(/href="\/register"/g) || []).length, 2); assert.equal((html.match(/Create an account/g) || []).length, 2);
    assert(existsSync('src/app/register/page.tsx')); assert(!/private-test@example|propertyId|askingPriceJpy|checkout|<form/.test(html));
});
test('Free/inactive accounts and recorded-but-disabled memberships route to status without offering purchases or active access', () => {
    for (const tier of [null, 'basic', 'premium'] as const) {
        const html = render({ ...unpaid, membership: { ...unpaid.membership, tier, active: tier !== null } });
        assert.equal((html.match(/href="\/account\/?"/g) || []).length, 2);
        assert.equal((html.match(/View membership status/g) || []).length, 2);
        assert(!html.includes('Create an account')); assert(!html.match(/href="\/property-finder\/search\/?"/));
    }
});
test('Basic gets its authorized search action; Premium and administrators retain their actual authorized actions', () => {
    const basic = { ...unpaid, finderAccess: true, paidAccessEnabled: true, membership: { ...unpaid.membership, tier: 'basic' as const, active: true } };
    const html = render(basic); assert(section(html, 'basic').match(/href="\/property-finder\/search\/?"/)); assert(section(html, 'premium').match(/href="\/account\/?"/));
    for (const account of [{ ...basic, savedPropertiesAccess: true, membership: { ...basic.membership, tier: 'premium' as const } },
        { ...unpaid, role: 'administrator' as const, finderAccess: true, savedPropertiesAccess: true }]) {
        assert.equal((render(account).match(/href="\/property-finder\/search\/?"/g) || []).length, 2);
        assert(!render(account).includes('private-test@example.invalid'));
    }
});
test('Expired, unverified and unavailable account states never infer Finder permissions from a role or plan name', () => {
    for (const account of [{ ...unpaid, role: 'administrator' as const },
        { ...unpaid, finderAccess: true, sessionExpiresAt: Date.now() - 1000 },
        { ...unpaid, finderAccess: true, user: { ...unpaid.user, verified: false } }]) assert(!render(account).match(/href="\/property-finder\/search\/?"/));
    const unavailable = render(null, true); assert.equal((unavailable.match(/href="\/account\/?"/g) || []).length, 2);
});
function contrast(a: string, b: string) {
    const luminance = (hex: string) => {
        const c = hex.match(/[\da-f]{2}/gi)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
    };
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05);
}
test('Requested green/white palette has accessible text contrast and scoped responsive/focus styling', () => {
    const css = readFileSync('src/app/membership/membership.module.css', 'utf8');
    const accent = css.match(/--membership-accent:\s*(#[\da-f]+)/i)![1];
    const muted = css.match(/--membership-muted:\s*(#[\da-f]+)/i)![1];
    for (const [a, b] of [[accent, '#ffffff'], [accent, '#ddebe5'], [muted, '#f3f3f1']]) assert(contrast(a, b) >= 4.5);
    assert(css.includes('minmax(0, 1fr)')); assert(css.includes('max-width: 760px')); assert(css.includes('max-width: 640px')); assert(css.includes(':focus-visible'));
});
