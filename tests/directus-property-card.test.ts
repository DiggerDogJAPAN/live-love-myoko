import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { before, test } from 'node:test';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type CardProperty = ComponentProps<typeof import('../src/components/PropertyCard').default>['property'];
let PropertyCard: typeof import('../src/components/PropertyCard').default;
const property: CardProperty = {
    id: 1, title: 'Arai - Myoko City Beautiful House', slug: 'synthetic-cms-property',
    featured_image: 'synthetic-image-id', location: 'Arai', price_display: '5,000,000',
    property_type: 'house', status: 'for_sale',
};
const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

before(async () => {
    // Next handles CSS in the app. Use readable class names for semantic status checks.
    const require = createRequire(`${process.cwd()}/package.json`);
    const css = readFileSync('src/components/PropertyCard.module.css', 'utf8');
    require.extensions['.css'] = module => {
        module.exports = Object.fromEntries([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_]*)/g)].map(match => [match[1], match[1]]));
    };
    PropertyCard = (await import('../src/components/PropertyCard')).default;
});

function render(value: CardProperty, mode: 'production' | 'development' = 'development') {
    const previous = process.env;
    process.env = { ...previous, NODE_ENV: mode, NEXT_PUBLIC_DIRECTUS_URL: 'https://synthetic-cms.example' };
    try { return renderToStaticMarkup(createElement(PropertyCard, { property: value })); }
    finally { process.env = previous; }
}

test('Directus card preserves its exact stored title, location, yen display and detail route', () => {
    const html = render(property);
    assert(html.includes(`<h3 class="title">${property.title}</h3>`));
    assert(html.includes('>Arai</span>'));
    assert.equal((html.match(/<a\b/g) || []).length, 1);
    assert(html.includes('href="/property/synthetic-cms-property"'));
    assert(!html.includes('<button'));
    assert(text(html).includes('Price¥ 5,000,000'));
    assert(html.includes('<dt>Type</dt><dd class="type">house</dd>'));
    assert(html.includes('View Details <span aria-hidden="true">→</span>'));
});

test('Only explicitly available listings get the green For sale treatment', () => {
    assert(render(property).includes('class="availability forSale"'));
    assert(render({ ...property, listing_status: 'available' }).includes('>For sale</span>'));
    for (const [status, label] of [['sold', 'Sold'], ['managed', 'Managed']] as const) {
        for (const listing_status of [undefined, 'available'] as const) {
            const html = render({ ...property, status, listing_status });
            assert(html.includes(`>${label}</span>`));
            assert(!html.includes('>For sale</span>'));
            assert(!html.includes('class="availability forSale"'));
        }
    }
    for (const [listing_status, label] of [['under_offer', 'Under offer'], ['sold', 'Sold'], ['withdrawn', 'Withdrawn']] as const) {
        const html = render({ ...property, listing_status });
        assert(html.includes(`>${label}</span>`));
        assert(!html.includes('>For sale</span>'));
    }
    const reserved = render({ ...property, status: 'reserved' } as unknown as CardProperty);
    assert(reserved.includes('>Reserved</span>'));
    assert(!reserved.includes('>For sale</span>'));
});

test('Directus production and development image URLs, image alt and native lazy loading stay intact', () => {
    const production = render(property, 'production');
    assert(production.includes('src="/images/properties/synthetic-cms-property/featured.jpg"'));
    assert(!production.includes('synthetic-cms.example'));
    const development = render(property);
    assert(development.includes('src="https://synthetic-cms.example/assets/synthetic-image-id?width=600&amp;height=400&amp;fit=cover"'));
    for (const html of [production, development]) {
        assert(html.includes(`alt="${property.title}"`));
        assert(html.includes('loading="lazy"'));
        assert(!html.includes('/_next/image'));
    }
});

test('Missing image and CMS values have truthful fallbacks without inventing price, type or availability', () => {
    const html = render({ ...property, featured_image: '', location: undefined, price_display: undefined,
        property_type: undefined, status: undefined } as unknown as CardProperty);
    assert(html.includes('No Image'));
    assert(!html.includes('<img'));
    assert(html.includes('Location not provided'));
    assert(html.includes('Price not provided'));
    assert(html.includes('>Not provided</dd>'));
    assert(html.includes('Availability not provided'));
    assert(!html.includes('>For sale</span>'));
});

test('CMS text is escaped without rewriting titles or the existing price-display text', () => {
    const title = '<b>Original & stored title</b>';
    const html = render({ ...property, title, price_display: '12,000,000 (negotiable)' });
    assert(html.includes('&lt;b&gt;Original &amp; stored title&lt;/b&gt;'));
    assert(!html.includes('<b>Original'));
    assert(text(html).includes('¥ 12,000,000 (negotiable)'));
});

test('Sold CMS photos alone are grayscale and the SOLD badge remains a separate colour element', () => {
    for (const value of [{ ...property, status: 'sold' as const, listing_status: 'available' as const }, { ...property, listing_status: 'sold' as const }]) {
        const html = render(value);
        assert(html.includes('class="photograph property-photo--sold"'));
        assert(html.includes('<span class="property-sold-badge">SOLD</span>'));
        assert(!html.includes('class="card property-photo--sold"'));
        assert(html.includes('>Sold</span>') && !html.includes('>For sale</span>'));
    }
    for (const value of [property, { ...property, listing_status: 'under_offer' as const }, { ...property, status: 'managed' as const }]) {
        const html = render(value);
        assert(!html.includes('property-photo--sold') && !html.includes('property-sold-badge'));
    }
});
