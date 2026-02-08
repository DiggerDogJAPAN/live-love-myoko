import { createDirectus, rest, staticToken, readFields, readRelations, updateRelation } from '@directus/sdk';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://127.0.0.1:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || 'build-token-12345';

const directus = createDirectus(DIRECTUS_URL)
    .with(staticToken(DIRECTUS_TOKEN))
    .with(rest());

async function run() {
    try {
        console.log('Fetching relations for "properties"...');
        const relations = await directus.request(readRelations());

        // Find relations where "properties" is the related collection (the parent being deleted)
        // For M2M gallery (properties_files), properties is 'properties_id' usually.
        // Or actually, properties -> gallery (M2M) -> properties_files (junction)
        // The junction table has a FK to properties (e.g. properties_id).
        // That FK needs ON DELETE CASCADE.

        const galleryRelations = relations.filter(r =>
            (r.related_collection === 'properties') ||
            (r.collection === 'properties_files' && r.field === 'properties_id') // Check junction
        );

        // Find the specific relation for the junction table linking back to properties
        // Usually: collection: 'properties_files', field: 'properties_id', related_collection: 'properties'

        const targetRelation = relations.find(r =>
            r.related_collection === 'properties' &&
            r.meta?.one_collection === 'properties' &&
            r.schema?.foreign_key_column // It's a real FK
        );

        // Wait, let's just log all relations involving 'properties' to be sure.
        console.log('DEBUG: Relations involving properties:',
            relations.filter(r => r.collection === 'properties' || r.related_collection === 'properties')
                .map(r => ({
                    collection: r.collection,
                    field: r.field,
                    related_collection: r.related_collection,
                    on_delete: r.schema?.on_delete
                }))
        );

        // We suspect the gallery junction table. 
        // Let's look for a relation where related_collection IS 'properties' AND on_delete is NOT 'CASCADE'.

        const problematicRelations = relations.filter(r =>
            r.related_collection === 'properties' &&
            r.schema?.on_delete !== 'CASCADE'
        );

        if (problematicRelations.length > 0) {
            console.log('\nFound problematic relations needing CASCADE delete:');
            for (const rel of problematicRelations) {
                console.log(`- ${rel.collection}.${rel.field} (current: ${rel.schema?.on_delete})`);

                // Attempt to update
                console.log(`  Updating ${rel.collection}.${rel.field} to CASCADE...`);
                await directus.request(updateRelation(rel.collection, rel.field, {
                    schema: {
                        on_delete: 'CASCADE'
                    }
                }));
                console.log('  Success!');
            }
        } else {
            console.log('\nNo relations found needing update. All seem to be CASCADE?');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

run();
