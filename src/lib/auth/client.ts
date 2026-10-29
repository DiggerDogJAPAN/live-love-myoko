import type { AccountDetails } from './types';
export async function authRequest(path: string, body?: object): Promise<Record<string, unknown>> {
    const response = await fetch('/api/auth/' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.code === 'string' ? result.code : 'authentication_unavailable');
    return result;
}
let refreshFlight: Promise<Record<string, unknown>> | null = null;
export function refreshSession() {
    if (!refreshFlight) refreshFlight = authRequest('refresh', {}).finally(() => { refreshFlight = null; });
    return refreshFlight;
}
export async function fetchAccount(): Promise<AccountDetails> {
    let data;
    try { data = await authRequest('session'); }
    catch (error) { if (!(error instanceof Error) || error.message !== 'authentication_required') throw error; await refreshSession(); data = await authRequest('session'); }
    if (!data.user || !['customer', 'administrator'].includes(String(data.role)) || !data.membership || typeof data.sessionExpiresAt !== 'number' || !Number.isFinite(data.sessionExpiresAt)) throw new Error('authentication_unavailable');
    return data as unknown as AccountDetails;
}
export function announceSignout() {
    window.dispatchEvent(new Event('llm-signout'));
    if ('BroadcastChannel' in window) { const channel = new BroadcastChannel('llm-auth'); channel.postMessage('signed-out'); channel.close(); }
}
export function authMessage(code: string): string {
    const messages: Record<string, string> = {
        authentication_not_configured: 'Account sign-in is being prepared. Please try again later.',
        authentication_failed: 'The account service could not complete this request. Please try again later or contact us for help.',
        authentication_unavailable: 'The account service is temporarily unavailable. Please try again later or contact us for help.',
        same_origin_required: 'Please open https://love-live-myoko.com and try again.',
        email_confirmation_not_configured: 'Registration is being prepared. Please try again later.',
        invalid_credentials: 'Check your email and password, and make sure your email address has been verified.',
        invalid_email: 'Enter a valid email address.', invalid_password: 'Use a password between 12 and 128 characters.',
        invalid_verification_code: 'Enter the verification code from your email.', too_many_attempts: 'Too many attempts. Please wait before trying again.',
        link_expired: 'This link has expired or was opened in a different browser. Please request a new link.',
        password_recovery_required: 'Open a fresh password reset link before setting a new password.',
        authentication_required: 'Please sign in to continue.', account_unavailable: 'Your account is unavailable. Please contact us for help.',
        email_verification_required: 'Please verify your email before continuing.',
        google_not_configured: 'Google sign-in is not available yet. Please use your email address.',
        logout_revocation_unavailable: 'This browser has been signed out, but server sign-out could not be confirmed. Please contact us if needed.',
        password_updated_signout_incomplete: 'Your password was updated, but server sign-out could not be confirmed. Sign in with your new password.',
    };
    return messages[code] || 'We could not complete this request. Please try again.';
}
