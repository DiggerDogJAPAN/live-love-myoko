import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, test } from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { authMessage, authRequest, fetchAccount, refreshSession } from '../src/lib/auth/client';
import type { AuthMode } from '../src/components/auth/AuthForm';

let Form: ComponentType<{ mode: AuthMode }>, Pricing: ComponentType, Dashboard: ComponentType;
before(async () => {
    const require = createRequire(`${process.cwd()}/package.json`);
    require.extensions['.css'] = module => { module.exports = {}; };
    Form = (await import('../src/components/auth/AuthForm')).default;
    Pricing = (await import('../src/app/membership/page')).default;
    Dashboard = (await import('../src/components/auth/AccountDashboard')).default;
});
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: 'auth-test' };
function form(mode: AuthMode) { return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(Form, { mode }))); }

test('Auth forms have associated labels, correct password autofill, verification controls and no privilege selector', () => {
    for (const mode of ['login', 'register', 'forgot', 'reset', 'verify'] as const) {
        const html = form(mode);
        for (const label of html.matchAll(/<label[^>]*for="([^"]+)"/g)) assert(html.includes(`id="${label[1]}"`));
        assert(!/<(?:select|input)[^>]*(?:name|id)="(?:role|tier|membership)"/.test(html));
        assert(html.includes('disabled=""'), 'submit disabled before server configuration is known');
        assert(html.includes('href="/membership"')); assert(html.includes('href="/verify-email"'));
    }
    assert(form('login').includes('autoComplete="current-password"'));
    for (const mode of ['register', 'reset'] as const) { assert(form(mode).includes('autoComplete="new-password"')); assert(form(mode).includes('minLength="12"')); assert(form(mode).includes('Confirm password')); }
    assert(form('verify').includes('autoComplete="one-time-code"')); assert(form('verify').includes('Resend verification email'));
    assert(!form('login').includes('Continue with Google'), 'unconfigured Google provider is hidden');
});

test('Pricing communicates both real planned prices without granting access or presenting a payment/upgrade bypass', () => {
    const html = renderToStaticMarkup(createElement(Pricing));
    for (const text of ['¥2,000', '¥4,000', 'Basic', 'Premium', 'Subscriptions are not available to purchase yet', 'does not provide access', 'up to three months', 'Planned: saved properties', 'Planned: interactive map']) assert(html.includes(text));
    assert(!/<form|checkout|fake-payment|role=administrator/.test(html));
    assert(renderToStaticMarkup(createElement(Dashboard)).includes('Checking your account'));
    assert(!renderToStaticMarkup(createElement(Dashboard)).includes('customer@example.com'));
});

test('Browser auth requests use same-origin cookies with no-store and never return session tokens to application state', async t => {
    let call: RequestInit | undefined;
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => { assert.equal(url, '/api/auth/login'); call = init; return Response.json({ ok: true }); });
    assert.deepEqual(await authRequest('login', { email: 'customer@example.com', password: 'not-sent-outside-test' }), { ok: true });
    assert.equal(call?.credentials, 'same-origin'); assert.equal(call?.cache, 'no-store'); assert.equal(call?.redirect, 'error');
    assert.equal(new Headers(call?.headers).get('Authorization'), null);
});

test('Expired browser sessions refresh once, then reload authoritative account details; concurrent refresh is coalesced', async t => {
    const calls: string[] = [];
    const account = { user: { id: 'self', email: 'customer@example.com', name: '', verified: true }, role: 'customer', membership: { tier: null, active: false }, sessionExpiresAt: Date.now() + 3600000, finderAccess: false };
    let initial = true;
    t.mock.method(globalThis, 'fetch', async (url: string) => {
        calls.push(url);
        if (url.endsWith('/session') && initial) { initial = false; return Response.json({ code: 'authentication_required' }, { status: 401 }); }
        return Response.json(url.endsWith('/refresh') ? { ok: true } : account);
    });
    assert.equal((await fetchAccount()).finderAccess, false);
    assert.deepEqual(calls, ['/api/auth/session', '/api/auth/refresh', '/api/auth/session']);
    calls.length = 0; await Promise.all([refreshSession(), refreshSession(), refreshSession()]); assert.deepEqual(calls, ['/api/auth/refresh']);
});

test('Invalid or disabled account responses never become an authenticated dashboard', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ user: { email: 'spoofed@example.com' }, role: 'administrator' }));
    await assert.rejects(fetchAccount(), /authentication_unavailable/);
});

test('Provider outages and origin errors give safe actionable messages without provider internals', () => {
    assert.match(authMessage('authentication_failed'), /account service.*contact us/i);
    assert.match(authMessage('authentication_unavailable'), /temporarily unavailable/i);
    assert.match(authMessage('same_origin_required'), /https:\/\/love-live-myoko\.com/);
    assert(!authMessage('PRIVATE provider details').includes('PRIVATE'));
});
