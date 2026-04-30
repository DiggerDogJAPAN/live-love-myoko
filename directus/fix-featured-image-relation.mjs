const DIRECTUS_URL = 'http://localhost:8055';
const TOKEN = 'super-secret-admin-token';

async function main() {
    const headers = {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
    };

    console.log('Creating featured_image relation...');
    const res = await fetch(`${DIRECTUS_URL}/relations`, {
        method: 'POST', 
        headers,
        body: JSON.stringify({
            collection: 'accommodations',
            field: 'featured_image',
            related_collection: 'directus_files',
            meta: {
                one_deselect_action: 'nullify'
            }
        })
    });

    if (res.ok) {
        console.log('Successfully created featured_image relation.');
    } else {
        console.error('Failed to create relation:', await res.text());
    }
}

main();
