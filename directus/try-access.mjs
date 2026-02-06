const DIRECTUS_URL = 'http://localhost:8055';
const TOKEN = 'build-token-12345';

async function main() {
    const headers = {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
    };

    // 1. Get Policy ID
    const policyRes = await fetch(`${DIRECTUS_URL}/policies`, { headers });
    const policies = (await policyRes.json()).data;
    const policy = policies.find(p => p.name === 'Public Read Property');

    if (!policy) {
        console.error('Policy not found! Run the previous script first.');
        return;
    }

    console.log('Policy Found:', policy.id);

    // 2. Try linking via /access
    console.log('Attempting POST /access ...');
    const accessRes = await fetch(`${DIRECTUS_URL}/access`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            role: null, // Public
            policy: policy.id
        })
    });

    if (accessRes.ok) {
        console.log('Success! Policy linked to public access.');
        return;
    }

    console.log('POST /access failed:', accessRes.status, await accessRes.text());

    // 3. Fallback: Check if we can POST to /permissions with empty collection but with policy?
    // No, error said collection required.
}

main();
