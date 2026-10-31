import type { MetadataRoute } from 'next';
import { readItems } from '@directus/sdk';
import directus from '@/lib/directus';

export const dynamic = 'force-static';

const origin = 'https://love-live-myoko.com';
const publicRoutes = [
    '/', '/about/', '/why-myoko/', '/buying-property-japan/', '/property-ownership-costs/',
    '/purchase-property/', '/management/', '/properties/', '/accommodation/', '/property-finder/', '/membership/',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // Only published public CMS listings belong here, never aggregated Finder inventory or account routes.
    const [properties, accommodations] = await Promise.all([
        directus.request(readItems('properties', { fields: ['slug'], filter: { published: { _eq: true } }, limit: -1 })),
        directus.request(readItems('accommodations', { fields: ['slug'], filter: { published: { _eq: true } }, limit: -1 })),
    ]);
    const routes = [...publicRoutes,
        ...properties.map(property => `/property/${encodeURIComponent(property.slug)}/`),
        ...accommodations.map(accommodation => `/accommodation/${encodeURIComponent(accommodation.slug)}/`),
    ];
    return [...new Set(routes)].map(route => ({ url: `${origin}${route}` }));
}
