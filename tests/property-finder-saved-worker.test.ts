import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Exercise the actual HTTP handler in workerd. Only token/provider verification
// and persistence are synthetic fixtures; no production keys, network or DB.
test('Workers zero-byte PUT/DELETE streams support administrator saves, refresh reads and removal without admitting payloads', async () => {
    const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
        import {handleSavedRequest} from './server/property-finder/saved-api';
        import {FinderHttpError} from './server/property-finder/errors';
        const users={admin:'00000000-0000-4000-8000-000000000001',premium:'00000000-0000-4000-8000-000000000002',basic:'00000000-0000-4000-8000-000000000003',unpaid:'00000000-0000-4000-8000-000000000004'};
        const session='00000000-0000-4000-8000-000000000011', records=new Map();
        export default {async fetch(request){
            const supplied=request.headers.get('Authorization')?.replace('Bearer synthetic-worker-','');
            const response=await handleSavedRequest(request,{FINDER_AUTH_ENABLED:'enabled',FINDER_DATABASE_PROJECT_REF:'abcdefghijklmnopqrst',FINDER_AUTH_SITE_ORIGIN:'https://love-live-myoko.com',FINDER_CUSTOMER_ACCESS:request.headers.get('X-Fixture-Customers')==='enabled'?'enabled':'disabled'},{
                verifyIdentity:async()=>{if(!Object.hasOwn(users,supplied||''))throw new FinderHttpError(401,'authentication_required');return {kind:'customer',userId:users[supplied],sessionId:session,tokenExpiresAt:Date.now()+3600000};},
                loadMembership:async()=>({schemaVersion:2,userId:users[supplied],sessionId:session,sessionActive:true,sessionValidUntil:null,accountActive:true,role:supplied==='admin'?'administrator':'customer',subscriptionActive:supplied!=='unpaid',tier:supplied==='premium'?'premium':'basic',status:'active',paymentStatus:'paid',accessStartsAt:new Date(Date.now()-1000).toISOString(),paidThrough:new Date(Date.now()+3600000).toISOString(),revokedAt:null}),
                saved:async(_env,grant,query)=>{
                    const ids=records.get(grant.userId)||new Set();records.set(grant.userId,ids);
                    if(query.operation==='save')ids.add(query.propertyId);
                    if(query.operation==='remove')ids.delete(query.propertyId);
                    if(query.operation==='save'||query.operation==='remove')return {propertyId:query.propertyId,saved:query.operation==='save'};
                    if(query.operation==='ids')return {ids:[...ids],total:ids.size};
                    return {items:[...ids].map(propertyId=>({propertyId,savedAt:'2026-10-30T00:00:00.000Z',property:{id:propertyId,title:'Synthetic current listing',sourceName:'Synthetic source',askingPriceJpy:1500000}})),total:ids.size,nextCursor:null};
                }
            });
            response.headers.set('X-Fixture-Request-Had-Stream',String(request.body!==null));return response;
        }};
    ` }, bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', external: ['node:*', 'cloudflare:*'],
        plugins: [{ name: 'reject-unexpected-database-access', setup(builder) {
            builder.onResolve({ filter: /^pg$/ }, () => ({ path: 'pg', namespace: 'synthetic-db' }));
            builder.onLoad({ filter: /.*/, namespace: 'synthetic-db' }, () => ({ contents: 'export class Client {constructor(){throw new Error("Unexpected database call in HTTP fixture")}}', loader: 'js' }));
        } }],
    });
    const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-10-27', compatibilityFlags: ['nodejs_compat'], script: bundle.outputFiles[0].text }));
    const base = 'https://love-live-myoko.com/api/property-finder/saved-properties', id = '00000000-0000-4000-8000-000000000101';
    const headers = { Origin: 'https://love-live-myoko.com', Authorization: 'Bearer synthetic-worker-admin', 'X-Request-ID': 'untrusted-private-request-id' };
    try {
        // Exactly the deployed frontend contract: UUID in URL, no JSON body.
        let response = await runtime.dispatchFetch(base + '/' + id, { method: 'PUT', headers });
        assert.equal(response.headers.get('X-Fixture-Request-Had-Stream'), 'true', 'workerd supplies a stream for the empty PUT');
        assert.equal(response.status, 200); assert.deepEqual(await response.json(), { propertyId: id, saved: true });
        assert.match(response.headers.get('X-Request-ID')!, /^[0-9a-f-]{36}$/); assert.notEqual(response.headers.get('X-Request-ID'), headers['X-Request-ID']);
        for (let refresh = 0; refresh < 2; refresh++) {
            response = await runtime.dispatchFetch(base + '/ids', { headers }); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ids: [id], total: 1 });
        }
        response = await runtime.dispatchFetch(base, { headers }); const page = await response.json() as { total: number; items: { property: { id: string; askingPriceJpy: number } }[] };
        assert.equal(response.status, 200); assert.equal(page.total, 1); assert.equal(page.items[0].property.id, id); assert.equal(page.items[0].property.askingPriceJpy, 1500000);
        // Length zero cannot be used as proof alone; reject real/chunked bytes.
        for (const body of [' ', JSON.stringify({ userId: 'forged-owner' }), new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); controller.close(); } })]) {
            response = await runtime.dispatchFetch(base + '/' + id, { method: 'PUT', headers, body: body as NonNullable<Parameters<typeof runtime.dispatchFetch>[1]>['body'], duplex: 'half' });
            assert.equal(response.status, 400); assert.deepEqual(await response.json(), { code: 'invalid_saved_request' });
        }
        for (const [who, rollout, status] of [['premium', 'disabled', 403], ['premium', 'enabled', 200], ['basic', 'enabled', 403], ['unpaid', 'enabled', 403], ['invalid', 'enabled', 401]] as const) {
            response = await runtime.dispatchFetch(base + '/' + id, { method: 'PUT', headers: { ...headers, Authorization: 'Bearer synthetic-worker-' + who, 'X-Fixture-Customers': rollout } });
            assert.equal(response.status, status);
        }
        response = await runtime.dispatchFetch(base + '/ids'); assert.equal(response.status, 401);
        // Explicit empty stream on DELETE must be accepted too.
        response = await runtime.dispatchFetch(base + '/' + id, { method: 'DELETE', headers, body: '', duplex: 'half' }); assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { propertyId: id, saved: false });
        response = await runtime.dispatchFetch(base + '/ids', { headers }); assert.deepEqual(await response.json(), { ids: [], total: 0 });
    } finally { await runtime.dispose(); }
});
