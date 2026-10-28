import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let html: string;
before(async () => {
    const require = createRequire(`${process.cwd()}/package.json`);
    require.extensions['.css'] = module => { module.exports = { header: 'headerScope', finder: 'finder' }; };
    const Header = (await import('../src/components/Header')).default;
    html = renderToStaticMarkup(createElement(Header));
});

const links = (markup: string) => [...markup.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(match => [match[1], match[2].replace(/<[^>]*>/g, '').trim()]);
const expected = [
    ['/accommodation', 'Accommodation'],
    ['/management', 'Management'],
    ['/purchase-property', 'Purchase Property'],
    ['/properties', 'Properties'],
    ['/property-finder', 'Property Finder'],
];

test('Desktop and mobile menus retain their link order and destinations with the shorter Management label', () => {
    for (const className of ['header__nav', 'header__mobile-nav']) {
        const nav = html.match(new RegExp(`<nav class="${className}">([\\s\\S]*?)<\\/nav>`));
        assert(nav);
        assert.deepEqual(links(nav[1]), expected);
    }
    assert(!html.includes('Property Management'));
});

test('Header retains the logo, Finder pill classes and both Contact destinations', () => {
    assert.deepEqual(links(html)[0], ['/', 'LoveLiveMyoko']);
    assert(html.includes('class="header__link finder"'));
    assert(html.includes('class="header__mobile-link finder"'));
    const contacts = links(html).filter(([, label]) => label === 'Contact');
    assert.deepEqual(contacts, [
        ['mailto:info@love-live-myoko.com', 'Contact'],
        ['mailto:info@love-live-myoko.com', 'Contact'],
    ]);
});

test('Header retains its mobile menu controls and initially collapsed state', () => {
    assert(html.includes('aria-label="Open menu" aria-expanded="false"'));
    assert(html.includes('aria-label="Close menu"'));
    assert(!html.includes('header__mobile-menu--open'));
});
