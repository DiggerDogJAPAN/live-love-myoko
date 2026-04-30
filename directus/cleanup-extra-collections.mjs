const DIRECTUS_URL = 'http://localhost:8055';
const TOKEN = 'super-secret-admin-token';

async function main() {
    const headers = {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
    };

    const collectionsToDelete = [
        'accommodations_amenities',
        'accommodations_files_1',
        'amenities',
        'availability',
        'prices'
    ];

    console.log('Cleaning up extra collections...');
    for (const collection of collectionsToDelete) {
        console.log(`Deleting ${collection}...`);
        const res = await fetch(`${DIRECTUS_URL}/collections/${collection}`, {
            method: 'DELETE',
            headers
        });
        if (res.ok) {
            console.log(`Deleted ${collection}.`);
        } else if (res.status === 403 || res.status === 404) {
            console.log(`${collection} already deleted or not found.`);
        } else {
            console.error(`Failed to delete ${collection}:`, await res.text());
        }
    }

    console.log('Cleanup complete.');
}

main();
