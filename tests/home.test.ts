import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let html: string;
const clean = (value: string) => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

before(async () => {
    const require = createRequire(`${process.cwd()}/package.json`);
    require.extensions['.css'] = (module) => { module.exports = {}; };
    const page = await import('../src/app/page');
    // Homepage continues to inherit the existing root metadata and structured data.
    assert(!Object.hasOwn(page, 'metadata'));
    html = renderToStaticMarkup(createElement(page.default));
});

test('Homepage retains all 29 original heading/paragraph blocks in their original order', () => {
    const blocks = [...html.matchAll(/<(h[1-6]|p)\b[^>]*>([\s\S]*?)<\/\1>/g)]
        .map(match => [match[1], clean(match[2])]);
    assert.equal(blocks.length, 29);
    // Captured from the original rendered homepage, including its Finder feature.
    assert.equal(digest(blocks), '630d3484034b2f976c3a1aa39cfded53eb36f2c4257d229e7cfe34ab2db0b278');
});

test('Homepage preserves every service link, CTA label and destination', () => {
    const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
        .map(match => [match[1], clean(match[2])]);
    assert.equal(links.length, 6);
    assert.equal(digest(links), '27cc6b3cd40b2e649ef326ba88d6dbd247561261bae091b00124b94fc04c8f11');
});

test('Homepage reuses all original images and alt text, with a preloaded hero and named sections', () => {
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map(match => ({
        src: match[0].match(/\bsrc="([^"]+)"/)?.[1],
        alt: match[0].match(/\balt="([^"]*)"/)?.[1],
    }));
    assert.deepEqual(images, [
        { src: '/images/akakura-onsen-hero.jpg', alt: '' }, // Original CSS background, now an image.
        { src: '/images/services/property management.jpg', alt: 'Property Management' },
        { src: '/images/services/property purchase.jpg', alt: 'Property Purchase' },
        { src: '/images/myoko-village.jpg', alt: 'The Myoko landscape and village beneath the mountains' },
        { src: '/images/akakura-onsen.jpg', alt: 'Akakura Onsen scenic view' },
        { src: '/images/myoko-village.jpg', alt: 'Myoko Kogen village area' },
    ]);
    assert(html.includes('rel="preload" as="image" href="/images/akakura-onsen-hero.jpg"'));
    assert(!html.includes('/_next/image'));
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.equal((html.match(/<section\b/g) || []).length, 6);
    const labels = [...html.matchAll(/<section[^>]*aria-labelledby="([^"]+)"/g)].map(match => match[1]);
    assert.equal(labels.length, 5); // Existing Finder section is reused without modifying it.
    for (const id of labels) assert(html.includes(`id="${id}"`));
});
