const DIRECTUS_URL = 'http://localhost:8055';
const TOKEN = 'super-secret-admin-token';

async function main() {
    const headers = {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
    };

    // 1. Clean up
    console.log('Cleaning up existing collections...');
    try {
        await fetch(`${DIRECTUS_URL}/collections/accommodations_files`, { method: 'DELETE', headers });
        await fetch(`${DIRECTUS_URL}/collections/accommodations`, { method: 'DELETE', headers });
    } catch (e) {}

    // 2. Create Collection
    console.log('Creating "accommodations" collection...');
    await fetch(`${DIRECTUS_URL}/collections`, {
        method: 'POST', headers,
        body: JSON.stringify({
            collection: 'accommodations',
            schema: {},
            meta: {
                display_template: '{{ title }}',
                show_archive_status: false,
                icon: 'hotel'
            }
        })
    });

    // 3. Junction Collection
    console.log('Creating "accommodations_files" junction collection...');
    await fetch(`${DIRECTUS_URL}/collections`, {
        method: 'POST', headers,
        body: JSON.stringify({
            collection: 'accommodations_files',
            meta: { hidden: true },
            schema: {}
        })
    });

    // 4. Junction Fields
    const junctionFields = [
        { field: 'id', type: 'integer', schema: { is_primary_key: true, has_auto_increment: true } },
        { field: 'accommodations_id', type: 'integer', schema: { foreign_key_table: 'accommodations', foreign_key_column: 'id' } },
        { field: 'directus_files_id', type: 'uuid', schema: { foreign_key_table: 'directus_files', foreign_key_column: 'id' } }
    ];
    for (const f of junctionFields) {
        await fetch(`${DIRECTUS_URL}/fields/accommodations_files`, { method: 'POST', headers, body: JSON.stringify(f) });
    }

    // 5. Main Fields
    const fields = [
        // Basic Info
        { field: 'title', type: 'string', meta: { interface: 'input', required: true } },
        { field: 'slug', type: 'string', schema: { is_unique: true }, meta: { interface: 'input', required: true } },
        { field: 'summary', type: 'text', meta: { interface: 'textarea' } },
        { field: 'about', type: 'text', meta: { interface: 'input-rich-text-html' } },

        // Property Details
        { field: 'rooms', type: 'integer', meta: { interface: 'input' } },
        { field: 'beds', type: 'integer', meta: { interface: 'input' } },
        { field: 'baths', type: 'integer', meta: { interface: 'input' } },
        { field: 'max_guests', type: 'integer', meta: { interface: 'input' } },
        { field: 'parking', type: 'integer', meta: { interface: 'input' } },

        // Pricing
        { field: 'price', type: 'integer', meta: { interface: 'input' } },
        { field: 'price_display', type: 'string', meta: { interface: 'input' } },

        // Media
        { field: 'featured_image', type: 'uuid', schema: { foreign_key_table: 'directus_files', foreign_key_column: 'id' }, meta: { interface: 'file-image', required: true, special: ['file'] } },
        { field: 'gallery', type: 'alias', meta: { interface: 'files', special: ['m2m'], options: { junctionField: 'accommodations_id' } } },

        // Links
        { field: 'website_url', type: 'string', meta: { interface: 'input' } },
        { field: 'map_url', type: 'text', meta: { interface: 'input' } },

        // Publishing
        { field: 'published', type: 'boolean', schema: { default_value: false }, meta: { interface: 'boolean', special: ['cast-boolean'] } }
    ];

    for (const f of fields) {
        console.log(`Creating field "${f.field}"...`);
        const res = await fetch(`${DIRECTUS_URL}/fields/accommodations`, { method: 'POST', headers, body: JSON.stringify(f) });
        if (!res.ok) {
            console.error(`Error on ${f.field}:`, await res.text());
        }
    }

    // 6. Relations
    console.log('Creating Gallery relation...');
    await fetch(`${DIRECTUS_URL}/relations`, {
        method: 'POST', headers,
        body: JSON.stringify({
            collection: 'accommodations_files',
            field: 'accommodations_id',
            related_collection: 'accommodations',
            meta: { one_field: 'gallery', junction_field: 'directus_files_id', one_deselect_action: 'nullify' }
        })
    });
    await fetch(`${DIRECTUS_URL}/relations`, {
        method: 'POST', headers,
        body: JSON.stringify({
            collection: 'accommodations_files',
            field: 'directus_files_id',
            related_collection: 'directus_files',
            meta: { junction_field: 'accommodations_id' }
        })
    });

    // 7. Permissions
    console.log('Setting public read access...');
    await fetch(`${DIRECTUS_URL}/permissions`, { method: 'POST', headers, body: JSON.stringify({ role: null, collection: 'accommodations', action: 'read', fields: ['*'] }) });
    await fetch(`${DIRECTUS_URL}/permissions`, { method: 'POST', headers, body: JSON.stringify({ role: null, collection: 'accommodations_files', action: 'read', fields: ['*'] }) });

    console.log('Accommodation schema complete.');
}

main();
