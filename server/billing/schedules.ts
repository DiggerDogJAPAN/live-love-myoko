import { BillingError, stripeId, stripeIdentifier, type BillingRecord, type BillingState, type StripeSchedule, type StripeSubscription } from './model';
import { billingConfiguration, stripeRequest, type BillingEnv } from './provider';

// All identifiers, prices and dates come from the locked account and fresh Stripe
// reads, never from the browser. These operations cannot create a subscription.
export async function currentSubscription(env: BillingEnv, row: BillingRecord, state: BillingState, transport: typeof fetch) {
    if (!stripeIdentifier(state.subscriptionId, 'sub') || !row.customer_id) throw new BillingError('billing_no_subscription', 409);
    const sub = await stripeRequest<StripeSubscription>(env, '/subscriptions/' + state.subscriptionId, transport);
    const config = billingConfiguration(env), item = sub.items?.data?.[0];
    if (sub.id !== state.subscriptionId || stripeId(sub.customer) !== row.customer_id || sub.livemode !== config.livemode
        || sub.metadata?.finder_billing_id !== row.id || sub.status !== 'active' || sub.pause_collection || sub.pending_update
        || sub.cancel_at_period_end || sub.cancel_at || sub.collection_method !== 'charge_automatically'
        || sub.items?.has_more !== false || sub.items.data.length !== 1 || item.quantity !== 1
        || !state.active || item.price.id !== config.prices[state.currentPlan!]
        || new Date(item.current_period_end * 1000).toISOString() !== state.periodEnd
        || !Number.isSafeInteger(item.current_period_start) || item.current_period_start > Date.now() / 1000
        || !Number.isSafeInteger(item.current_period_end) || item.current_period_end < Date.now() / 1000 + 60)
        throw new BillingError('billing_change_review', 409);
    return sub;
}
const nonempty = (value: unknown): boolean => Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== false && value !== ''
    && (typeof value !== 'object' || Object.values(value).some(nonempty));
function plainPhase(phase: StripeSchedule['phases'][number], premium: string) {
    // This lightweight flow supports ordinary single-price memberships only.
    // Reject special discounts/taxes/trials rather than silently dropping them.
    const accepted = new Set(['start_date', 'end_date', 'items', 'metadata', 'collection_method', 'currency',
        'billing_cycle_anchor', 'proration_behavior', 'default_payment_method']);
    if (Object.entries(phase).some(([key, value]) => !accepted.has(key) && nonempty(value))
        || phase.items?.length !== 1 || stripeId(phase.items[0].price) !== premium || phase.items[0].quantity !== 1
        || Object.entries(phase.items[0]).some(([key, value]) => !['price', 'plan', 'quantity'].includes(key) && nonempty(value))
        || (phase.collection_method && phase.collection_method !== 'charge_automatically')
        || (phase.currency && phase.currency !== 'jpy')) throw new BillingError('billing_schedule_review', 409);
}
function checkSchedule(schedule: StripeSchedule, sub: StripeSubscription, row: BillingRecord) {
    if (!stripeIdentifier(schedule.id, 'sub_sched') || stripeId(schedule.customer) !== row.customer_id
        || stripeId(schedule.subscription) !== sub.id || schedule.livemode !== sub.livemode || schedule.status !== 'active'
        || !Array.isArray(schedule.phases)) throw new BillingError('billing_schedule_review', 409);
}
function ownedDowngrade(schedule: StripeSchedule, row: BillingRecord, boundary: number, basic: string, premium: string) {
    const phases = schedule.phases.filter(p => p.end_date > Date.now() / 1000);
    return schedule.metadata?.finder_billing_id === row.id && schedule.metadata.finder_change === 'premium_to_basic'
        && schedule.metadata.finder_effective_at === String(boundary) && schedule.end_behavior === 'release'
        && phases.length === 2 && phases[0].end_date === boundary && phases[1].start_date === boundary
        && phases[0].items.length === 1 && stripeId(phases[0].items[0].price) === premium && phases[0].items[0].quantity === 1
        && phases[1].items.length === 1 && stripeId(phases[1].items[0].price) === basic && phases[1].items[0].quantity === 1;
}
async function operationKey(parts: unknown[]) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)));
    return 'finder-downgrade/' + [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}
// After the Basic phase starts, release its harmless continuation before opening
// an upgrade flow. Stripe otherwise restricts updates to scheduled subscriptions.
export async function releaseBasicSchedule(env: BillingEnv, row: BillingRecord, sub: StripeSubscription, transport: typeof fetch, deadline: number) {
    const id = stripeId(sub.schedule);
    if (!stripeIdentifier(id, 'sub_sched')) throw new BillingError('billing_schedule_review', 409);
    const schedule = await stripeRequest<StripeSchedule>(env, '/subscription_schedules/' + id, transport);
    checkSchedule(schedule, sub, row);
    const config = billingConfiguration(env), now = Date.now() / 1000;
    const remaining = schedule.phases.filter(p => p.end_date > now);
    if (sub.id !== row.state.subscriptionId || stripeId(sub.customer) !== row.customer_id || sub.livemode !== config.livemode
        || sub.metadata?.finder_billing_id !== row.id || sub.items.data.length !== 1
        || sub.items.data[0].price.id !== config.prices.basic || sub.items.data[0].quantity !== 1
        || schedule.metadata?.finder_billing_id !== row.id || schedule.metadata.finder_change !== 'premium_to_basic'
        || schedule.end_behavior !== 'release' || remaining.length !== 1 || remaining[0].start_date > now
        || String(remaining[0].start_date) !== schedule.metadata.finder_effective_at
        || remaining[0].items.length !== 1 || stripeId(remaining[0].items[0].price) !== config.prices.basic
        || remaining[0].items[0].quantity !== 1 || Date.now() >= deadline) throw new BillingError('billing_schedule_review', 409);
    await stripeRequest(env, '/subscription_schedules/' + id + '/release', transport,
        new URLSearchParams({ preserve_cancel_date: 'true' }), 'finder-release/' + id);
}
export async function changeDowngrade(env: BillingEnv, row: BillingRecord, state: BillingState, transport: typeof fetch, cancel: boolean, deadline: number) {
    const config = billingConfiguration(env), sub = await currentSubscription(env, row, state, transport);
    const boundary = sub.items.data[0].current_period_end;
    if (state.currentPlan !== 'premium' || state.entitledPlan !== 'premium' || state.paidPlan !== 'premium'
        || state.paidEnd !== state.periodEnd) throw new BillingError('billing_change_review', 409);
    if ([sub.discounts, sub.default_tax_rates, sub.automatic_tax, sub.billing_thresholds].some(nonempty)
        || (typeof sub.trial_end === 'number' && sub.trial_end > Date.now() / 1000)) throw new BillingError('billing_schedule_review', 409);
    const writable = () => { if (Date.now() >= deadline || boundary < Date.now() / 1000 + 60) throw new BillingError('billing_busy', 409); };
    let schedule: StripeSchedule | null = null;
    const attached = stripeId(sub.schedule);
    if (attached) {
        if (!stripeIdentifier(attached, 'sub_sched')) throw new BillingError('billing_schedule_review', 409);
        schedule = await stripeRequest<StripeSchedule>(env, '/subscription_schedules/' + attached, transport);
        checkSchedule(schedule, sub, row);
        if (ownedDowngrade(schedule, row, boundary, config.prices.basic, config.prices.premium)) {
            if (cancel) {
                writable();
                // Release leaves the subscription running; /cancel would cancel it.
                await stripeRequest(env, '/subscription_schedules/' + schedule.id + '/release', transport,
                    new URLSearchParams({ preserve_cancel_date: 'true' }), 'finder-release/' + schedule.id);
            }
            return;
        }
        // Only recover the bare first half of our own idempotent creation below.
        if (cancel || nonempty(schedule.metadata)) throw new BillingError('billing_schedule_review', 409);
    } else if (cancel) return; // Repeated cancellation is harmless.

    const history = await stripeRequest<{ data: StripeSchedule[]; has_more: boolean }>(env,
        '/subscription_schedules?' + new URLSearchParams({ customer: row.customer_id!, limit: '100' }), transport);
    if (history.has_more !== false || !Array.isArray(history.data)) throw new BillingError('billing_schedule_review', 409);
    const terminal = history.data.filter(s => stripeId(s.released_subscription || s.subscription) === sub.id
        && ['released', 'canceled', 'completed', 'aborted'].includes(s.status))
        .map(s => s.id).sort();
    if (terminal.some(id => !stripeIdentifier(id, 'sub_sched'))) throw new BillingError('billing_schedule_review', 409);
    // The full terminal set also distinguishes rapid release/reschedule cycles
    // whose schedules were created in the same second, regardless of list order.
    const key = await operationKey([row.id, sub.id, boundary, terminal]);
    writable();
    const created = await stripeRequest<StripeSchedule>(env, '/subscription_schedules', transport,
        new URLSearchParams({ from_subscription: sub.id }), key);
    checkSchedule(created, sub, row);
    if (schedule && created.id !== schedule.id) throw new BillingError('billing_schedule_review', 409);
    schedule = created;
    const current = schedule.phases.find(p => p.start_date === schedule!.current_phase?.start_date && p.end_date === boundary);
    if (!current || schedule.phases.length !== 1 || schedule.current_phase?.end_date !== boundary
        || nonempty(schedule.metadata)) throw new BillingError('billing_schedule_review', 409);
    plainPhase(current, config.prices.premium);
    const body = new URLSearchParams({ end_behavior: 'release', proration_behavior: 'none',
        'metadata[finder_billing_id]': row.id, 'metadata[finder_change]': 'premium_to_basic', 'metadata[finder_effective_at]': String(boundary),
        'phases[0][start_date]': String(current.start_date), 'phases[0][end_date]': String(boundary),
        'phases[0][items][0][price]': config.prices.premium, 'phases[0][items][0][quantity]': '1', 'phases[0][proration_behavior]': 'none',
        'phases[1][start_date]': String(boundary), 'phases[1][duration][interval]': 'month', 'phases[1][duration][interval_count]': '1', 'phases[1][items][0][price]': config.prices.basic,
        'phases[1][items][0][quantity]': '1', 'phases[1][proration_behavior]': 'none', 'phases[1][billing_cycle_anchor]': 'phase_start' });
    const method = stripeId(current.default_payment_method as string | { id: string } | null);
    if (method) { if (!stripeIdentifier(method, 'pm')) throw new BillingError('billing_schedule_review', 409);
        body.set('phases[0][default_payment_method]', method); body.set('phases[1][default_payment_method]', method); }
    if (current.metadata && typeof current.metadata === 'object') for (const [key, value] of Object.entries(current.metadata)) {
        if (typeof value !== 'string' || !/^[A-Za-z0-9_]{1,40}$/.test(key)) throw new BillingError('billing_schedule_review', 409);
        body.set('phases[0][metadata][' + key + ']', value);
    }
    writable();
    const updated = await stripeRequest<StripeSchedule>(env, '/subscription_schedules/' + schedule.id, transport, body, 'finder-phases/' + schedule.id);
    checkSchedule(updated, sub, row);
    if (!ownedDowngrade(updated, row, boundary, config.prices.basic, config.prices.premium)) throw new BillingError('billing_schedule_review', 409);
}
