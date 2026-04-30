import { createDirectus, rest, staticToken, readItems, readItem } from '@directus/sdk';

// Define the schema types
export interface Property {
    id: number;
    status: 'for_sale' | 'managed' | 'sold';
    property_type: 'house' | 'apartment' | 'lodge' | 'land';
    title: string;
    slug: string;
    summary?: string;
    bedrooms?: number;
    bathrooms?: number;
    floor_area_sqm?: number;
    land_area_sqm?: number;
    price?: number;
    price_display?: string;
    description?: string;
    featured_image: string; // This is a file ID
    gallery?: { directus_files_id: string }[]; // M2M junction structure
    amenities?: string[];
    location?: string;
    map_url?: string;
    area_notes?: string;
    seo_title?: string;
    seo_description?: string;
    published: boolean;
    sort_order?: number;
}

export interface Accommodation {
    id: number;
    title: string;
    slug: string;
    summary?: string;
    about?: string;
    rooms?: number;
    beds?: number;
    baths?: number;
    max_guests?: number;
    parking?: number;
    price?: number;
    price_display?: string;
    featured_image: string; // This is a file ID
    gallery?: { directus_files_id: string }[]; // M2M junction structure
    website_url?: string;
    map_url?: string;
    published: boolean;
}

export interface Schema {
    properties: Property[];
    accommodations: Accommodation[];
}

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || 'build-token-12345';

const directus = createDirectus<Schema>(DIRECTUS_URL)
    .with(staticToken(DIRECTUS_TOKEN))
    .with(rest());

export default directus;

// Helper to fetch all properties (for listing and static params)
export async function getProperties() {
    return await directus.request(
        readItems('properties', {
            fields: ['slug', 'title', 'id', 'location', 'property_type', 'status', 'featured_image', 'price_display', 'sort_order'],
            filter: {
                published: { _eq: true }
            },
            sort: ['status', '-sort_order']
        })
    );
}

// Helper to fetch single property by slug
export async function getProperty(slug: string) {
    const result = await directus.request(
        readItems('properties', {
            filter: {
                slug: { _eq: slug }
            },
            limit: 1,
            fields: [
                '*',
                { gallery: ['directus_files_id'] }
            ]
        })
    );

    const property = result[0] as unknown as Property;
    if (property && typeof property.amenities === 'string') {
        try {
            property.amenities = JSON.parse(property.amenities);
        } catch (e) {
            console.error('Failed to parse amenities:', e);
            property.amenities = [];
        }
    }
    return property || null;
}

// Helper to fetch all accommodations (for listing and static params)
export async function getAccommodations() {
    return await directus.request(
        readItems('accommodations', {
            fields: ['slug', 'title', 'id', 'featured_image', 'summary', 'price_display', 'max_guests', 'rooms', 'parking'],
            filter: {
                published: { _eq: true }
            }
        })
    );
}

// Helper to fetch single accommodation by slug
export async function getAccommodation(slug: string) {
    const result = await directus.request(
        readItems('accommodations', {
            filter: {
                slug: { _eq: slug }
            },
            limit: 1,
            fields: [
                '*',
                { gallery: ['directus_files_id'] }
            ]
        })
    );

    return result[0] || null;
}
