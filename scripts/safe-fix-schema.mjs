import { createDirectus, rest, staticToken, readFields, updateRelation } from '@directus/sdk';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://127.0.0.1:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || 'build-token-12345';

const directus = createDirectus(DIRECTUS_URL)
    .with(staticToken(DIRECTUS_TOKEN))
    .with(rest());

async function run() {
    try {
        console.log('Fetching fields for "properties"...');
        const fields = await directus.request(readFields('properties'));

        // Find the gallery field
        const galleryField = fields.find(f => f.field === 'gallery');
        if (!galleryField) {
            console.error('Gallery field not found on properties!');
            return;
        }

        console.log('Found gallery field:', galleryField);
        // M2M fields often have meta.junction_field? No, that's in relations.
        // But the schema might imply the collection.
        // Actually, for M2M, the field in 'properties' is an Alias.

        // If we can't read relations, we can try to guess the junction table.
        // Standard Directus naming: properties_files. 
        // Or we can try to query specific relations by collection?

        // Let's try to update the relation directly assuming 'properties_files.properties_id'.
        // We can check if 'properties_files' collection exists?

        const junctionCollection = 'properties_files';
        const foreignKey = 'properties_id'; // Standard naming for M2M to parent

        console.log(`Attempting to update relation ${junctionCollection}.${foreignKey} to CASCADE...`);

        try {
            await directus.request(updateRelation(junctionCollection, foreignKey, {
                schema: {
                    on_delete: 'CASCADE'
                }
            }));
            console.log('Successfully updated relation to CASCADE!');
        } catch (e) {
            console.error('Failed to update relation. It might not exist or verify failed.', e);
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

run();
