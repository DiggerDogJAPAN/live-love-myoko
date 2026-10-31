import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, test } from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
const pages: Record<string, ComponentType> = {};
let Prompt: typeof import('../src/components/auth/AccountDashboard')['SignedOutAccount'];
before(async () => {
    const require = createRequire(`${process.cwd()}/package.json`);
    require.extensions['.css'] = module => { module.exports = {}; };
    pages.login = (await import('../src/app/login/page')).default;
    pages.register = (await import('../src/app/register/page')).default;
    pages['forgot-password'] = (await import('../src/app/forgot-password/page')).default;
    pages['reset-password'] = (await import('../src/app/reset-password/page')).default;
    pages['verify-email'] = (await import('../src/app/verify-email/page')).default;
    Prompt = (await import('../src/components/auth/AccountDashboard')).SignedOutAccount;
});
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: 'auth-pages-test' };
const render = (Page: ComponentType) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(Page)));
test('Every authentication route shares one editorial heading, existing recovery navigation and exactly one working form', () => {
    for (const [route, Page] of Object.entries(pages)) {
        const html = render(Page);
        assert.equal((html.match(/<h1/g) || []).length, 1, route);
        assert.equal((html.match(/<form/g) || []).length, 1, route);
        assert(html.includes('LOVE LIVE MYOKO · PROPERTY FINDER'));
        assert(html.includes('button button--primary'));
        assert(html.includes('disabled=""'), 'forms wait for server configuration');
        for (const link of ['forgot-password', 'verify-email', 'membership']) assert.match(html, new RegExp(`href="/${link}/?"`));
        if (route !== 'login') assert.match(html, /href="\/login\/?"/);
        assert(!/<main|name="(?:role|tier|redirect)"|href="#"/.test(html));
        for (const label of html.matchAll(/<label[^>]*for="([^"]+)"/g)) assert(html.includes(`id="${label[1]}"`));
    }
});
test('Registration, recovery completion and verification keep required fields, technical limits and autofill', () => {
    const register = render(pages.register), reset = render(pages['reset-password']), verify = render(pages['verify-email']);
    assert(register.includes('Full Name<input id="auth-name"')); assert(register.includes('autoComplete="name"'));
    for (const html of [register, reset]) {
        assert(html.includes('Confirm password')); assert(html.includes('minLength="8"')); assert(html.includes('maxLength="128"'));
        assert(html.includes('Must be 8 characters or more.')); assert(html.includes('autoComplete="new-password"'));
    }
    assert(verify.includes('autoComplete="one-time-code"')); assert(verify.includes('Resend verification email'));
    assert(render(pages['forgot-password']).includes('Send reset link'));
});
test('Signed-out account is an authentication prompt with a primary sign-in action and no private dashboard data', () => {
    const html = renderToStaticMarkup(createElement(Prompt, { message: 'You have signed out.' }));
    assert.equal((html.match(/<h1/g) || []).length, 1); assert(html.includes('<h1>Welcome back</h1>'));
    assert(html.includes('Sign in to manage your account, membership and saved properties.'));
    assert.match(html, /class="button button--primary [^"]+" href="\/login\/?">Sign in<\/a>/);
    assert.match(html, /href="\/register\/?">Create an account/); assert.match(html, /href="\/membership\/?">View membership options/);
    assert(html.includes('role="status">You have signed out.'));
    assert(!/Your details|Your membership|account-name|<form|@|administrator|<article/.test(html));
});
