const DIRECTUS_URL = 'http://localhost:8055';
const TOKEN = 'build-token-12345';

async function main() {
    const headers = {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
    };

    // 1. Delete Collections (for clean start)
    console.log('Cleaning up existing collections...');
    try {
        await fetch(`${DIRECTUS_URL}/collections/properties_files`, { method: 'DELETE', headers });
        await fetch(`${DIRECTUS_URL}/collections/properties`, { method: 'DELETE', headers });
    } catch (e) { }

    // 2. Create Properties Collection
    console.log('Creating "properties" collection...');
    await fetch(`${DIRECTUS_URL}/collections`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            collection: 'properties',
            schema: {},
            meta: {
                display_template: '{{ title }} — {{ location }}',
                show_archive_status: false,
                icon: 'home'
            }
        })
    });

    // 3. Create Properties Files Junction Collection
    console.log('Creating "properties_files" junction collection...');
    await fetch(`${DIRECTUS_URL}/collections`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            collection: 'properties_files',
            meta: { hidden: true },
            schema: {}
        })
    });

    // 4. Create Junction Fields
    const junctionFields = [
        { field: 'id', type: 'integer', schema: { is_primary_key: true, has_auto_increment: true } },
        { field: 'properties_id', type: 'integer', schema: { foreign_key_table: 'properties', foreign_key_column: 'id' } },
        { field: 'directus_files_id', type: 'uuid', schema: { foreign_key_table: 'directus_files', foreign_key_column: 'id' } }
    ];

    for (const f of junctionFields) {
        await fetch(`${DIRECTUS_URL}/fields/properties_files`, {
            method: 'POST',
            headers,
            body: JSON.stringify(f)
        });
    }

    // 5. Create Properties Fields
    const fields = [
        // Basic Info
        { field: 'title', type: 'string', meta: { interface: 'input', required: true, sort: 1 } },
        { field: 'slug', type: 'string', schema: { is_unique: true }, meta: { interface: 'input', required: true, sort: 2 } },
        { field: 'status', type: 'string', meta: { interface: 'select-dropdown', required: true, sort: 3, options: { choices: [{ text: 'For Sale', value: 'for_sale' }, { text: 'Managed', value: 'managed' }, { text: 'Sold', value: 'sold' }] } } },
        { field: 'property_type', type: 'string', meta: { interface: 'select-dropdown', required: true, sort: 4, options: { choices: [{ text: 'House', value: 'house' }, { text: 'Apartment', value: 'apartment' }, { text: 'Lodge', value: 'lodge' }, { text: 'Land', value: 'land' }] } } },
        { field: 'summary', type: 'text', meta: { interface: 'textarea', sort: 5 } },

        // Details
        { field: 'bedrooms', type: 'integer', meta: { interface: 'input', sort: 6 } },
        { field: 'bathrooms', type: 'decimal', meta: { interface: 'input', sort: 7 } },
        { field: 'floor_area_sqm', type: 'integer', meta: { interface: 'input', sort: 8 } },
        { field: 'land_area_sqm', type: 'integer', meta: { interface: 'input', sort: 9 } },
        { field: 'price', type: 'integer', meta: { interface: 'input', sort: 10 } },
        { field: 'price_display', type: 'string', meta: { interface: 'input', sort: 11 } },
        { field: 'description', type: 'text', meta: { interface: 'input-rich-text-html', sort: 12 } },

        // Media
        {
            field: 'featured_image',
            type: 'uuid',
            schema: { foreign_key_table: 'directus_files', foreign_key_column: 'id' },
            meta: { interface: 'file', special: ['file'], required: true, sort: 13 }
        },
        {
            field: 'gallery',
            type: 'alias',
            meta: {
                interface: 'files',
                special: ['m2m'],
                sort: 14,
                options: {
                    junctionField: 'properties_id'
                }
            }
        },

        // Extras
        { field: 'amenities', type: 'json', meta: { interface: 'select-multiple-checkbox', sort: 15, options: { choices: [{ text: 'Fireplace', value: 'fireplace' }, { text: 'Parking', value: 'parking' }, { text: 'Ski-in / Ski-out', value: 'ski_in_out' }, { text: 'Onsen Nearby', value: 'onsen_nearby' }, { text: 'Balcony / Terrace', value: 'balcony_terrace' }, { text: 'Furnished', value: 'furnished' }, { text: 'Staff Accommodation', value: 'staff_accommodation' }] } } },
        { field: 'location', type: 'string', meta: { interface: 'input', sort: 16 } },
        { field: 'map_url', type: 'string', meta: { interface: 'input', sort: 17 } },
        { field: 'area_notes', type: 'text', meta: { interface: 'textarea', sort: 18 } },
        { field: 'seo_title', type: 'string', meta: { interface: 'input', sort: 19 } },
        { field: 'seo_description', type: 'text', meta: { interface: 'textarea', sort: 20 } },
        { field: 'published', type: 'boolean', schema: { default_value: false }, meta: { interface: 'boolean', sort: 21 } }
    ];

    for (const f of fields) {
        console.log(`Creating field "${f.field}"...`);
        await fetch(`${DIRECTUS_URL}/fields/properties`, {
            method: 'POST',
            headers,
            body: JSON.stringify(f)
        });
    }

    // 6. Create Relations for Gallery
    console.log('Creating Gallery relation...');
    await fetch(`${DIRECTUS_URL}/relations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            collection: 'properties_files',
            field: 'properties_id',
            related_collection: 'properties',
            meta: {
                one_field: 'gallery',
                junction_field: 'directus_files_id',
                sort_field: null,
                one_deselect_action: 'nullify'
            }
        })
    });

    await fetch(`${DIRECTUS_URL}/relations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            collection: 'properties_files',
            field: 'directus_files_id',
            related_collection: 'directus_files',
            meta: {
                junction_field: 'properties_id'
            }
        })
    });

    // 7. Public Permissions
    console.log('Setting public read access...');
    await fetch(`${DIRECTUS_URL}/permissions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: null, collection: 'properties', action: 'read', fields: ['*'] })
    });
    await fetch(`${DIRECTUS_URL}/permissions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: null, collection: 'properties_files', action: 'read', fields: ['*'] })
    });
    await fetch(`${DIRECTUS_URL}/permissions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: null, collection: 'directus_files', action: 'read', fields: ['*'] })
    });

    console.log('Media schema configuration complete.');
}

main();
