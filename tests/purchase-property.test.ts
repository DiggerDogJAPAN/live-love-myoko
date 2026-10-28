import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let html: string;
let metadata: typeof import('../src/app/purchase-property/page').metadata;
const clean = (value: string) => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

before(async () => {
    // Next supplies CSS Modules in the app; these tests verify rendered content.
    const require = createRequire(`${process.cwd()}/package.json`);
    require.extensions['.css'] = (module) => { module.exports = {}; };
    const page = await import('../src/app/purchase-property/page');
    html = renderToStaticMarkup(createElement(page.default));
    metadata = page.metadata;
});

test('Purchase redesign preserves all 39 original headings and paragraphs, including fees and legal notice', () => {
    const blocks = [...html.matchAll(/<(h[1-6]|p)\b[^>]*>([\s\S]*?)<\/\1>/g)]
        .map((match) => [match[1], clean(match[2])])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    assert.equal(blocks.length, 39);
    // Captured from the original page before changing its presentation.
    assert.equal(createHash('sha256').update(JSON.stringify(blocks)).digest('hex'),
        'c4f6469849fa933d70a9effcf6a6a12311450ba4621de87c5e92326b702cda8a');
});

test('Purchase metadata and all four original CTA labels and destinations remain unchanged', () => {
    assert.deepEqual(metadata, {
        title: 'Purchase Property | Love Live Myoko',
        description: 'Expert guidance for purchasing property in Myoko. Local insight and professional support for international buyers.',
    });
    const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
        .map((match) => [match[1], clean(match[2])]);
    assert.deepEqual(links, [
        ['/properties', 'View Available Properties'],
        ['mailto:info@love-live-myoko.com', 'Get in Touch'],
        ['/properties', 'Browse Properties'],
        ['mailto:info@love-live-myoko.com', 'Contact Us'],
    ]);
});

test('Purchase sections have accessible names and reuse the original image with static-export support', () => {
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    const labels = [...html.matchAll(/<section[^>]*aria-labelledby="([^"]+)"/g)].map(match => match[1]);
    assert.equal(labels.length, 6);
    for (const id of labels) assert(html.includes(`id="${id}"`));
    assert(html.includes('src="/images/purchase-hero.jpg"'));
    assert(!html.includes('/_next/image'));
    assert(html.includes('<ol'));
    assert.equal((html.match(/<li\b/g) || []).length, 3);
});
