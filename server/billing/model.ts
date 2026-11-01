/** Paid entitlements and future Portal phases are deliberately separate. */
export type Plan = 'basic' | 'premium';
export type StripeRef = string | { id: string } | null;
export interface StripePrice {
    id: string; product: StripeRef; active: boolean; currency: string; unit_amount: number;
    tax_behavior: string; livemode: boolean; recurring: { interval: string; interval_count: number; usage_type: string };
}
export interface StripeInvoice {
    id: string; customer: StripeRef; status: string;
    currency: string; amount_due: number; amount_paid: number; amount_remaining: number; livemode: boolean; amount_paid_off_stripe?: number;
    status_transitions: { paid_at: number | null };
    payments?: { has_more: boolean; data: { invoice: StripeRef; status: string; amount_paid: number | null; currency: string; livemode: boolean;
        payment: { type: string; payment_intent?: StripeRef; payment_record?: StripeRef; charge?: StripeRef } }[] };
    parent?: { subscription_details?: { subscription: StripeRef } }; subscription?: StripeRef;
    lines: { has_more: boolean; data: { amount: number; quantity: number | null; currency: string;
        pricing?: { price_details?: { price: StripeRef } }; price?: StripeRef;
        parent?: { subscription_item_details?: { subscription: StripeRef; subscription_item: string };
            invoice_item_details?: { subscription: StripeRef; proration: boolean } };
        subscription_item?: string; period: { start: number; end: number } }[] };
}
export interface StripeSubscription {
    id: string; customer: StripeRef; status: string; livemode: boolean; created: number;
    collection_method: string; cancel_at_period_end: boolean; pause_collection: unknown; pending_update: unknown;
    items: { has_more: boolean; data: { id: string; quantity: number; price: StripePrice; current_period_start: number; current_period_end: number }[] };
    latest_invoice: StripeInvoice | string | null; schedule: StripeRef;
    metadata?: Record<string, string>; cancel_at?: number | null;
    discounts?: unknown; default_tax_rates?: unknown; automatic_tax?: unknown; trial_end?: unknown; billing_thresholds?: unknown;
}
export interface StripeSchedule {
    id: string; customer: StripeRef; subscription: StripeRef; status: string; livemode: boolean;
    metadata?: Record<string, string>; created?: number; released_subscription?: StripeRef;
    current_phase?: { start_date: number; end_date: number } | null; end_behavior?: string;
    phases: { start_date: number; end_date: number; items: { price: StripeRef; quantity: number; [key: string]: unknown }[]; [key: string]: unknown }[];
}
export interface BillingState {
    subscriptionId: string | null; status: string; currentPlan: Plan | null;
    periodStart: string | null; periodEnd: string | null; cancelAtPeriodEnd: boolean;
    paidPlan: Plan | null; paidStart: string | null; paidEnd: string | null; paidInvoiceId: string | null;
    scheduleId: string | null; scheduledPlan: Plan | null; scheduledAt: string | null;
    entitledPlan: Plan | null; active: boolean;
    checkoutUntil: string | null;
}
export interface BillingRecord {
    id: string; user_id: string | null; customer_id: string | null; livemode: boolean;
    state: Partial<BillingState>; lease_token: string; synced_at: string | null;
}
export interface PlanPrices { basic: string; premium: string }
export class BillingError extends Error {
    constructor(readonly code = 'billing_unavailable', readonly status = 503) { super(code); }
}
export const stripeId = (value: StripeRef | undefined): string | null => typeof value === 'string' ? value : value?.id || null;
export const stripeIdentifier = (value: unknown, prefix: string): value is string => typeof value === 'string' && new RegExp('^' + prefix + '_[A-Za-z0-9]{1,200}$').test(value);
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value < 4102444800;
const iso = (value: number) => new Date(value * 1000).toISOString();
const seconds = (value?: string | null) => value ? Date.parse(value) / 1000 : 0;
export function planFor(price: string | null, prices: PlanPrices): Plan | null {
    return price === prices.basic ? 'basic' : price === prices.premium ? 'premium' : null;
}
export function emptyState(): BillingState {
    return { subscriptionId: null, status: 'none', currentPlan: null, periodStart: null, periodEnd: null, cancelAtPeriodEnd: false,
        paidPlan: null, paidStart: null, paidEnd: null, paidInvoiceId: null, scheduleId: null, scheduledPlan: null, scheduledAt: null, entitledPlan: null, active: false, checkoutUntil: null };
}
function paidProof(invoice: StripeInvoice | string | null, sub: StripeSubscription, price: string, itemId: string, periodEnd: number, now: number) {
    if (!invoice || typeof invoice === 'string' || invoice.status !== 'paid'
        || invoice.currency !== 'jpy' || invoice.amount_remaining !== 0 || invoice.livemode !== sub.livemode
        || !Number.isSafeInteger(invoice.amount_due) || invoice.amount_due < 0 || !Number.isSafeInteger(invoice.amount_paid) || invoice.amount_paid < invoice.amount_due
        || !timestamp(invoice.status_transitions?.paid_at) || invoice.status_transitions.paid_at > now + 300
        || stripeId(invoice.customer) !== stripeId(sub.customer)
        || stripeId(invoice.parent?.subscription_details?.subscription || invoice.subscription) !== sub.id
        || !stripeIdentifier(invoice.id, 'in') || invoice.lines?.has_more !== false || !Array.isArray(invoice.lines.data)) return null;
    // Paid InvoicePayments backed by PaymentIntents prove collection. Neither a
    // paid status, off-Stripe amount nor a PaymentRecord alone proves payment.
    // Stripe-confirmed zero-due credit settlements need no new charge.
    if (invoice.amount_due > 0) {
        if (invoice.payments?.has_more !== false || !Array.isArray(invoice.payments.data)) return null;
        const collected = invoice.payments.data.filter(p => p.status === 'paid' && stripeId(p.invoice) === invoice.id
            && p.currency === 'jpy' && p.livemode === invoice.livemode && p.payment?.type === 'payment_intent'
            && stripeIdentifier(stripeId(p.payment.payment_intent), 'pi') && Number.isSafeInteger(p.amount_paid) && (p.amount_paid || 0) > 0)
            .reduce((sum, p) => sum + (p.amount_paid || 0), 0);
        if (collected < invoice.amount_due) return null;
    }
    // A paid Basic invoice is never evidence for an unpaid Premium upgrade.
    const matching = invoice.lines.data.filter(line => {
        const item = line.parent?.subscription_item_details, proration = line.parent?.invoice_item_details;
        const ownProration = proration?.proration === true && stripeId(proration.subscription) === sub.id;
        return stripeId(line.pricing?.price_details?.price || line.price) === price && line.currency === 'jpy'
        && (line.quantity === 1 || (line.quantity === null && ownProration))
        && Number.isSafeInteger(line.amount) && line.amount >= 0
        && (((item?.subscription_item || line.subscription_item) === itemId && (!item || stripeId(item.subscription) === sub.id)) || ownProration)
        && timestamp(line.period?.start) && timestamp(line.period?.end) && line.period.start <= now && line.period.end > now
        && line.period.end <= periodEnd && line.period.end > line.period.start;
    });
    if (matching.length !== 1) return null;
    return { start: matching[0].period.start, end: matching[0].period.end, invoice: invoice.id };
}
export function deriveBillingState(sub: StripeSubscription | null, previous: Partial<BillingState>, schedule: StripeSchedule | null,
    prices: PlanPrices, customer: string, livemode: boolean, now = Math.floor(Date.now() / 1000)): BillingState {
    if (!sub) return emptyState();
    if (!stripeIdentifier(sub.id, 'sub') || stripeId(sub.customer) !== customer || sub.livemode !== livemode
        || !['active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'paused'].includes(sub.status)
        || sub.items?.has_more !== false || sub.items.data.length !== 1 || sub.collection_method !== 'charge_automatically'
        || typeof sub.cancel_at_period_end !== 'boolean') throw new BillingError('billing_subscription_review');
    const item = sub.items.data[0], currentPlan = planFor(item.price?.id, prices);
    if (!currentPlan || item.quantity !== 1 || !timestamp(item.current_period_start) || !timestamp(item.current_period_end)
        || item.current_period_end <= item.current_period_start) throw new BillingError('billing_subscription_review');
    const result: BillingState = { ...emptyState(), subscriptionId: sub.id, status: sub.status, currentPlan,
        periodStart: iso(item.current_period_start), periodEnd: iso(item.current_period_end), cancelAtPeriodEnd: sub.cancel_at_period_end };
    if (previous.subscriptionId === sub.id && previous.paidPlan && previous.paidStart && previous.paidEnd && previous.paidInvoiceId
        && seconds(previous.paidEnd) > now && seconds(previous.paidStart) <= now) {
        Object.assign(result, { paidPlan: previous.paidPlan, paidStart: previous.paidStart,
            paidEnd: iso(Math.min(seconds(previous.paidEnd), item.current_period_end)), paidInvoiceId: previous.paidInvoiceId });
    }
    const proof = paidProof(sub.latest_invoice, sub, item.price.id, item.id, item.current_period_end, now);
    if (proof) Object.assign(result, { paidPlan: currentPlan, paidStart: iso(proof.start), paidEnd: iso(proof.end), paidInvoiceId: proof.invoice });
    if (stripeId(sub.schedule)) {
        if (!schedule || schedule.id !== stripeId(sub.schedule) || stripeId(schedule.customer) !== customer || schedule.livemode !== livemode
            || stripeId(schedule.subscription) !== sub.id) throw new BillingError('billing_schedule_review');
        if (['active', 'not_started'].includes(schedule.status)) {
            if (!Array.isArray(schedule.phases)) throw new BillingError('billing_schedule_review');
            const future = schedule.phases.filter(p => timestamp(p.start_date) && p.start_date > now).sort((a, b) => a.start_date - b.start_date)[0];
            if (future) {
                if (future.items?.length !== 1 || future.items[0].quantity !== 1) throw new BillingError('billing_schedule_review');
                const next = planFor(stripeId(future.items[0].price), prices);
                if (!next) throw new BillingError('billing_schedule_review');
                // Future phases describe intent, never a currently paid entitlement.
                if (currentPlan === 'premium' && next === 'basic') {
                    if (future.start_date < item.current_period_end) throw new BillingError('billing_schedule_review');
                    Object.assign(result, { scheduleId: schedule.id, scheduledPlan: next, scheduledAt: iso(future.start_date) });
                }
            }
        }
    }
    const allowed = ['active', 'past_due'].includes(sub.status) && !sub.pause_collection && item.current_period_start <= now && item.current_period_end > now;
    result.active = allowed && !!result.paidPlan && seconds(result.paidStart) <= now && seconds(result.paidEnd) > now;
    // If Stripe's current phase has changed to Basic, old Premium payment cannot prolong Premium.
    result.entitledPlan = result.active ? currentPlan === 'basic' ? 'basic' : result.paidPlan : null;
    return result;
}
