import { handleSavedRequest, type SavedDependencies } from './saved-api';
import { FinderHttpError } from './errors';
import { loadCustomerProperties } from './database';
import { finderMunicipalities, type FinderProperty } from '../../src/lib/property-finder/model';
import { authorizeFinderRequest, type AuthorizationDependencies, type FinderAuthorizationEnv } from './authorization';
import { requireCurrentGrant } from './membership';

export type FinderEnv = FinderAuthorizationEnv;

const privateHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'Vary': 'Authorization, Cookie',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Pragma': 'no-cache',
    'Expires': '0',
};

interface Dependencies extends Partial<AuthorizationDependencies>, SavedDependencies {
    load: (env: FinderEnv) => Promise<FinderProperty[]>;
}

export async function handleFinderRequest(request: Request, env: FinderEnv, dependencies: Dependencies = {
    load: loadCustomerProperties,
}): Promise<Response> {
    const reply = (status: number, data: object) => new Response(JSON.stringify(data), { status, headers: privateHeaders });
    const url = new URL(request.url);
    if (url.pathname.replace(/\/$/, '') === '/api/property-finder/saved-properties' || url.pathname.startsWith('/api/property-finder/saved-properties/')) return handleSavedRequest(request, env, dependencies);
    if (request.method !== 'GET') return reply(405, { code: 'method_not_allowed' });
    if (url.pathname.replace(/\/$/, '') !== '/api/property-finder/properties') return reply(404, { code: 'not_found' });
    const origin = request.headers.get('Origin');
    if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return reply(403, { code: 'same_origin_required' });
    try {
        const grant = await authorizeFinderRequest(request, env, 'listings:read', dependencies);
        const properties = await dependencies.load(env);
        requireCurrentGrant(grant);
        return reply(200, { properties, count: properties.length, municipalities: finderMunicipalities });
    } catch (error) {
        if (error instanceof FinderHttpError) return reply(error.status, { code: error.code });
        // No driver errors, credentials, JWTs or listing contents in responses/logs.
        return reply(503, { code: 'directory_unavailable' });
    }
}
