import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createRequire } from 'node:module';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loginDestination } from '../src/lib/auth/login-destination';
let Links: ComponentType<{ signedIn?: boolean }>, Page: ComponentType;
before(async () => {
    const require = createRequire(`${process.cwd()}/package.json`); require.extensions['.css'] = module => { module.exports = {}; };
    Links = (await import('../src/components/property-finder/LandingActions')).LandingActionLinks;
    Page = (await import('../src/app/property-finder/page')).default;
});
test('Guests get only the membership and login hero buttons', () => {
    const html = renderToStaticMarkup(createElement(Links));
    assert.match(html, /<a[^>]*class="button button--primary"[^>]*>View Membership Plans/);
    assert.match(html, /<a(?=[^>]*href="\/login\/?\?next=%2Fproperty-finder%2Fsearch%2F")(?=[^>]*class="button button--secondary")[^>]*>Log In/);
    assert(!html.includes('Explore Properties'));
    assert.equal((html.match(/<a\b/g) || []).length, 2);
    assert(!html.includes('Browse Properties'));
});
test('Authenticated navigation shows browse and account actions without granting permissions', () => {
    const html = renderToStaticMarkup(createElement(Links, { signedIn: true }));
    assert(html.includes('Browse Properties')); assert(html.includes('My Account'));
    assert(!html.includes('Log In')); assert(!html.includes('View Membership Plans')); assert(!html.includes('administrator'));
});
test('Landing retains its content and image with a single clear subscription status and real plan details', () => {
    const html = renderToStaticMarkup(createElement(Page));
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    for (const text of ['Find Your Place in', 'More local listings. One search.', 'Explore properties listed directly with us.', '/images/akakura-onsen-hero.jpg', 'Basic: ¥2,000/month', 'Premium: ¥4,000/month', 'Saved Properties and Property Alerts', 'Existing administrator access remains available during testing.']) assert(visible.includes(text));
    assert.equal((visible.match(/Subscriptions are coming soon/g) || []).length, 1);
    assert(!/In development|Paid membership coming soon|Saved Searches/.test(html));
    assert(!/<article[^>]+data-property|askingPriceJpy|originalListingUrl/.test(html));
});
test('Login destinations accept only one exact internal Finder target and reject open redirects', () => {
    assert.equal(loginDestination('?next=%2Fproperty-finder%2Fsearch%2F'), '/property-finder/search/');
    for (const value of ['', '?next=https://attacker.invalid', '?next=//attacker.invalid', '?next=javascript:alert(1)', '?next=/property-finder/search/evil', '?next=%252Fproperty-finder%252Fsearch%252F', '?next=/property-finder/search/&next=/account/', '?next=/account/']) assert.equal(loginDestination(value), '/account/');
});
