import { authRequest, refreshSession } from './client';

const SUPABASE_ORIGIN = 'https://fgdoqsepihlzfqlqymet.supabase.co';
const safeErrors = new Set(['saved_access_denied', 'saved_rate_limited', 'saved_limit_reached', 'saved_listing_unavailable',
    'customer_access_disabled', 'invalid_saved_request', 'invalid_listing_id', 'account_unavailable', 'active_membership_required', 'authentication_required', 'directory_unavailable', 'alerts_access_denied', 'invalid_alert_preferences', 'alerts_unavailable',
    'invalid_privacy_request', 'privacy_admin_required', 'privacy_deletion_request_active', 'privacy_rate_limited', 'privacy_request_not_found',
    'privacy_request_changed', 'privacy_case_minimised', 'privacy_invalid_transition', 'privacy_reason_required', 'privacy_review_required',
    'privacy_use_deletion_procedure', 'privacy_confirmation_required', 'privacy_admin_account_protected', 'privacy_legal_hold',
    'privacy_billing_unresolved', 'privacy_delivery_unresolved', 'privacy_external_records_review', 'privacy_other_requests_active']);

/** Reuse the cookie session for each operation; never persist/cache a bearer or
 * refresh token in browser storage. All listing data travels directly over HTTPS
 * to narrow Supabase RPCs, which derive ownership and permission from the JWT. */
export type SupabaseRpcName = 'finder_saved_ids' | 'finder_saved_page' | 'finder_save_property' | 'finder_remove_saved_property' | 'finder_properties' | 'finder_alert_preferences' | 'finder_set_alert_preferences'
    | 'finder_privacy_requests' | 'finder_privacy_submit' | 'finder_privacy_admin_requests' | 'finder_privacy_admin_update' | 'finder_privacy_admin_export' | 'finder_privacy_admin_delete_account';
export async function supabaseRpc(name: SupabaseRpcName, body: object = {}, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const run = async () => {
        const access = await authRequest('supabase-access', {});
        if (access.supabaseOrigin !== SUPABASE_ORIGIN || typeof access.publishableKey !== 'string'
            || !/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(access.publishableKey)
            || typeof access.accessToken !== 'string' || access.accessToken.length > 16384 || !access.accessToken) {
            throw new Error('supabase_unavailable');
        }
        const response = await fetch(SUPABASE_ORIGIN + '/rest/v1/rpc/' + name, {
            method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal,
            headers: { Accept: 'application/json', 'Content-Type': 'application/json',
                'Content-Profile': 'public', 'Accept-Profile': 'public', apikey: access.publishableKey, Authorization: 'Bearer ' + access.accessToken },
            body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => null);
        if (response.status === 401) throw new Error('authentication_required');
        if (!response.ok) throw new Error(safeErrors.has(data?.message) ? data.message : response.status === 403 ? 'active_membership_required' : 'supabase_unavailable');
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('supabase_unavailable');
        return data;
    };
    // Refresh only an expired credential, never retry ambiguous failed writes.
    try { return await run(); }
    catch (error) {
        if (!(error instanceof Error) || error.message !== 'authentication_required') throw new Error(error instanceof Error && safeErrors.has(error.message) ? error.message : 'supabase_unavailable');
        await refreshSession(); return run();
    }
}
