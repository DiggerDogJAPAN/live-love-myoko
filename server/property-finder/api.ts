import { authenticateAdministrator, FinderHttpError, type FinderIdentity } from './access';
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
    'Vary': 'Cf-Access-Jwt-Assertion, Authorization, Cookie',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Pragma': 'no-cache',
    'Expires': '0',
};

interface Dependencies extends Partial<AuthorizationDependencies> {
    authenticate?: (request: Request, env: FinderEnv) => Promise<FinderIdentity>;
    load: (env: FinderEnv) => Promise<FinderProperty[]>;
}

export async function handleFinderRequest(request: Request, env: FinderEnv, dependencies: Dependencies = {
    authenticate: authenticateAdministrator, load: loadCustomerProperties,
}): Promise<Response> {
    const reply = (status: number, data: object) => new Response(JSON.stringify(data), { status, headers: privateHeaders });
    const url = new URL(request.url);
    if (request.method !== 'GET') return reply(405, { code: 'method_not_allowed' });
    if (!['/api/property-finder/properties', '/api/property-finder/login'].includes(url.pathname.replace(/\/$/, ''))) return reply(404, { code: 'not_found' });
    const isLogin = url.pathname.replace(/\/$/, '').endsWith('/login');
    const origin = request.headers.get('Origin');
    // Access sign-in returns via a cross-site top-level navigation. It may reach
    // the verified login redirect, but never a cross-origin properties response.
    if (!isLogin && ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')) return reply(403, { code: 'same_origin_required' });
    try {
        // Login stays administrator-only; all data passes the common authorization gate.
        if (isLogin) {
            await (dependencies.authenticate || authenticateAdministrator)(request, env);
            return new Response(null, { status: 303, headers: { ...privateHeaders, Location: 'https://love-live-myoko.com/property-finder/search/' } });
        }
        const grant = await authorizeFinderRequest(request, env, 'listings:read', dependencies);
        const properties = await dependencies.load(env);
        if (grant.kind === 'customer') requireCurrentGrant(grant);
        return reply(200, { properties, count: properties.length, municipalities: finderMunicipalities });
    } catch (error) {
        if (error instanceof FinderHttpError) return reply(error.status, { code: error.code });
        // No driver errors, credentials, JWTs or listing contents in responses/logs.
        return reply(503, { code: 'directory_unavailable' });
    }
}
