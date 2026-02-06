import { createDirectus, rest, staticToken, readItems, readItem } from '@directus/sdk';

// Define the schema types
export interface Property {
    id: number;
    status: string;
    title: string;
    slug: string;
    content: string;
}

export interface Schema {
    property: Property[];
}

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || 'build-token-12345';

const directus = createDirectus<Schema>(DIRECTUS_URL)
    .with(staticToken(DIRECTUS_TOKEN))
    .with(rest());

export default directus;

// Helper to fetch all properties (for listing and static params)
export async function getProperties() {
    return await directus.request(readItems('property', {
        fields: ['slug', 'title', 'id'],
        filter: {
            _or: [
                { status: { _eq: 'published' } },
                { status: { _null: true } } // Directus might default new items to draft or published depending on flow, but our script didn't set status. Standard is often published or null if no flow.
            ]
        }
    }));
}

// Helper to fetch single property by slug
export async function getProperty(slug: string) {
    const result = await directus.request(readItems('property', {
        filter: {
            slug: { _eq: slug }
        },
        limit: 1,
        fields: ['*']
    }));

    return result[0] || null;
}
