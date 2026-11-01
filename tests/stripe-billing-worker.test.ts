import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('Billing Supabase and Stripe requests work in Workers and never follow credential-bearing redirects', async () => {
    const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
        import { billingRpc, stripeRequest } from './server/billing/provider';
        export default { async fetch(request) {
            const env = { FINDER_BILLING_SUPABASE_SECRET_KEY: 'sb_secret_LocalWorkerTestOnly',
                STRIPE_SECRET_KEY: 'sk_test_LocalWorkerTestOnly' };
            try {
                const result = new URL(request.url).pathname === '/database'
                    ? await billingRpc(env, 'finder_billing_lock', { p_user: null, p_customer: null, p_livemode: false, p_event: null }, fetch)
                    : await stripeRequest(env, '/prices/price_LocalWorkerTestOnly', fetch);
                return Response.json(result);
            } catch (error) { return Response.json({ code: error.code }, { status: 503 }); }
        }};
    ` }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
    let redirect = false;
    const calls: string[] = [];
    const runtime = new Miniflare(convertV4MiniflareOptions({
        modules: true, compatibilityDate: '2026-10-27', compatibilityFlags: ['nodejs_compat'],
        script: bundle.outputFiles[0].text,
        outboundService: async request => {
            const url = new URL(request.url);
            assert(['https://fgdoqsepihlzfqlqymet.supabase.co', 'https://api.stripe.com'].includes(url.origin));
            calls.push(url.origin);
            if (url.hostname.endsWith('supabase.co')) {
                assert.equal(request.headers.get('apikey'), 'sb_secret_LocalWorkerTestOnly');
                assert.equal(request.headers.get('Authorization'), null);
                assert.equal(request.method, 'POST');
            } else {
                assert.equal(request.headers.get('Authorization'), 'Bearer sk_test_LocalWorkerTestOnly');
                assert.equal(request.headers.get('Stripe-Version'), '2026-07-29.dahlia');
                assert.equal(request.method, 'GET');
            }
            if (redirect) return new Response(null, { status: 302, headers: { Location: 'https://attacker.example/collect' } });
            return Response.json({ accepted: true });
        },
    }));
    try {
        for (const route of ['/database', '/stripe']) {
            calls.length = 0;
            const response = await runtime.dispatchFetch('https://local.test' + route);
            assert.equal(response.status, 200, route);
            assert.deepEqual(await response.json(), { accepted: true });
            assert.equal(calls.length, 1);
        }
        redirect = true;
        for (const route of ['/database', '/stripe']) {
            calls.length = 0;
            const response = await runtime.dispatchFetch('https://local.test' + route);
            assert.equal(response.status, 503, route);
            assert.deepEqual(await response.json(), { code: 'billing_unavailable' });
            assert.equal(calls.length, 1);
        }
    } finally { await runtime.dispose(); }
});
