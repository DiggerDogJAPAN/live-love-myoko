const DIRECTUS_URL = 'http://localhost:8055';
const TOKEN = 'build-token-12345'; // Using the static token which works for Admin user now

async function main() {
    const headers = {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
    };

    const dummyData = [
        {
            title: 'Cozy Cottage',
            slug: 'cozy-cottage',
            content: '<p>A beautiful cottage in the woods. <strong>Perfect for getting away!</strong></p>',
            status: 'published'
        },
        {
            title: 'Modern Apartment',
            slug: 'modern-apartment',
            content: '<p>Located in the heart of the city. Close to everything.</p>',
            status: 'published'
        }
    ];

    for (const item of dummyData) {
        // Check if exists
        const check = await fetch(`${DIRECTUS_URL}/items/property?filter[slug][_eq]=${item.slug}`, { headers });
        const { data } = await check.json();

        if (data.length > 0) {
            console.log(`Skipping ${item.slug}, already exists.`);
            continue;
        }

        console.log(`Creating ${item.title}...`);
        const res = await fetch(`${DIRECTUS_URL}/items/property`, {
            method: 'POST',
            headers,
            body: JSON.stringify(item)
        });

        if (!res.ok) {
            console.error('Failed:', await res.text());
        } else {
            console.log('Created!');
        }
    }
}

main();
