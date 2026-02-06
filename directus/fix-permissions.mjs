const DIRECTUS_URL = 'http://localhost:8055';
const TOKEN = 'build-token-12345';

async function main() {
    const headers = {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
    };

    console.log('Fetching Permissions...');
    const permsRes = await fetch(`${DIRECTUS_URL}/permissions`, { headers });
    const perms = (await permsRes.json()).data;
    const propPerm = perms.find(p => p.collection === 'property' && p.role === null); // Check for public role specifically

    if (propPerm) {
        console.log('Public permission for property already exists.');
        return;
    }

    console.log('Creating Public Policy...');

    // 1. Create Policy
    const policyRes = await fetch(`${DIRECTUS_URL}/policies`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            name: 'Public Read Property',
            icon: 'public',
            description: 'Allows public read access to property collection',
            enforce_tfa: false,
            admin_access: false,
            app_access: false,
            permissions: [
                {
                    collection: 'property',
                    action: 'read',
                    fields: ['*'],
                    definition: null
                }
            ]
        })
    });

    if (!policyRes.ok) {
        console.error('Failed to create policy:', await policyRes.text());
        return;
    }

    const policyId = (await policyRes.json()).data.id;
    console.log('Policy Created:', policyId);

    // 2. Assign Policy to Public (Role = null)
    console.log('Assigning Policy to Public...');
    const permRes = await fetch(`${DIRECTUS_URL}/permissions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            policy: policyId,
            role: null
        })
    });

    if (!permRes.ok) {
        console.error('Failed to assign permission:', await permRes.text());
    } else {
        console.log('Public Permission assigned!');
    }
}

main();
