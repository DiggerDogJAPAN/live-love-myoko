import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDirectus, rest, staticToken, readItems } from '@directus/sdk';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || 'build-token-12345';

const directus = createDirectus(DIRECTUS_URL)
    .with(staticToken(DIRECTUS_TOKEN))
    .with(rest());

async function downloadImage(id, destPath) {
    const url = `${DIRECTUS_URL}/assets/${id}`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${DIRECTUS_TOKEN}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch image ${id}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, Buffer.from(buffer));
    console.log(`Downloaded: ${destPath}`);
}

async function run() {
    console.log('--- Downloading CMS Assets ---');
    try {
        const properties = await directus.request(readItems('properties', {
            fields: ['slug', 'featured_image', { gallery: ['directus_files_id'] }],
            filter: { published: { _eq: true } }
        }));

        for (const property of properties) {
            const propertyDir = path.join(__dirname, '../public/images/properties', property.slug);

            // Download featured image
            if (property.featured_image) {
                await downloadImage(property.featured_image, path.join(propertyDir, 'featured.jpg'));
            }

            // Download gallery images
            if (property.gallery && property.gallery.length > 0) {
                for (let i = 0; i < property.gallery.length; i++) {
                    const fileId = property.gallery[i].directus_files_id;
                    await downloadImage(fileId, path.join(propertyDir, `gallery-${i + 1}.jpg`));
                }
            }
        }
        console.log('--- Assets Downloaded Successfully ---');
    } catch (error) {
        console.error('Error downloading assets:', error);
        process.exit(1);
    }
}

run();
