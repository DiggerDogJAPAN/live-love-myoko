import { refreshSession } from '@/lib/auth/client';
export interface BillingStatus {
    enabled: boolean; administrator?: boolean; sandbox?: boolean; status?: string; currentPlan?: 'basic' | 'premium' | null;
    entitledPlan?: 'basic' | 'premium' | null; active?: boolean; paidEnd?: string | null;
    periodEnd?: string | null; cancelAtPeriodEnd?: boolean; scheduledPlan?: 'basic' | null; scheduledAt?: string | null;
}
export type BillingAction = 'checkout' | 'portal' | 'upgrade' | 'downgrade' | 'cancel-downgrade';
export async function billingRequest(path: 'status' | BillingAction, body?: object): Promise<Record<string, unknown>> {
    const run = async () => fetch('/api/billing/' + path, { method: path === 'status' ? 'GET' : 'POST', credentials: 'same-origin',
        cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', ...(path !== 'status' ? { 'Content-Type': 'application/json' } : {}) },
        ...(path !== 'status' ? { body: JSON.stringify(body || {}) } : {}) });
    let response = await run();
    // Only the read operation is retried. Never replay a possibly accepted payment request.
    if (response.status === 401 && path === 'status') { await refreshSession(); response = await run(); }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result)) throw Error(typeof result?.code === 'string' ? result.code : 'billing_unavailable');
    return result;
}
export function parseBillingStatus(data: Record<string, unknown>): BillingStatus {
    if (typeof data.enabled !== 'boolean') throw Error('billing_unavailable');
    if (!data.enabled) return { enabled: false };
    if (data.administrator === true) return { enabled: true, administrator: true };
    if ((data.sandbox !== undefined && typeof data.sandbox !== 'boolean') || typeof data.active !== 'boolean' || typeof data.cancelAtPeriodEnd !== 'boolean'
        || !['none','active','past_due','unpaid','canceled','incomplete','incomplete_expired','trialing','paused'].includes(String(data.status))
        || ![null,'basic','premium'].includes(data.currentPlan as string | null) || ![null,'basic','premium'].includes(data.entitledPlan as string | null)
        || ![null,'basic'].includes(data.scheduledPlan as string | null)
        || ['paidEnd','periodEnd','scheduledAt'].some(key => data[key] !== null && (typeof data[key] !== 'string' || !Number.isFinite(Date.parse(data[key] as string))))) throw Error('billing_unavailable');
    return { enabled: true, sandbox: data.sandbox === true, status: data.status as string, currentPlan: data.currentPlan as BillingStatus['currentPlan'], entitledPlan: data.entitledPlan as BillingStatus['entitledPlan'],
        active: data.active, paidEnd: data.paidEnd as string | null, periodEnd: data.periodEnd as string | null, cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        scheduledPlan: data.scheduledPlan as BillingStatus['scheduledPlan'], scheduledAt: data.scheduledAt as string | null };
}
export function billingMessage(error: unknown) {
    const code = error instanceof Error ? error.message : '';
    const messages: Record<string, string> = {
        billing_subscription_exists: 'You already have a subscription. Use Manage Billing to change it.',
        billing_checkout_exists: 'A checkout is already open for another plan. Complete it or let it expire before choosing again.',
        billing_busy: 'Your billing information is being updated. Please wait a moment and refresh.',
        billing_not_launched: 'Subscription purchasing is not available yet. No payment has been started.',
        billing_subscription_review: 'Your subscription needs review. Please refresh or contact us before starting another payment.',
        billing_change_review: 'Your subscription has changed or is not ready for this plan change. Refresh billing status or contact us.',
        billing_schedule_review: 'Your scheduled billing change needs review. Please refresh or contact us before changing it.',
        authentication_required: 'Please sign in again to manage billing.',
    };
    return messages[code] || 'Billing is temporarily unavailable. Please try again or contact us for help.';
}
export function billingRedirect(value: unknown, kind: 'checkout' | 'portal'): string {
    if (typeof value !== 'string') throw Error('billing_unavailable');
    const url = new URL(value);
    if (url.origin !== (kind === 'checkout' ? 'https://checkout.stripe.com' : 'https://billing.stripe.com') || url.username || url.password) throw Error('billing_unavailable');
    return url.href;
}
