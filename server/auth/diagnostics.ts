import { FinderHttpError } from '../property-finder/access';
import { ProviderError } from './provider';

const safeCodes = new Set(['authentication_not_configured', 'same_origin_required', 'invalid_email', 'invalid_password',
    'invalid_request', 'json_required', 'request_too_large', 'email_confirmation_not_configured', 'authentication_required',
    'account_unavailable', 'email_verification_required', 'invalid_credentials', 'invalid_verification_code',
    'password_recovery_required', 'link_expired', 'google_not_configured', 'authentication_failed',
    'authentication_unavailable', 'too_many_attempts']);

/** Only locally generated context and allowlisted classifications. No request,
 * response body, exception message/stack, URL, headers or account information. */
export function reportAuthFailure(requestId: string, action: string, stage: string, error: unknown): void {
    console.warn(JSON.stringify({ event: 'finder_auth_failure', requestId, action, stage,
        code: error instanceof FinderHttpError && safeCodes.has(error.code) ? error.code : 'authentication_unavailable',
        ...(error instanceof ProviderError ? { providerStatus: error.providerStatus, providerCode: error.providerCode,
            providerRequestId: error.providerRequestId, failure: error.failure }
            : { failure: error instanceof FinderHttpError ? 'request_rejected' : 'runtime' }),
    }));
}
