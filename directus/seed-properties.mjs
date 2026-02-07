const DIRECTUS_URL = 'http://localhost:8055';
const TOKEN = 'build-token-12345';

async function main() {
    const headers = {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
    };

    console.log('Fetching existing files for reference...');
    // We need a file ID for featured_image (required)
    const filesRes = await fetch(`${DIRECTUS_URL}/files`, { headers });
    const { data: files } = await filesRes.json();

    if (!files || files.length === 0) {
        console.error('No files found in Directus. Please upload an image first or the seed will fail due to required featured_image.');
        return;
    }

    const fileId = files[0].id;

    console.log('Seeding properties...');
    const properties = [
        {
            title: 'Cozy Mountain Cottage',
            slug: 'cozy-mountain-cottage',
            status: 'for_sale',
            property_type: 'house',
            summary: 'A beautiful cottage in the heart of Myoko.',
            featured_image: fileId,
            location: 'Myoko Kogen',
            published: true,
            description: '<p>This cozy mountain cottage offers amazing views and easy access to the slopes.</p>'
        },
        {
            title: 'Modern Alpine Lodge',
            slug: 'modern-alpine-lodge',
            status: 'managed',
            property_type: 'lodge',
            summary: 'Fully managed lodge with premium amenities.',
            featured_image: fileId,
            location: 'Akakura Onsen',
            published: true,
            description: '<p>Experience the ultimate alpine lifestyle in this recently renovated lodge.</p>'
        }
    ];

    for (const p of properties) {
        console.log(`Creating property: ${p.title}`);
        const res = await fetch(`${DIRECTUS_URL}/items/properties`, {
            method: 'POST',
            headers,
            body: JSON.stringify(p)
        });
        if (res.ok) console.log(`Success: ${p.title}`);
        else console.error(`Failed: ${p.title}`, await res.text());
    }

    console.log('Seeding complete.');
}

main();
