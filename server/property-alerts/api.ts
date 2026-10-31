import { SignJWT, jwtVerify } from 'jose';
import { verifiedAccount, type AuthDependencies } from '../auth/account';
import { AUTH_HEADERS, readAuthBody, requireSameOrigin, type AuthEnv } from '../auth/config';
import { FinderHttpError } from '../property-finder/errors';
import { alertProperties, propertyAlertEmail } from './email';
import type { CustomerViewRow } from '../../src/lib/property-finder/property-data';

export interface AlertsEnv extends AuthEnv {
    FINDER_ALERTS_ENABLED?: string; RESEND_API_KEY?: string; FINDER_ALERTS_FROM?: string;
    FINDER_ALERTS_SUPABASE_SECRET_KEY?: string; FINDER_ALERTS_CRON_SECRET?: string;
}
interface Job { id: string; lease: string; userId: string; recipient: string; createdAt: string; isTest: boolean; properties: CustomerViewRow[] }
interface Dependencies extends Partial<AuthDependencies> { transport?: typeof fetch }
const origin = 'https://love-live-myoko.com';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function serverKeyValid(key = '') { return key.length <= 8192 && (/^sb_secret_[A-Za-z0-9_-]{10,}$/.test(key) || /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)); }
function databaseConfigured(env: AlertsEnv) {
    return env.FINDER_SUPABASE_PROJECT_REF === 'fgdoqsepihlzfqlqymet' && serverKeyValid(env.FINDER_ALERTS_SUPABASE_SECRET_KEY)
        && (env.FINDER_AUTH_COOKIE_SECRET?.length || 0) >= 32;
}
export function alertsConfigured(env: AlertsEnv) {
    return databaseConfigured(env) && env.FINDER_ALERTS_ENABLED === 'enabled'
        && !!env.RESEND_API_KEY?.startsWith('re_') && env.FINDER_ALERTS_FROM === 'Love Live Myoko <noreply@love-live-myoko.com>';
}

async function workerRpc(env: AlertsEnv, name: string, body: object, transport: typeof fetch) {
    const response = await transport('https://fgdoqsepihlzfqlqymet.supabase.co/rest/v1/rpc/' + name, {
        method: 'POST', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000),
        headers: { apikey: env.FINDER_ALERTS_SUPABASE_SECRET_KEY!, ...(env.FINDER_ALERTS_SUPABASE_SECRET_KEY?.startsWith('eyJ') ? { Authorization: 'Bearer ' + env.FINDER_ALERTS_SUPABASE_SECRET_KEY } : {}), 'Content-Type': 'application/json', 'Content-Profile': 'public', Accept: 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const safe = ['alerts_access_denied', 'alerts_test_rate_limited'].includes(data?.message) ? data.message : 'alerts_unavailable';
        const error = new FinderHttpError(safe === 'alerts_access_denied' ? 403 : safe === 'alerts_test_rate_limited' ? 429 : 503, safe);
        Object.assign(error, { databaseCode: /^[0-9A-Z]{5}$/.test(data?.code || '') ? data.code : undefined, upstreamStatus: response.status, rpc: name }); throw error;
    }
    return data;
}
async function unsubscribeUrl(job: Job, env: AlertsEnv) {
    const issued = Math.floor(Date.parse(job.createdAt) / 1000);
    const token = await new SignJWT({ user: job.userId, delivery: job.id }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer(origin).setAudience('finder-alerts-unsubscribe').setIssuedAt(issued).setExpirationTime(issued + 180 * 86400)
        .sign(new TextEncoder().encode(env.FINDER_AUTH_COOKIE_SECRET));
    return origin + '/api/property-alerts/unsubscribe?token=' + token;
}
async function equalSecret(given: string, expected: string) {
    const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
    const [a, b] = await Promise.all([digest(given), digest(expected)]); let different = 0;
    for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i]; return different === 0;
}
export async function deliverJob(job: Job, env: AlertsEnv, transport: typeof fetch = fetch) {
    if (!uuid.test(job.id) || !uuid.test(job.lease) || !uuid.test(job.userId) || !Number.isFinite(Date.parse(job.createdAt))
        || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(job.recipient) || job.recipient.length > 254
        || !Array.isArray(job.properties) || job.properties.length > 500 || typeof job.isTest !== 'boolean') throw new FinderHttpError(503, 'alerts_unavailable');
    const properties = alertProperties(job.properties);
    if (!properties.length) {
        await workerRpc(env, 'finder_alert_fail', { p_id: job.id, p_lease: job.lease, p_code: 'no_safe_properties', p_uncertain: true }, transport);
        return false;
    }
    const unsubscribe = await unsubscribeUrl(job, env);
    const email = propertyAlertEmail(properties, unsubscribe, job.isTest);
    const permitted = await workerRpc(env, 'finder_alert_dispatch', { p_id: job.id, p_lease: job.lease }, transport);
    if (permitted !== true) return false;
    try {
        const response = await transport('https://api.resend.com/emails', {
            method: 'POST', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000),
            headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'finder-property-alert/' + job.id },
            body: JSON.stringify({ from: env.FINDER_ALERTS_FROM, to: [job.recipient], ...email,
                headers: { 'List-Unsubscribe': '<' + unsubscribe + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !/^[A-Za-z0-9_-]{1,128}$/.test(result?.id || '')) {
            await workerRpc(env, 'finder_alert_fail', { p_id: job.id, p_lease: job.lease, p_code: response.status === 409 ? 'idempotency_conflict' : 'provider_rejected', p_uncertain: response.status === 409 }, transport);
            throw new FinderHttpError(503, 'alerts_delivery_failed');
        }
        // If this write fails, keep the frozen payload pending. The next lease
        // resends the SAME idempotency key; do not silently drop accepted mail.
        const completed = await workerRpc(env, 'finder_alert_complete', { p_id: job.id, p_lease: job.lease, p_provider_id: result.id, p_listing_ids: properties.map(p => p.id) }, transport);
        if (completed !== true) throw new FinderHttpError(503, 'alerts_unavailable');
        return true;
    } catch (error) {
        if (!(error instanceof FinderHttpError)) {
            await workerRpc(env, 'finder_alert_fail', { p_id: job.id, p_lease: job.lease, p_code: 'provider_outcome_unknown' }, transport).catch(() => undefined);
        }
        throw error;
    }
}
export async function handleAlertsRequest(request: Request, env: AlertsEnv, dependencies: Dependencies = {}): Promise<Response> {
    const requestId = crypto.randomUUID(); const headers = new Headers({ ...AUTH_HEADERS, 'X-Request-ID': requestId });
    const reply = (status: number, body: object) => Response.json(body, { status, headers });
    const path = new URL(request.url).pathname.replace(/\/$/, '').split('/').pop();
    const transport = dependencies.transport || fetch; let operation = 'validation';
    try {
        if (!['status', 'test', 'process', 'unsubscribe'].includes(path || '')) return reply(404, { code: 'not_found' });
        if (path === 'unsubscribe') {
            if (!['GET', 'POST'].includes(request.method)) return reply(405, { code: 'method_not_allowed' });
            if (!databaseConfigured(env)) throw new FinderHttpError(503, 'alerts_not_configured');
            const tokens = new URL(request.url).searchParams.getAll('token');
            if (tokens.length !== 1 || tokens[0].length > 2048) throw new FinderHttpError(400, 'invalid_unsubscribe_link');
            let claims;
            try { claims = (await jwtVerify(tokens[0], new TextEncoder().encode(env.FINDER_AUTH_COOKIE_SECRET), { algorithms: ['HS256'], issuer: origin, audience: 'finder-alerts-unsubscribe', requiredClaims: ['iat', 'exp'] })).payload; }
            catch { throw new FinderHttpError(400, 'invalid_unsubscribe_link'); }
            if (!uuid.test(String(claims.user)) || !uuid.test(String(claims.delivery))) throw new FinderHttpError(400, 'invalid_unsubscribe_link');
            if (request.method === 'POST') {
                operation = 'unsubscribe';
                const disabled = await workerRpc(env, 'finder_alert_unsubscribe', { p_id: claims.delivery, p_user: claims.user }, transport);
                if (disabled !== true) throw new FinderHttpError(400, 'invalid_unsubscribe_link');
            }
            const h = new Headers(headers); h.set('Content-Type', 'text/html; charset=utf-8'); h.set('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
            return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Property Alerts | Love Live Myoko</title><body><main><h1>${request.method === 'POST' ? 'Property-alert emails disabled' : 'Disable property-alert emails?'}</h1><p>Your account and membership are unchanged.</p>${request.method === 'GET' ? '<form method="post"><button type="submit">Disable property-alert emails</button></form>' : ''}<p><a href="${origin}/account/#property-alerts">Manage your account</a></p></main></body></html>`, { headers: h });
        }
        if (request.method !== (path === 'status' ? 'GET' : 'POST')) return reply(405, { code: 'method_not_allowed' });
        if (path === 'process') {
            if (new URL(request.url).origin !== origin || !env.FINDER_ALERTS_CRON_SECRET || env.FINDER_ALERTS_CRON_SECRET.length < 32
                || request.headers.get('Authorization')?.length !== env.FINDER_ALERTS_CRON_SECRET.length + 7
                || !await equalSecret(request.headers.get('Authorization')!, 'Bearer ' + env.FINDER_ALERTS_CRON_SECRET)) throw new FinderHttpError(401, 'authentication_required');
        } else {
            requireSameOrigin(request, env, request.method === 'POST'); operation = 'authorization';
            const account = await verifiedAccount(request, env, dependencies);
            if (!account.snapshot.savedPropertiesAccess || (path === 'test' && account.snapshot.role !== 'administrator')) throw new FinderHttpError(403, 'alerts_access_denied');
            if (path === 'status') return reply(200, { configured: alertsConfigured(env) });
            const body = await readAuthBody(request); if (Object.keys(body).length) throw new FinderHttpError(400, 'invalid_request');
            if (!alertsConfigured(env)) throw new FinderHttpError(503, 'alerts_not_configured');
            operation = 'claim_test';
            const job = await workerRpc(env, 'finder_alert_claim', { p_test_user: account.identity.userId }, transport);
            if (!job) return reply(200, { sent: false, code: 'alerts_no_properties' });
            if (job.userId !== account.identity.userId || job.isTest !== true || job.recipient !== account.user.email) throw new FinderHttpError(503, 'alerts_unavailable');
            operation = 'test_delivery';
            return reply(200, { sent: await deliverJob(job, env, transport) });
        }
        const body = await readAuthBody(request); if (Object.keys(body).length) throw new FinderHttpError(400, 'invalid_request');
        if (!alertsConfigured(env)) throw new FinderHttpError(503, 'alerts_not_configured');
        let processed = 0, sent = 0;
        for (; processed < 5; processed++) {
            operation = 'claim_daily'; const job = await workerRpc(env, 'finder_alert_claim', {}, transport); if (!job) break;
            if (job.isTest !== false) throw new FinderHttpError(503, 'alerts_unavailable');
            operation = 'daily_delivery'; if (await deliverJob(job, env, transport)) sent++;
        }
        const pending = await workerRpc(env, 'finder_alert_pending', {}, transport);
        return reply(200, { processed, sent, more: processed === 5 || pending === true, retryAfterSeconds: processed ? 0 : pending ? 60 : 0 });
    } catch (error) {
        const status = error instanceof FinderHttpError ? error.status : 503;
        const code = error instanceof FinderHttpError ? error.code : 'alerts_unavailable';
        const diagnostic = error as { databaseCode?: string; upstreamStatus?: number; rpc?: string } | null;
        const dbCode = diagnostic?.databaseCode;
        console.warn(JSON.stringify({ event: 'finder_alert_failure', requestId, operation, status, code,
            ...(dbCode && /^[0-9A-Z]{5}$/.test(dbCode) ? { databaseCode: dbCode } : {}),
            ...(diagnostic?.rpc && /^finder_alert_[a-z_]+$/.test(diagnostic.rpc) ? { rpc: diagnostic.rpc } : {}),
            ...(diagnostic?.upstreamStatus && diagnostic.upstreamStatus >= 100 && diagnostic.upstreamStatus <= 599 ? { upstreamStatus: diagnostic.upstreamStatus } : {}) }));
        return reply(status, { code });
    }
}
