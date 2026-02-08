import { createDirectus, rest, staticToken, readFields } from '@directus/sdk';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://127.0.0.1:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || 'build-token-12345';

const directus = createDirectus(DIRECTUS_URL)
    .with(staticToken(DIRECTUS_TOKEN))
    .with(rest());

async function run() {
    try {
        console.log('Fetching fields for properties...');
        const fields = await directus.request(readFields('properties'));

        const relevantFields = fields.filter(f => f.field === 'amenities');

        console.log('Found fields:', JSON.stringify(relevantFields, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

run();
