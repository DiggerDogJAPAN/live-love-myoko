import { FinderHttpError } from '../property-finder/access';
import { authConfiguration, type AuthEnv } from './config';
export type AuthFetch = typeof fetch;
export type ProviderSession = { access_token: string; refresh_token: string; expires_in: number };
export type ProviderUser = { id: string; email?: string; email_confirmed_at?: string; user_metadata?: Record<string, unknown> };
const providerCodes = new Set(['unexpected_failure', 'validation_failed', 'bad_json', 'signup_disabled', 'email_provider_disabled',
    'email_address_invalid', 'email_address_not_authorized', 'email_exists', 'user_already_exists', 'weak_password',
    'over_email_send_rate_limit', 'over_request_rate_limit', 'captcha_failed', 'hook_timeout', 'hook_timeout_after_retry',
    'hook_payload_over_size_limit', 'hook_payload_invalid_content_type', 'email_not_confirmed', 'invalid_credentials',
    'bad_code_verifier', 'flow_state_not_found', 'flow_state_expired', 'refresh_token_not_found', 'refresh_token_already_used']);
export type ProviderFailure = 'http' | 'timeout' | 'network' | 'invalid_response' | 'redirect';
export class ProviderError extends FinderHttpError {
    constructor(public readonly providerStatus: number, public readonly providerCode?: string,
        public readonly providerRequestId?: string, public readonly failure: ProviderFailure = 'http') {
        super(failure !== 'http' ? 503 : providerStatus === 429 ? 429 : providerStatus >= 500 ? 503 : 400,
            providerStatus === 429 ? 'too_many_attempts' : failure !== 'http' ? 'authentication_unavailable' : 'authentication_failed');
    }
}
export async function providerRequest(env: AuthEnv, path: string, body?: object, access?: string, method?: string, transport: AuthFetch = fetch): Promise<Record<string, unknown>> {
    const config = authConfiguration(env);
    let response: Response;
    try { response = await transport(config.provider + path, { method: method || (body ? 'POST' : 'GET'),
        headers: { apikey: config.publishableKey, ...(access ? { Authorization: 'Bearer ' + access } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        // Workers supports only manual/follow. Reject redirects explicitly:
        // credentials must never be forwarded to a provider-chosen destination.
        ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000) }); }
    catch (error) { throw new ProviderError(503, undefined, undefined,
        error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name) ? 'timeout' : 'network'); }
    if (response.status >= 300 && response.status < 400) throw new ProviderError(response.status, undefined, undefined, 'redirect');
    if (!response.ok) {
        // Never retain provider messages/bodies: they may reflect an email,
        // password or SMTP diagnostic. Only documented enum codes are allowed.
        let code = response.headers.get('x-sb-error-code');
        if (!code || !providerCodes.has(code)) {
            try { const value = await response.json(); code = value?.code ?? value?.error_code; } catch { code = null; }
        }
        const requestId = response.headers.get('sb-request-id') || response.headers.get('x-request-id');
        throw new ProviderError(response.status, typeof code === 'string' && providerCodes.has(code) ? code : undefined,
            requestId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId) ? requestId : undefined);
    }
    if (response.status === 204) return {};
    let value: unknown;
    try { value = await response.json(); } catch { throw new ProviderError(503, undefined, undefined, 'invalid_response'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProviderError(503, undefined, undefined, 'invalid_response');
    return value as Record<string, unknown>;
}
export function providerSession(value: Record<string, unknown>): ProviderSession {
    if (typeof value.access_token !== 'string' || value.access_token.length > 3800 || typeof value.refresh_token !== 'string'
        || !value.refresh_token || value.refresh_token.length > 3800 || typeof value.expires_in !== 'number'
        || !Number.isFinite(value.expires_in) || value.expires_in <= 0) throw new FinderHttpError(503, 'authentication_unavailable');
    return { access_token: value.access_token, refresh_token: value.refresh_token, expires_in: Math.min(Math.floor(value.expires_in), 86400) };
}
