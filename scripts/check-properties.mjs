import { createDirectus, rest, staticToken, readItems } from '@directus/sdk';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://127.0.0.1:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || 'build-token-12345';

console.log(`Connecting to ${DIRECTUS_URL}...`);

const directus = createDirectus(DIRECTUS_URL)
    .with(staticToken(DIRECTUS_TOKEN))
    .with(rest());

async function run() {
    try {
        console.log('Fetching all properties...');
        const properties = await directus.request(readItems('properties', {
            fields: ['id', 'title', 'slug', 'status', 'published', 'amenities'],
            limit: -1
        }));

        console.log(`Found ${properties.length} properties:`);
        properties.forEach(p => {
            console.log(`- [${p.id}] ${p.title}`);
            console.log(`  slug: ${p.slug}, status: ${p.status}, published: ${p.published}`);
            console.log(`  amenities: ${JSON.stringify(p.amenities)}`);
        });
    } catch (error) {
        console.error('Error fetching properties:', error);
    }
}

run();
