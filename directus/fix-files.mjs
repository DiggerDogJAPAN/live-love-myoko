import { createDirectus, rest, staticToken, readPolicies, createPolicy, createPermission, updatePolicy } from '@directus/sdk';

const directus = createDirectus('http://localhost:8055').with(staticToken('super-secret-admin-token')).with(rest());

async function main() {
    try {
        const policies = await directus.request(readPolicies());
        let publicPolicy = policies.find(p => p.name === 'Public Read Files');
        
        if (!publicPolicy) {
            console.log("Creating policy...");
            publicPolicy = await directus.request(createPolicy({
                name: 'Public Read Files',
                description: 'Allows reading files',
                icon: 'public'
            }));
            
            console.log("Creating permission...");
            await directus.request(createPermission({
                collection: 'directus_files',
                action: 'read',
                policy: publicPolicy.id,
                fields: ['*']
            }));
        }

        console.log("Assigning to Public role...");
        // Assign to the specific public role id 
        await directus.request(updatePolicy(publicPolicy.id, {
            roles: [ 'abf8a154-5b1c-4a46-ac9c-7300570f4f17' ],
            users: []
        }));
        
        console.log("Done");
    } catch(e) {
        console.error("Error setting policy:", e.errors ? e.errors : e);
    }
}
main();
