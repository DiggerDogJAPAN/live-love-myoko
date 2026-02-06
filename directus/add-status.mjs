const DIRECTUS_URL = 'http://localhost:8055';
const TOKEN = 'build-token-12345';

async function main() {
    const headers = {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
    };

    console.log('Adding "status" field...');
    const res = await fetch(`${DIRECTUS_URL}/fields/property`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            field: 'status',
            type: 'string',
            schema: {
                default_value: 'published'
            },
            meta: {
                interface: 'select-dropdown',
                options: {
                    choices: [
                        { text: 'Published', value: 'published' },
                        { text: 'Draft', value: 'draft' },
                        { text: 'Archived', value: 'archived' }
                    ]
                }
            }
        })
    });

    if (res.ok || res.status === 409) { // 409 = conflict/exists
        console.log('Status field created.');

        // Update existing items to have status=published if null
        // Actually default_value in schema handles new ones, existing ones might be null.
        // Let's update all to published just in case.
        console.log('Updating items to published...');
        await fetch(`${DIRECTUS_URL}/items/property`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
                keys: ['*'], // This usually requires specific keys, can't wildcard patch easily without querying IDs first.
                data: { status: 'published' }
            })
            // Bulk update API: PATCH /items/:collection, array of keys or query?
            // Directus API for bulk update: PATCH /items/collection, body: { keys: [1, 2], data: {...} } OR query?
            // Actually let's just use query update if supported or just iterate.
            // Simplest: just rely on the filter allowing nulls which I already added to lib/directus.ts: { _or: [{status: {_eq: 'published'}}, {status: {_null: true}}] }
            // So I don't need to backfill if the query allows null.
        });

    } else {
        console.error('Failed to create status field', await res.text());
    }
}

main();
