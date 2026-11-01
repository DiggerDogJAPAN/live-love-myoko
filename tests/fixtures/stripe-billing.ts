import { emptyState, type BillingState, type Plan, type StripeInvoice, type StripePrice, type StripeSchedule, type StripeSubscription } from '../../server/billing/model';
export const stripeNow = Math.floor(Date.now() / 1000);
export const stripePrices = { basic: 'price_BasicTest', premium: 'price_PremiumTest' };
export const stripeProducts = { basic: 'prod_BasicMembershipTest', premium: 'prod_PremiumMembershipTest' };
export const stripeCustomer = 'cus_TestCustomer';
export function stripePrice(plan: Plan): StripePrice {
    return { id: stripePrices[plan], product: stripeProducts[plan], active: true, currency: 'jpy', unit_amount: plan === 'basic' ? 2000 : 4000,
        tax_behavior: 'inclusive', livemode: false, recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
}
export function stripeInvoice(plan: Plan = 'premium', paid = true, start = stripeNow - 3600, end = stripeNow + 86400): StripeInvoice {
    const invoiceId = 'in_' + (plan === 'basic' ? 'BasicTest' : 'PremiumTest'), amount = plan === 'basic' ? 2000 : 4000;
    return { id: invoiceId, customer: stripeCustomer, status: paid ? 'paid' : 'open',
        currency: 'jpy', amount_due: amount, amount_paid: paid ? amount : 0, amount_remaining: paid ? 0 : amount, livemode: false,
        status_transitions: { paid_at: paid ? Math.min(start + 10, stripeNow) : null },
        payments: { has_more: false, data: paid ? [{ invoice: invoiceId, status: 'paid', amount_paid: amount, currency: 'jpy', livemode: false,
            payment: { type: 'payment_intent', payment_intent: 'pi_TestPayment' } }] : [] },
        parent: { subscription_details: { subscription: 'sub_TestSubscription' } },
        lines: { has_more: false, data: [{ amount: plan === 'basic' ? 2000 : 4000, quantity: 1, currency: 'jpy',
            pricing: { price_details: { price: stripePrices[plan] } },
            parent: { subscription_item_details: { subscription: 'sub_TestSubscription', subscription_item: 'si_TestItem' } }, period: { start, end } }] } };
}
export function stripeSubscription(plan: Plan = 'premium', paid = true): StripeSubscription {
    return { id: 'sub_TestSubscription', customer: stripeCustomer, status: 'active', livemode: false, created: stripeNow - 3600,
        collection_method: 'charge_automatically', cancel_at_period_end: false, pause_collection: null, pending_update: null,
        metadata: { finder_billing_id: '00000000-0000-4000-8000-000000000004' },
        items: { has_more: false, data: [{ id: 'si_TestItem', quantity: 1, price: stripePrice(plan), current_period_start: stripeNow - 3600, current_period_end: stripeNow + 86400 }] },
        latest_invoice: stripeInvoice(plan, paid), schedule: null };
}
export function stripeSchedule(id = 'sub_sched_DowngradeTest', at = stripeNow + 86400): StripeSchedule {
    return { id, customer: stripeCustomer, subscription: 'sub_TestSubscription', status: 'active', livemode: false,
        created: stripeNow - 100, current_phase: { start_date: stripeNow - 3600, end_date: at }, end_behavior: 'release',
        metadata: { finder_billing_id: '00000000-0000-4000-8000-000000000004', finder_change: 'premium_to_basic', finder_effective_at: String(at) },
        phases: [{ start_date: stripeNow - 3600, end_date: at, trial: false, invoice_settings: null,
            items: [{ price: stripePrices.premium, quantity: 1, discounts: [], metadata: {}, tax_rates: [] }] },
            { start_date: at, end_date: at + 2592000, trial: false, invoice_settings: null,
                items: [{ price: stripePrices.basic, quantity: 1, discounts: [], metadata: {}, tax_rates: [] }] }] };
}
export function paidState(plan: Plan = 'premium'): BillingState {
    return { ...emptyState(), subscriptionId: 'sub_TestSubscription', status: 'active', currentPlan: plan,
        periodStart: new Date((stripeNow - 3600) * 1000).toISOString(), periodEnd: new Date((stripeNow + 86400) * 1000).toISOString(),
        paidPlan: plan, paidStart: new Date((stripeNow - 3600) * 1000).toISOString(), paidEnd: new Date((stripeNow + 86400) * 1000).toISOString(),
        paidInvoiceId: plan === 'basic' ? 'in_BasicTest' : 'in_PremiumTest', entitledPlan: plan, active: true };
}
