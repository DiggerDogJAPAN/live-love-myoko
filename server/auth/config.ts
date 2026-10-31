import { FinderHttpError } from '../property-finder/errors';
import type { CustomerAuthEnv } from '../property-finder/customer-auth';
export interface AuthEnv extends CustomerAuthEnv {
    FINDER_AUTH_SITE_ORIGIN?: string;
    FINDER_SUPABASE_PUBLISHABLE_KEY?: string;
    FINDER_AUTH_COOKIE_SECRET?: string;
    FINDER_GOOGLE_LOGIN_ENABLED?: string;
}
export const AUTH_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store', 'Cloudflare-CDN-Cache-Control': 'no-store',
    'Vary': 'Cookie, Authorization, Origin', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Pragma': 'no-cache', 'Expires': '0',
};
export function siteOrigin(env: AuthEnv): string {
    const value = env.FINDER_AUTH_SITE_ORIGIN || 'https://love-live-myoko.com';
    try {
        const url = new URL(value);
        if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error();
        if (url.origin !== 'https://love-live-myoko.com' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw Error();
        return url.origin;
    } catch { throw new FinderHttpError(503, 'authentication_not_configured'); }
}
export function authConfiguration(env: AuthEnv) {
    if (env.FINDER_AUTH_ENABLED !== 'enabled' || !/^[a-z0-9]{20}$/.test(env.FINDER_SUPABASE_PROJECT_REF || '')
        || !/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(env.FINDER_SUPABASE_PUBLISHABLE_KEY || '')
        || !env.FINDER_AUTH_COOKIE_SECRET || new TextEncoder().encode(env.FINDER_AUTH_COOKIE_SECRET).length < 43) {
        throw new FinderHttpError(503, 'authentication_not_configured');
    }
    return { origin: siteOrigin(env), provider: `https://${env.FINDER_SUPABASE_PROJECT_REF}.supabase.co/auth/v1`,
        publishableKey: env.FINDER_SUPABASE_PUBLISHABLE_KEY!, secret: new TextEncoder().encode(env.FINDER_AUTH_COOKIE_SECRET) };
}
export function requireSameOrigin(request: Request, env: AuthEnv, mutation: boolean): void {
    const origin = siteOrigin(env);
    if (new URL(request.url).origin !== origin || request.headers.get('Sec-Fetch-Site') === 'cross-site'
        || (request.headers.has('Origin') && request.headers.get('Origin') !== origin)
        || (mutation && request.headers.get('Origin') !== origin)) throw new FinderHttpError(403, 'same_origin_required');
}
export async function readAuthBody(request: Request): Promise<Record<string, unknown>> {
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new FinderHttpError(415, 'json_required');
    if (Number(request.headers.get('Content-Length') || 0) > 8192) throw new FinderHttpError(413, 'request_too_large');
    const reader = request.body?.getReader();
    if (!reader) throw new FinderHttpError(400, 'invalid_request');
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
        if (size > 8192) { await reader.cancel(); throw new FinderHttpError(413, 'request_too_large'); } chunks.push(part.value); }
    try { const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
        const value = JSON.parse(new TextDecoder().decode(bytes));
        if (!value || Array.isArray(value) || typeof value !== 'object') throw Error(); return value;
    } catch { throw new FinderHttpError(400, 'invalid_request'); }
}
