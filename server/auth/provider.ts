import { FinderHttpError } from '../property-finder/access';
import { authConfiguration, type AuthEnv } from './config';
export type AuthFetch = typeof fetch;
export type ProviderSession = { access_token: string; refresh_token: string; expires_in: number };
export type ProviderUser = { id: string; email?: string; email_confirmed_at?: string; user_metadata?: Record<string, unknown> };
export class ProviderError extends FinderHttpError {
    constructor(public readonly providerStatus: number) { super(providerStatus === 429 ? 429 : providerStatus >= 500 ? 503 : 400, providerStatus === 429 ? 'too_many_attempts' : 'authentication_failed'); }
}
export async function providerRequest(env: AuthEnv, path: string, body?: object, access?: string, method?: string, transport: AuthFetch = fetch): Promise<Record<string, unknown>> {
    const config = authConfiguration(env);
    const response = await transport(config.provider + path, { method: method || (body ? 'POST' : 'GET'),
        headers: { apikey: config.publishableKey, ...(access ? { Authorization: 'Bearer ' + access } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new ProviderError(response.status);
    if (response.status === 204) return {};
    const value = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FinderHttpError(503, 'authentication_unavailable');
    return value;
}
export function providerSession(value: Record<string, unknown>): ProviderSession {
    if (typeof value.access_token !== 'string' || value.access_token.length > 3800 || typeof value.refresh_token !== 'string'
        || !value.refresh_token || value.refresh_token.length > 3800 || typeof value.expires_in !== 'number'
        || !Number.isFinite(value.expires_in) || value.expires_in <= 0) throw new FinderHttpError(503, 'authentication_unavailable');
    return { access_token: value.access_token, refresh_token: value.refresh_token, expires_in: Math.min(Math.floor(value.expires_in), 86400) };
}
