export const requestTypes = ['access', 'correction', 'deletion', 'information'] as const;
export const requestStatuses = ['pending', 'in_progress', 'completed', 'rejected'] as const;
export type RequestType = typeof requestTypes[number];
export type RequestStatus = typeof requestStatuses[number];
export interface PrivacyRequest {
    id: string; type: RequestType; scope: 'account' | 'personal_data' | null; details: string;
    status: RequestStatus; submittedAt: string; updatedAt: string; completedAt: string | null; response: string;
}
export interface AdminPrivacyRequest extends PrivacyRequest {
    userId: string | null; adminNotes: string; identityVerifiedAt: string | null;
    retentionReviewedAt: string | null; legalHold: boolean; accountDeletedAt: string | null;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
function parseRequest(value: unknown): PrivacyRequest {
    const r = value as PrivacyRequest;
    if (!r || !uuid.test(r.id) || !requestTypes.includes(r.type) || !requestStatuses.includes(r.status)
        || !date(r.submittedAt) || !date(r.updatedAt) || (r.completedAt !== null && !date(r.completedAt))
        || typeof r.details !== 'string' || r.details.length > 2000 || typeof r.response !== 'string' || r.response.length > 2000
        || (r.type === 'deletion' ? !['account', 'personal_data'].includes(r.scope || '') : r.scope !== null)) throw Error('privacy_unavailable');
    return { id: r.id, type: r.type, scope: r.scope, details: r.details, status: r.status,
        submittedAt: r.submittedAt, updatedAt: r.updatedAt, completedAt: r.completedAt, response: r.response };
}
export function parseRequests(data: Record<string, unknown>): PrivacyRequest[] {
    if (!Array.isArray(data.requests) || data.requests.length > 100) throw Error('privacy_unavailable');
    return data.requests.map(parseRequest);
}
export function parseAdminRequests(data: Record<string, unknown>): AdminPrivacyRequest[] {
    if (!Array.isArray(data.requests) || data.requests.length > 50) throw Error('privacy_unavailable');
    return data.requests.map(row => {
        const r = row as Record<string, unknown>;
        const item = parseRequest({ id: r.id, type: r.request_type, scope: r.deletion_scope, details: r.details,
            status: r.status, submittedAt: r.submitted_at, updatedAt: r.updated_at, completedAt: r.completed_at, response: r.response });
        if ((r.user_id !== null && (typeof r.user_id !== 'string' || !uuid.test(r.user_id))) || typeof r.admin_notes !== 'string'
            || r.admin_notes.length > 4000 || typeof r.legal_hold !== 'boolean'
            || [r.identity_verified_at, r.retention_reviewed_at, r.account_deleted_at].some(v => v !== null && !date(v))) throw Error('privacy_unavailable');
        return { ...item, userId: r.user_id as string | null, adminNotes: r.admin_notes,
            legalHold: r.legal_hold, identityVerifiedAt: r.identity_verified_at as string | null,
            retentionReviewedAt: r.retention_reviewed_at as string | null, accountDeletedAt: r.account_deleted_at as string | null };
    });
}
export function requestLabel(r: Pick<PrivacyRequest, 'type' | 'scope'>) {
    return r.type === 'deletion' ? r.scope === 'account' ? 'Account deletion' : 'Personal information deletion'
        : r.type === 'access' ? 'Access to personal information' : r.type === 'correction' ? 'Correction' : 'Information about data use';
}
export function privacyMessage(error: unknown): string {
    const code = error instanceof Error ? error.message : '';
    const messages: Record<string, string> = {
        privacy_deletion_request_active: 'You already have an active deletion request. Check its status below, or contact us to clarify its scope.',
        privacy_rate_limited: 'You have reached the online request limit. Please contact us by email if you need help with another request.',
        privacy_admin_required: 'Administrator access is required.', privacy_request_changed: 'This request changed. Refresh it before making further changes.',
        privacy_reason_required: 'Enter a customer-visible reason for rejecting this request.',
        privacy_review_required: 'Verify identity and record the required review before continuing. Reviews for export or account deletion must be within seven days.',
        privacy_legal_hold: 'This account has a retention hold. Resolve it before account deletion.',
        privacy_billing_unresolved: 'Billing or membership access needs review before deletion. Do not assume account deletion cancels a subscription.',
        privacy_delivery_unresolved: 'An email delivery is pending or uncertain. Resolve it before account deletion.',
        privacy_admin_account_protected: 'Administrator accounts are protected from this deletion procedure.',
        privacy_external_records_review: 'Storage or external identity records require separate review before deletion.',
        privacy_other_requests_active: 'Resolve the account’s other open privacy requests before deleting it. Do not close an unfulfilled request just to bypass this check.',
        privacy_use_deletion_procedure: 'Use the confirmed account deletion procedure to complete this request.',
        privacy_case_minimised: 'This case has been minimised following account deletion and cannot be edited.',
    };
    return messages[code] || 'Privacy requests are temporarily unavailable or being configured. Please try again or contact info@love-live-myoko.com.';
}
