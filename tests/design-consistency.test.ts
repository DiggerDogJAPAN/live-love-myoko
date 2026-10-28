import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let AccommodationCard: typeof import('../src/components/AccommodationCard').default;
let Gallery: typeof import('../src/components/AirbnbGallery').default;
let PropertyGallery: typeof import('../src/components/PropertyGallery').default;
let Lightbox: typeof import('../src/components/Lightbox').default;
before(async () => {
    const require = createRequire(`${process.cwd()}/package.json`);
    require.extensions['.css'] = module => { module.exports = {}; };
    AccommodationCard = (await import('../src/components/AccommodationCard')).default;
    Gallery = (await import('../src/components/AirbnbGallery')).default;
    PropertyGallery = (await import('../src/components/PropertyGallery')).default;
    Lightbox = (await import('../src/components/Lightbox')).default;
});
const accommodation: ComponentProps<typeof AccommodationCard>['accommodation'] = {
    slug: 'synthetic-stay', title: 'A & B Lodge', featured_image: 'featured-id',
    price_display: '25,000', max_guests: 6, rooms: 3, parking: 2, summary: 'Original CMS summary.',
};
function inMode(mode: 'development' | 'production', render: () => string) {
    const previous = process.env;
    process.env = { ...previous, NODE_ENV: mode, NEXT_PUBLIC_DIRECTUS_URL: 'https://synthetic-cms.example' };
    try { return render(); } finally { process.env = previous; }
}
test('Accommodation cards retain exact CMS content, detail links and image paths in both build modes', () => {
    for (const mode of ['development', 'production'] as const) {
        const html = inMode(mode, () => renderToStaticMarkup(createElement(AccommodationCard, { accommodation })));
        assert(html.includes('A &amp; B Lodge') && html.includes('Original CMS summary.'));
        assert(html.includes('href="/accommodation/synthetic-stay"'));
        assert(html.includes('25,000') && html.includes('6 guests') && html.includes('3 rooms') && html.includes('2 parking'));
        assert(html.includes(mode === 'production' ? '/images/accommodations/synthetic-stay/featured.jpg' : 'https://synthetic-cms.example/assets/featured-id?width=600&amp;height=400&amp;fit=cover'));
        assert(html.includes('loading="lazy"'));
        assert.equal((html.match(/<a\b/g) || []).length, 1);
    }
});
test('Missing accommodation images and CMS fields retain honest fallback labels', () => {
    const html = renderToStaticMarkup(createElement(AccommodationCard, { accommodation: { ...accommodation, featured_image: '', price_display: undefined, max_guests: undefined, rooms: undefined, parking: undefined, summary: undefined } }));
    assert(html.includes('No Image') && html.includes('N/A guests') && html.includes('0 rooms') && html.includes('No parking'));
    assert(!html.includes('<img') && !html.includes('25,000'));
});
const galleryProps = { gallery: [{ directus_files_id: 'gallery-one' }, { directus_files_id: 'gallery-two' }], featuredImageId: 'featured-id', title: 'Original title', slug: 'synthetic-stay', collection: 'accommodations' as const };
test('Accommodation photo tiles are native keyboard-operable buttons with unchanged ordered image sources', () => {
    const html = inMode('production', () => renderToStaticMarkup(createElement(Gallery, galleryProps)));
    assert.equal((html.match(/<button\b/g) || []).length, 3);
    for (let i = 1; i <= 3; i++) assert(html.includes(`aria-label="View photo ${i}"`));
    for (const file of ['featured.jpg', 'gallery-1.jpg', 'gallery-2.jpg']) assert(html.includes(`/images/accommodations/synthetic-stay/${file}`));
    assert.equal((html.match(/loading="lazy"/g) || []).length, 2);
    const empty = renderToStaticMarkup(createElement(Gallery, { ...galleryProps, gallery: [], featuredImageId: null }));
    assert.equal(empty, '');
});
test('Property gallery preserves full thumbnail paths, labels and native button interaction', () => {
    const html = inMode('development', () => renderToStaticMarkup(createElement(PropertyGallery, galleryProps)));
    assert.equal((html.match(/<button\b/g) || []).length, 2);
    assert(html.includes('aria-label="View gallery image 1"'));
    assert(html.includes('https://synthetic-cms.example/assets/gallery-one?width=600&amp;height=400&amp;fit=cover'));
    assert(html.includes('class="property-gallery__image"'));
});
test('Lightbox exposes a named modal, original image and labelled navigation and dismiss controls', () => {
    const html = renderToStaticMarkup(createElement(Lightbox, { images: [{ src: '/first.jpg', alt: 'Original first' }, { src: '/second.jpg', alt: 'Original second' }], initialIndex: 1, onClose: () => {} }));
    assert(html.includes('role="dialog" aria-modal="true" aria-label="Image gallery"'));
    for (const label of ['Close image', 'Previous image', 'Next image']) assert(html.includes(`aria-label="${label}"`));
    assert(html.includes('src="/second.jpg" alt="Original second"'));
});
test('Central text and action colours meet WCAG AA contrast on their actual shared backgrounds', () => {
    const css = readFileSync('src/styles/globals.css', 'utf8');
    const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{3,8});/gi)].map(m => [m[1], m[2]]));
    function luminance(hex: string) {
        const h = hex.length === 4 ? hex.slice(1).split('').map(c => c + c).join('') : hex.slice(1);
        const rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    }
    for (const [fg, bg] of [['color-text', 'color-background'], ['color-text-muted', 'color-background-muted'], ['color-primary', 'color-primary-soft'], ['color-surface', 'color-primary'], ['color-surface', 'color-primary-hover'], ['color-on-forest', 'color-forest'], ['color-mint', 'color-forest'], ['color-error', 'color-background'], ['color-warning-text', 'color-warning-background']]) {
        const values = [luminance(tokens[fg]), luminance(tokens[bg])].sort((a, b) => b - a);
        assert((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${fg} on ${bg}`);
    }
});

test('Shared and module styles resolve every custom property without missing or circular token aliases', () => {
    const files = ['src/styles/globals.css', 'src/styles/editorial.module.css', 'src/components/PropertyCard.module.css', 'src/components/Header.module.css', 'src/components/property-finder/finder.module.css', 'src/app/home.module.css', 'src/app/management/management.module.css', 'src/app/purchase-property/purchase.module.css'];
    const css = files.map(file => readFileSync(file, 'utf8')).join('\n');
    const definitions = new Map([...css.matchAll(/(--[\w-]+):\s*([^;{}]+);/g)].map(match => [match[1], match[2]]));
    function resolve(name: string, visited: string[] = []) {
        assert(definitions.has(name), `Undefined token ${name}`);
        assert(!visited.includes(name), `Circular token ${[...visited, name].join(' -> ')}`);
        for (const match of definitions.get(name)!.matchAll(/var\((--[\w-]+)/g)) resolve(match[1], [...visited, name]);
    }
    for (const match of css.matchAll(/var\((--[\w-]+)/g)) resolve(match[1]);
});

test('Sold property galleries and enlarged photos remain grayscale without filtering the modal or badge', () => {
    const gallery = inMode('production', () => renderToStaticMarkup(createElement(PropertyGallery, { ...galleryProps, collection: 'properties', sold: true })));
    assert.equal((gallery.match(/class="property-gallery__image property-photo--sold"/g) || []).length, 2);
    const html = renderToStaticMarkup(createElement(Lightbox, { images: [{ src: '/original-sold.jpg', alt: 'Original photograph' }], initialIndex: 0, onClose: () => {}, sold: true }));
    assert(html.includes('class="lightbox__image property-photo--sold"'));
    assert(html.includes('src="/original-sold.jpg"'));
    assert(html.includes('<span class="property-sold-badge">SOLD</span>'));
    assert(!html.includes('class="lightbox property-photo--sold"'));
    const active = renderToStaticMarkup(createElement(Lightbox, { images: [{ src: '/active.jpg' }], initialIndex: 0, onClose: () => {} }));
    assert(!active.includes('property-photo--sold') && !active.includes('property-sold-badge'));
});
