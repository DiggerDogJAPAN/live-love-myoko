import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Actual workerd transport. Synthetic signature verification only; no real
// keys/accounts or database calls. JWT cryptography is covered in Auth tests.
test('Workers token handoff needs the existing session, opens no database, rejects ownership input and retires old Saved Properties routes', async () => {
    const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
        import {handleAuthRequest} from './server/auth/api';
        import {FinderHttpError} from './server/property-finder/errors';
        const env={FINDER_AUTH_ENABLED:'enabled',FINDER_SUPABASE_PROJECT_REF:'fgdoqsepihlzfqlqymet',FINDER_AUTH_SITE_ORIGIN:'https://love-live-myoko.com',FINDER_CUSTOMER_ACCESS:'disabled',FINDER_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_only',FINDER_AUTH_COOKIE_SECRET:'synthetic-only-signing-secret-not-production-0123456789'};
        export default {async fetch(request){
            return handleAuthRequest(request,env,{verify:async credential=>{
                if(credential.headers.get('Authorization')!=='Bearer synthetic-existing-session') throw new FinderHttpError(401,'authentication_required');
                return {kind:'customer',userId:'00000000-0000-4000-8000-000000000001',sessionId:'00000000-0000-4000-8000-000000000011',tokenExpiresAt:Date.now()+3600000};
            },snapshot:async()=>{throw new Error('Unexpected database lookup')},transport:async()=>{throw new Error('Unexpected Auth API request')}});
        }};
    ` }, bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', external: ['node:*', 'cloudflare:*'],
    plugins: [{ name: 'reject-database-access', setup(builder) {
        builder.onResolve({ filter: /^pg$/ }, () => ({ path: 'pg', namespace: 'synthetic-db' }));
        builder.onLoad({ filter: /.*/, namespace: 'synthetic-db' }, () => ({ contents: 'export class Client {constructor(){throw new Error("Unexpected database connection")}}', loader: 'js' }));
    } }], });
    const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-10-27', compatibilityFlags: ['nodejs_compat'], script: bundle.outputFiles[0].text }));
    const origin = 'https://love-live-myoko.com';
    const headers = { Origin: origin, 'Content-Type': 'application/json', Cookie: '__Host-llm-access=synthetic-existing-session' };
    try {
        const response = await runtime.dispatchFetch(origin + '/api/auth/supabase-access', { method: 'POST', headers, body: '{}' });
        assert.equal(response.status, 200); assert.match(response.headers.get('Cache-Control')!, /private, no-store/);
        assert.deepEqual(await response.json(), { accessToken: 'synthetic-existing-session', supabaseOrigin: 'https://fgdoqsepihlzfqlqymet.supabase.co', publishableKey: 'sb_publishable_synthetic_only' });
        assert.equal((await runtime.dispatchFetch(origin + '/api/auth/supabase-access', { method: 'POST', headers, body: '{"userId":"forged"}' })).status, 400);
        assert.equal((await runtime.dispatchFetch(origin + '/api/auth/supabase-access', { method: 'POST', headers: { ...headers, Cookie: '' }, body: '{}' })).status, 401);
        assert.equal((await runtime.dispatchFetch(origin + '/api/auth/supabase-access', { method: 'POST', headers: { ...headers, Origin: 'https://attacker.invalid' }, body: '{}' })).status, 403);
    } finally { await runtime.dispose(); }
});
