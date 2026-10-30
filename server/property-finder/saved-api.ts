import { authorizeFinderRequest, type AuthorizationDependencies, type FinderAuthorizationEnv } from './authorization';
import { requireCurrentGrant, type CustomerGrant } from './membership';
import { savedPropertyOperation, type SavedQuery, type SavedResult } from './saved-database';
import { FinderHttpError } from './errors';
import { reportSavedFailure, type SavedRequestStage } from './saved-diagnostics';
import { LISTING_ID } from '../../src/lib/property-finder/saved';

export interface SavedDependencies extends Partial<AuthorizationDependencies> {
    saved?: (env: FinderAuthorizationEnv, grant: CustomerGrant, query: SavedQuery) => Promise<SavedResult>;
}
export const SAVED_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store', 'Cloudflare-CDN-Cache-Control': 'no-store', 'Vary': 'Authorization, Cookie, Origin',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', 'Pragma': 'no-cache', 'Expires': '0',
};
/** Bodyless does not mean a null stream: Workers supplies a zero-byte stream
 * for an empty PUT. Inspect bytes with a zero-byte payload limit, not truthiness. */
async function requireEmptySavedBody(request: Request): Promise<void> {
    const length = request.headers.get('Content-Length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) !== 0)) {
        await request.body?.cancel();
        throw new FinderHttpError(400, 'invalid_saved_request');
    }
    const reader = request.body?.getReader();
    if (!reader) return;
    try {
        while (true) {
            const part = await reader.read();
            if (part.value?.byteLength) { await reader.cancel(); throw new FinderHttpError(400, 'invalid_saved_request'); }
            if (part.done) return;
        }
    } finally { reader.releaseLock(); }
}
export async function handleSavedRequest(request: Request, env: FinderAuthorizationEnv, dependencies: SavedDependencies = {}): Promise<Response> {
    const headers = new Headers(SAVED_HEADERS);
    const requestId = crypto.randomUUID(); headers.set('X-Request-ID', requestId);
    let operation = 'unknown'; let stage: SavedRequestStage = 'route';
    const reply = (status: number, data: object) => new Response(JSON.stringify(data), { status, headers });
    try {
        const url = new URL(request.url);
        const path = url.pathname.replace(/\/$/, '');
        const base = '/api/property-finder/saved-properties';
        let query: SavedQuery;
        if (path === base || path === base + '/ids') {
            if (request.method !== 'GET') throw new FinderHttpError(405, 'method_not_allowed');
            const cursor = url.searchParams.get('cursor');
            if ([...url.searchParams].some(([key]) => key !== 'cursor') || url.searchParams.getAll('cursor').length > 1
                || (path.endsWith('/ids') && url.search)
                || (cursor !== null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f-]{36}$/i.test(cursor)
                    || !Number.isFinite(Date.parse(cursor.split('|')[0])) || !LISTING_ID.test(cursor.split('|')[1])))) throw new FinderHttpError(400, 'invalid_saved_request');
            query = { operation: path.endsWith('/ids') ? 'ids' : 'list', ...(cursor ? { cursor } : {}) };
        } else {
            const id = path.slice(base.length + 1);
            if (!path.startsWith(base + '/') || !LISTING_ID.test(id)) throw new FinderHttpError(400, 'invalid_listing_id');
            if (!['PUT', 'DELETE'].includes(request.method)) throw new FinderHttpError(405, 'method_not_allowed');
            if (url.search) throw new FinderHttpError(400, 'invalid_saved_request');
            query = { operation: request.method === 'PUT' ? 'save' : 'remove', propertyId: id.toLowerCase() };
        }
        operation = query.operation;
        const origin = env.FINDER_AUTH_SITE_ORIGIN || 'https://love-live-myoko.com';
        const mutation = request.method !== 'GET';
        if (url.origin !== origin || request.headers.get('Sec-Fetch-Site') === 'cross-site'
            || (request.headers.has('Origin') && request.headers.get('Origin') !== origin)
            || (mutation && request.headers.get('Origin') !== origin)) throw new FinderHttpError(403, 'same_origin_required');
        stage = 'authorization';
        const grant = await authorizeFinderRequest(request, env, 'saved-properties:use', dependencies);
        // The URL supplies the listing ID; signed claims supply the owner.
        // Reject every nonempty body, including unbounded/chunked ownership data.
        stage = 'request_body';
        await requireEmptySavedBody(request);
        stage = 'storage';
        const result = await (dependencies.saved || savedPropertyOperation)(env, grant, query);
        stage = 'response';
        requireCurrentGrant(grant);
        return reply(200, result);
    } catch (error) {
        const status = error instanceof FinderHttpError ? error.status : 503;
        const code = error instanceof FinderHttpError ? error.code : 'saved_properties_unavailable';
        reportSavedFailure(requestId, operation, request.method, stage, status, code, error);
        if (error instanceof FinderHttpError) {
            if (error.status === 429) headers.set('Retry-After', '60');
            return reply(error.status, { code: error.code });
        }
        return reply(503, { code: 'saved_properties_unavailable' });
    }
}
