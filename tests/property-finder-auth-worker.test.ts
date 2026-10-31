import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('The real Workers runtime accepts provider requests and never follows provider redirects', async () => {
    // Reuse the build/runtime tools already supplied by Wrangler. No real
    // provider, production keys, database, account or email is involved.
    const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
        import { providerRequest } from './server/auth/provider';
        export default { async fetch(request) {
            const env = { FINDER_AUTH_ENABLED: 'enabled', FINDER_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
                FINDER_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_worker_test_only',
                FINDER_AUTH_COOKIE_SECRET: 'local-worker-test-only-signing-secret-never-production-0123456789' };
            try {
                const settings = await providerRequest(env, '/settings');
                await providerRequest(env, '/signup', {email:'synthetic@example.invalid',password:'synthetic-only-password'});
                return Response.json({settingsAccepted: settings.mailer_autoconfirm === false});
            } catch (error) { return Response.json({failure:error.failure}, {status:503}); }
        }};
    ` }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
    let redirect = false;
    const calls: string[] = [];
    const runtime = new Miniflare(convertV4MiniflareOptions({
        modules: true, compatibilityDate: '2026-10-27', compatibilityFlags: ['nodejs_compat'],
        script: bundle.outputFiles[0].text,
        outboundService: async request => {
            const url = new URL(request.url);
            assert.equal(url.origin, 'https://abcdefghijklmnopqrst.supabase.co');
            calls.push(url.pathname);
            if (redirect) return new Response(null, { status: 302, headers: { Location: 'https://attacker.example/collect' } });
            return Response.json(url.pathname.endsWith('/settings') ? { mailer_autoconfirm: false } : {});
        },
    }));
    try {
        let response = await runtime.dispatchFetch('https://local.test/');
        assert.equal(response.status, 200); assert.deepEqual(await response.json(), { settingsAccepted: true });
        assert.deepEqual(calls, ['/auth/v1/settings', '/auth/v1/signup']);
        calls.length = 0; redirect = true;
        response = await runtime.dispatchFetch('https://local.test/');
        assert.equal(response.status, 503); assert.deepEqual(await response.json(), { failure: 'redirect' });
        assert.deepEqual(calls, ['/auth/v1/settings']);
    } finally { await runtime.dispose(); }
});
