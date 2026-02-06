const DIRECTUS_URL = 'http://localhost:8055';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'password';
const STATIC_TOKEN = 'build-token-12345'; // Simple token for local build

async function main() {
  console.log('Authenticating...');
  const authRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (!authRes.ok) {
    throw new Error(`Login failed: ${authRes.statusText}`);
  }

  const { data: { access_token } } = await authRes.json();
  const headers = {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  };

  // 1. Create Collection
  console.log('Creating "property" collection...');
  const collectionRes = await fetch(`${DIRECTUS_URL}/collections`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      collection: 'property',
      schema: {},
      meta: { singleton: false, sort_field: null }
    })
  });
  
  if (collectionRes.ok) {
     console.log('Collection created.');
  } else if (collectionRes.status === 409) { // Conflict
     console.log('Collection already exists.');
  } else {
     console.error('Failed to create collection', await collectionRes.text());
  }

  // 2. Create Fields
  const fields = [
    { field: 'title', type: 'string', meta: { interface: 'input', special: null } },
    { field: 'slug', type: 'string', schema: { is_unique: true }, meta: { interface: 'input', special: null } },
    { field: 'content', type: 'text', meta: { interface: 'input-rich-text-html', special: null } }
  ];

  for (const f of fields) {
    console.log(`Creating field "${f.field}"...`);
    const res = await fetch(`${DIRECTUS_URL}/fields/property`, {
        method: 'POST',
        headers,
        body: JSON.stringify(f)
    });
    if (res.ok || res.status === 409) console.log(`Field ${f.field} ready.`);
    else console.error(`Failed field ${f.field}`, await res.text());
  }

  // 3. Public Permissions
  console.log('Setting public read access...');
  const permRes = await fetch(`${DIRECTUS_URL}/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
          role: null, // Public
          collection: 'property',
          action: 'read',
          fields: ['*']
      })
  });
  if (permRes.ok) console.log('Public permissions set.');
  else console.log('Permissions might already exist or failed.', permRes.status);

  // 4. Set Static Token for Admin (simplified for local setup)
  // We'll just update the current user to have a static token
  console.log('Setting static token...');
  const userRes = await fetch(`${DIRECTUS_URL}/users/me`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ token: STATIC_TOKEN })
  });
  
  if (userRes.ok) console.log('Static token set.');
  else console.error('Failed to set token', await userRes.text());

  console.log('\nSetup Complete!');
  console.log(`API Endpoint: ${DIRECTUS_URL}/items/property`);
  console.log(`Static Token: ${STATIC_TOKEN}`);
}

// Wait for server to be ready
setTimeout(main, 5000);
