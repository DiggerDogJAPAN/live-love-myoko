import { authenticateAdministrator, FinderHttpError, type FinderAccessEnv, type FinderIdentity } from './access';
import { loadCustomerProperties, type FinderDatabaseEnv } from './database';
import { finderMunicipalities, type FinderProperty } from '../../src/lib/property-finder/model';

export interface FinderEnv extends FinderAccessEnv, FinderDatabaseEnv {}

const privateHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'Vary': 'Cf-Access-Jwt-Assertion, Cookie',
    'X-Content-Type-Options': 'nosniff',
};

interface Dependencies {
    authenticate: (request: Request, env: FinderEnv) => Promise<FinderIdentity>;
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
        // Authentication AND admin entitlement before any database connection.
        await dependencies.authenticate(request, env);
        if (isLogin) {
            return new Response(null, { status: 303, headers: { ...privateHeaders, Location: 'https://love-live-myoko.com/property-finder/search/' } });
        }
        const properties = await dependencies.load(env);
        return reply(200, { properties, count: properties.length, municipalities: finderMunicipalities });
    } catch (error) {
        if (error instanceof FinderHttpError) return reply(error.status, { code: error.code });
        // No driver errors, credentials, JWTs or listing contents in responses/logs.
        return reply(503, { code: 'directory_unavailable' });
    }
}
