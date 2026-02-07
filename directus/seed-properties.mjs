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
            summary: 'A beautiful cottage in the heart of Myoko with stunning mountain views.',
            featured_image: fileId,
            location: 'Myoko Kogen',
            published: true,
            bedrooms: 2,
            bathrooms: 1,
            floor_area_sqm: 85,
            land_area_sqm: 120,
            price_display: '¥45,000,000',
            amenities: ['Ski-in/Ski-out', 'Parking', 'Fireplace'],
            area_notes: 'Located just 5 minutes walk from the main gondola station.',
            map_url: 'https://maps.app.goo.gl/9yGvFzHzs8JbQzR2A',
            description: '<p>This cozy mountain cottage offers amazing views and easy access to the slopes. Perfect for a holiday home or rental potential.</p>'
        },
        {
            title: 'Modern Alpine Lodge',
            slug: 'modern-alpine-lodge',
            status: 'managed',
            property_type: 'lodge',
            summary: 'Fully managed lodge with premium amenities and expert local care.',
            featured_image: fileId,
            location: 'Akakura Onsen',
            published: true,
            bedrooms: 6,
            bathrooms: 4,
            floor_area_sqm: 350,
            land_area_sqm: 500,
            price_display: 'Management Only',
            amenities: ['Onsen Access', 'Professional Kitchen', 'Mountain Views', 'Staff Accomodation'],
            area_notes: 'Central location in Akakura Onsen, close to restaurants and bars.',
            map_url: 'https://maps.app.goo.gl/9yGvFzHzs8JbQzR2A',
            description: '<p>Experience the ultimate alpine lifestyle in this recently renovated lodge. Currently under full management by LiveLove Myoko.</p>'
        }
    ];

    for (const p of properties) {
        console.log(`Processing property: ${p.title}`);

        // Find if property exists
        const searchRes = await fetch(`${DIRECTUS_URL}/items/properties?filter[slug][_eq]=${p.slug}`, { headers });
        const { data: existing } = await searchRes.json();

        if (existing && existing.length > 0) {
            console.log(`Updating existing property: ${p.title} (ID: ${existing[0].id})`);
            const res = await fetch(`${DIRECTUS_URL}/items/properties/${existing[0].id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(p)
            });
            if (res.ok) console.log(`Successfully updated: ${p.title}`);
            else console.error(`Failed to update: ${p.title}`, await res.text());
        } else {
            console.log(`Creating new property: ${p.title}`);
            const res = await fetch(`${DIRECTUS_URL}/items/properties`, {
                method: 'POST',
                headers,
                body: JSON.stringify(p)
            });
            if (res.ok) console.log(`Successfully created: ${p.title}`);
            else console.error(`Failed to create: ${p.title}`, await res.text());
        }
    }

    console.log('Seeding complete.');
}

main();
