import { verifiedAccount, type AuthDependencies } from '../auth/account';
import { AUTH_HEADERS, readAuthBody, requireSameOrigin } from '../auth/config';
import { FinderHttpError } from '../property-finder/errors';
import { BillingError, deriveBillingState, emptyState, stripeId, stripeIdentifier, type BillingRecord,
    type StripeInvoice, type StripeSchedule, type StripeSubscription } from './model';
import { STRIPE_VERSION, billingConfiguration, billingRpc, stripeRequest, validatePrices, validatePortal, type BillingEnv } from './provider';
import { changeDowngrade, currentSubscription, releaseBasicSchedule } from './schedules';

interface Dependencies extends Partial<AuthDependencies> { transport?: typeof fetch }
interface StripeList<T> { data: T[]; has_more: boolean }
interface CheckoutSession { id: string; customer: string; status: string; expires_at: number; url: string | null; subscription: unknown; metadata: { finder_plan?: string } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const billingEvents = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
    'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
    'customer.subscription.pending_update_applied', 'customer.subscription.pending_update_expired',
    'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required', 'invoice.voided', 'invoice.marked_uncollectible',
    'subscription_schedule.created', 'subscription_schedule.updated', 'subscription_schedule.released',
    'subscription_schedule.canceled', 'subscription_schedule.completed', 'subscription_schedule.aborted']);
interface StripeEvent { id: string; object: string; api_version: string; type: string; created: number; livemode: boolean; account?: string; context?: string;
    data: { object: { object?: string; customer?: string | { id: string } } } }

async function signedEvent(request: Request, secret: string): Promise<StripeEvent> {
    const signature = request.headers.get('Stripe-Signature') || '';
    if (signature.length > 4096 || !request.headers.get('Content-Type')?.startsWith('application/json')) throw new BillingError('invalid_billing_signature', 400);
    const fields = signature.split(',').map(part => part.trim().split('='));
    const times = fields.filter(([key]) => key === 't').map(([, value]) => value);
    const signatures = fields.filter(([key, value]) => key === 'v1' && /^[0-9a-f]{64}$/.test(value || '')).map(([, value]) => value);
    if (times.length !== 1 || !/^\d{10}$/.test(times[0]) || Math.abs(Date.now() / 1000 - Number(times[0])) > 300
        || !signatures.length || signatures.length > 10 || Number(request.headers.get('Content-Length') || 0) > 262144) throw new BillingError('invalid_billing_signature', 400);
    const reader = request.body?.getReader(); if (!reader) throw new BillingError('invalid_billing_signature', 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
        if (size > 262144) { await reader.cancel(); throw new BillingError('billing_payload_too_large', 413); } chunks.push(part.value); }
    const raw = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
    const prefix = new TextEncoder().encode(times[0] + '.'); const payload = new Uint8Array(prefix.length + raw.length); payload.set(prefix); payload.set(raw, prefix.length);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const checks = await Promise.all(signatures.map(value => crypto.subtle.verify('HMAC', key,
        new Uint8Array(value.match(/../g)!.map(byte => parseInt(byte, 16))), payload)));
    if (!checks.some(Boolean)) throw new BillingError('invalid_billing_signature', 400);
    let event: StripeEvent;
    try { event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { throw new BillingError('invalid_billing_event', 400); }
    if (!event || event.object !== 'event' || !stripeIdentifier(event.id, 'evt') || typeof event.type !== 'string' || !Number.isSafeInteger(event.created)
        || event.created <= 0 || event.created > Date.now() / 1000 + 300 || typeof event.livemode !== 'boolean' || event.account
        || event.context || !event.data?.object || typeof event.data.object !== 'object' || Array.isArray(event.data.object)) throw new BillingError('invalid_billing_event', 400);
    if (event.api_version !== STRIPE_VERSION) throw new BillingError('unsupported_billing_event_version', 400);
    return event;
}
function validRecord(value: BillingRecord): BillingRecord {
    if (!value || !uuid.test(value.id) || !uuid.test(value.lease_token) || !value.state || typeof value.state !== 'object'
        || (value.customer_id !== null && !stripeIdentifier(value.customer_id, 'cus'))) throw new BillingError();
    return value;
}
async function lock(env: BillingEnv, transport: typeof fetch, user: string | null, customer: string | null, event: StripeEvent | null) {
    const value = await billingRpc<BillingRecord | { duplicate: true } | null>(env, 'finder_billing_lock', {
        p_user: user, p_customer: customer, p_livemode: billingConfiguration(env).livemode, p_event: event?.id || null,
    }, transport);
    if (value === null || ('duplicate' in value && value.duplicate)) return null;
    const row = validRecord(value as BillingRecord);
    if (row.livemode !== billingConfiguration(env).livemode) throw new BillingError('billing_mode_mismatch');
    return row;
}
async function reconcile(env: BillingEnv, row: BillingRecord, transport: typeof fetch, event: StripeEvent | null = null) {
    const config = billingConfiguration(env);
    let state = emptyState();
    if (row.customer_id) {
        const query = new URLSearchParams({ customer: row.customer_id, status: 'all', limit: '100', 'expand[]': 'data.latest_invoice' });
        const list = await stripeRequest<StripeList<StripeSubscription>>(env, '/subscriptions?' + query, transport);
        if (list.has_more !== false || !Array.isArray(list.data)) throw new BillingError('billing_subscription_review');
        const ongoing = list.data.filter(s => !['canceled', 'incomplete_expired'].includes(s.status));
        if (ongoing.length > 1) throw new BillingError('billing_subscription_review');
        const sub = ongoing[0] || list.data.find(s => s.id === row.state.subscriptionId) || list.data.sort((a, b) => b.created - a.created)[0] || null;
        let schedule: StripeSchedule | null = null;
        if (sub) {
            // Always read the currently attached schedule. An old release/cancel event
            // must not erase a replacement schedule, and event phases never grant access.
            const scheduleId = stripeId(sub.schedule);
            if (scheduleId) {
                if (!stripeIdentifier(scheduleId, 'sub_sched')) throw new BillingError('billing_schedule_review');
                schedule = await stripeRequest<StripeSchedule>(env, '/subscription_schedules/' + scheduleId, transport);
            }
            const reference = sub.latest_invoice;
            if (reference && (typeof reference === 'string' || (reference.amount_due > 0 && !reference.payments))) {
                const invoiceId = typeof reference === 'string' ? reference : reference.id;
                if (!stripeIdentifier(invoiceId, 'in')) throw new BillingError();
                sub.latest_invoice = await stripeRequest<StripeInvoice>(env, '/invoices/' + invoiceId + '?expand[]=payments', transport);
            }
            const invoice = sub.latest_invoice;
            if (invoice && typeof invoice !== 'string' && invoice.lines?.has_more) {
                invoice.lines = await stripeRequest<StripeInvoice['lines']>(env, '/invoices/' + invoice.id + '/lines?limit=100', transport);
            }
            if (invoice && typeof invoice !== 'string' && invoice.payments?.has_more) {
                invoice.payments = await stripeRequest<NonNullable<StripeInvoice['payments']>>(env, '/invoice_payments?' + new URLSearchParams({ invoice: invoice.id, limit: '100' }), transport);
            }
            if (invoice && typeof invoice !== 'string' && (invoice.lines?.has_more || invoice.payments?.has_more)) throw new BillingError('billing_subscription_review');
        }
        state = deriveBillingState(sub, row.state, schedule, config.prices, row.customer_id, config.livemode);
        if (['none', 'canceled', 'incomplete_expired'].includes(state.status)) {
            const sessions = await stripeRequest<StripeList<CheckoutSession>>(env, '/checkout/sessions?' + new URLSearchParams({ customer: row.customer_id, limit: '100' }), transport);
            if (sessions.has_more !== false || !Array.isArray(sessions.data)) throw new BillingError('billing_subscription_review');
            const expiry = Math.max(0, ...sessions.data.filter(s => s.customer === row.customer_id && s.status === 'open' && Number.isSafeInteger(s.expires_at)).map(s => s.expires_at));
            state.checkoutUntil = expiry > Date.now() / 1000 ? new Date(expiry * 1000).toISOString() : null;
        }
    }
    const applied = await billingRpc<{ applied: boolean }>(env, 'finder_billing_apply', {
        p_id: row.id, p_lease: row.lease_token, p_state: state, p_event: event?.id || null,
        p_event_type: event?.type || null, p_event_created: event ? new Date(event.created * 1000).toISOString() : null,
    }, transport);
    if (applied?.applied !== true) throw new BillingError();
    return state;
}
async function release(env: BillingEnv, row: BillingRecord, transport: typeof fetch) {
    await billingRpc(env, 'finder_billing_release', { p_id: row.id, p_lease: row.lease_token }, transport).catch(() => undefined);
}
function checkoutUrl(value: string | null) {
    try { const url = new URL(value || ''); if (url.origin !== 'https://checkout.stripe.com' || url.username || url.password) throw Error(); return url.href; }
    catch { throw new BillingError(); }
}
function portalUrl(value: string) {
    try { const url = new URL(value); if (url.origin !== 'https://billing.stripe.com' || url.username || url.password) throw Error(); return url.href; }
    catch { throw new BillingError(); }
}
export async function handleBillingRequest(request: Request, env: BillingEnv, dependencies: Dependencies = {}): Promise<Response> {
    const headers = new Headers(AUTH_HEADERS); const requestId = crypto.randomUUID(); headers.set('X-Request-ID', requestId);
    const reply = (status: number, body: object) => Response.json(body, { status, headers });
    const path = new URL(request.url).pathname.replace(/\/$/, '').split('/').pop(); const transport = dependencies.transport || fetch;
    let row: BillingRecord | null = null;
    // Stay well within the two-minute database lease, including ambiguous calls.
    const mutationDeadline = Date.now() + 90000;
    try {
        if (!['status', 'checkout', 'portal', 'upgrade', 'downgrade', 'cancel-downgrade', 'webhook'].includes(path || '')) return reply(404, { code: 'not_found' });
        if (request.method !== (path === 'status' ? 'GET' : 'POST')) return reply(405, { code: 'method_not_allowed' });
        if (path === 'webhook') {
            const config = billingConfiguration(env);
            const event = await signedEvent(request, env.STRIPE_WEBHOOK_SECRET!);
            if (event.livemode !== config.livemode) throw new BillingError('invalid_billing_event', 400);
            if (!billingEvents.has(event.type)) return reply(200, { received: true, ignored: true });
            const resource = event.type.startsWith('checkout.session.') ? 'checkout.session' : event.type.startsWith('customer.subscription.') ? 'subscription'
                : event.type.startsWith('subscription_schedule.') ? 'subscription_schedule' : 'invoice';
            if (event.data.object.object !== resource) throw new BillingError('invalid_billing_event', 400);
            // Snapshot bodies are routing hints only. Paid access is derived from
            // fresh, explicitly versioned API reads, never historical event data.
            const customer = stripeId(event.data.object.customer);
            if (!stripeIdentifier(customer, 'cus')) throw new BillingError('invalid_billing_event', 400);
            row = await lock(env, transport, null, customer, event);
            if (!row) return reply(200, { received: true }); // Unknown customer or already processed event.
            await validatePrices(env, transport);
            await reconcile(env, row, transport, event);
            return reply(200, { received: true });
        }
        requireSameOrigin(request, env, path !== 'status');
        const account = await verifiedAccount(request, env, dependencies);
        if (env.FINDER_BILLING_ENABLED !== 'enabled') {
            if (path === 'status') return reply(200, { enabled: false });
            throw new BillingError('billing_not_configured');
        }
        // Sandbox uses the same Auth and administrator role as the account page.
        // Never expose a checkout, customer mapping or provider state to customers.
        if (env.FINDER_STRIPE_MODE === 'test' && account.snapshot.role !== 'administrator') {
            if (path === 'status') return reply(200, { enabled: false });
            throw new BillingError('billing_sandbox_admin_only', 403);
        }
        const config = billingConfiguration(env);
        if (account.snapshot.role === 'administrator' && !config.sandbox) {
            if (path === 'status') return reply(200, { enabled: true, administrator: true });
            throw new BillingError('billing_admin_no_subscription', 403);
        }
        if (path === 'checkout' && !config.sandbox && (env.FINDER_CUSTOMER_ACCESS !== 'enabled' || !account.snapshot.paidAccessEnabled)) throw new BillingError('billing_not_launched', 409);
        let body: Record<string, unknown> = {};
        if (path !== 'status') body = await readAuthBody(request);
        if (Object.keys(body).some(k => path !== 'checkout' || k !== 'plan') || (path === 'checkout' && (typeof body.plan !== 'string' || !['basic', 'premium'].includes(body.plan)))) throw new BillingError('invalid_billing_request', 400);
        row = await lock(env, transport, account.identity.userId, null, null);
        if (!row || row.user_id !== account.identity.userId) throw new BillingError();
        await validatePrices(env, transport);
        let state = await reconcile(env, row, transport);
        row.state = state;
        if (path === 'status') return reply(200, { enabled: true, sandbox: config.sandbox, ...state });
        if (path === 'downgrade' || path === 'cancel-downgrade') {
            await changeDowngrade(env, row, state, transport, path === 'cancel-downgrade', mutationDeadline);
            state = await reconcile(env, row, transport);
            if (!state.active || state.entitledPlan !== 'premium'
                || (path === 'downgrade' ? state.scheduledPlan !== 'basic' || state.scheduledAt !== state.paidEnd : state.scheduledPlan !== null))
                throw new BillingError('billing_change_review', 409);
            return reply(200, { enabled: true, sandbox: config.sandbox, ...state });
        }
        if (path === 'portal' || path === 'upgrade') {
            if (!row.customer_id) throw new BillingError('billing_no_subscription', 409);
            const upgrade = path === 'upgrade';
            const form = new URLSearchParams({ customer: row.customer_id, configuration: env.STRIPE_PORTAL_CONFIGURATION_ID!, return_url: config.origin + '/account/' });
            if (!upgrade && state.currentPlan === 'basic' && ['active', 'past_due'].includes(state.status)) {
                const sub = await stripeRequest<StripeSubscription>(env, '/subscriptions/' + state.subscriptionId, transport);
                if (stripeId(sub.schedule)) {
                    await releaseBasicSchedule(env, row, sub, transport, mutationDeadline);
                    state = await reconcile(env, row, transport); row.state = state;
                }
            }
            if (upgrade) {
                if (state.currentPlan !== 'basic' || state.entitledPlan !== 'basic' || !state.active) throw new BillingError('billing_change_review', 409);
                let sub = await currentSubscription(env, row, state, transport);
                if (stripeId(sub.schedule)) {
                    await releaseBasicSchedule(env, row, sub, transport, mutationDeadline);
                    state = await reconcile(env, row, transport); row.state = state;
                    sub = await currentSubscription(env, row, state, transport);
                    if (stripeId(sub.schedule)) throw new BillingError('billing_schedule_review', 409);
                }
                form.set('configuration', env.STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID!);
                form.set('flow_data[type]', 'subscription_update_confirm');
                form.set('flow_data[subscription_update_confirm][subscription]', sub.id);
                form.set('flow_data[subscription_update_confirm][items][0][id]', sub.items.data[0].id);
                form.set('flow_data[subscription_update_confirm][items][0][price]', config.prices.premium);
                form.set('flow_data[subscription_update_confirm][items][0][quantity]', '1');
                form.set('flow_data[after_completion][type]', 'redirect');
                form.set('flow_data[after_completion][redirect][return_url]', config.origin + '/account/');
            }
            await validatePortal(env, transport, upgrade);
            const portal = await stripeRequest<{ url: string }>(env, '/billing_portal/sessions', transport,
                form);
            return reply(200, { url: portalUrl(portal.url) });
        }
        if (!['none', 'canceled', 'incomplete_expired'].includes(state.status)) throw new BillingError('billing_subscription_exists', 409);
        if (!row.customer_id) {
            const customer = await stripeRequest<{ id: string }>(env, '/customers', transport, new URLSearchParams({ email: account.user.email!,
                'metadata[finder_user_id]': account.identity.userId, 'metadata[finder_billing_id]': row.id,
                'metadata[finder_mode]': config.sandbox ? 'sandbox' : 'live' }), 'finder-customer/' + row.id);
            if (!stripeIdentifier(customer.id, 'cus')) throw new BillingError();
            await billingRpc(env, 'finder_billing_customer', { p_id: row.id, p_lease: row.lease_token, p_customer: customer.id }, transport);
            row.customer_id = customer.id;
        }
        const sessions = await stripeRequest<StripeList<CheckoutSession>>(env, '/checkout/sessions?' + new URLSearchParams({ customer: row.customer_id!, limit: '100' }), transport);
        if (sessions.has_more !== false || !Array.isArray(sessions.data)) throw new BillingError('billing_subscription_review');
        const open = sessions.data.filter(s => s.status === 'open' && s.expires_at > Date.now() / 1000);
        if (open.length > 1 || open.some(s => s.customer !== row!.customer_id || s.metadata?.finder_plan !== body.plan)) throw new BillingError('billing_checkout_exists', 409);
        if (open[0]) return reply(200, { url: checkoutUrl(open[0].url) });
        // Resolve a completed Checkout's subscription directly if it is not yet
        // represented by the list read. Session expiry is not completion time.
        const completed = sessions.data.find(s => s.status === 'complete' && s.subscription);
        if (completed) {
            const reference = stripeId(completed.subscription as string | { id: string });
            if (!stripeIdentifier(reference, 'sub')) throw new BillingError('billing_subscription_review');
            if (state.subscriptionId !== reference) {
                const current = await stripeRequest<StripeSubscription>(env, '/subscriptions/' + reference, transport);
                if (current.id !== reference || stripeId(current.customer) !== row.customer_id || current.livemode !== config.livemode) throw new BillingError('billing_subscription_review');
                if (!['canceled', 'incomplete_expired'].includes(current.status)) throw new BillingError('billing_subscription_exists', 409);
            }
        }
        const plan = body.plan as 'basic' | 'premium';
        // Block account deletion across an ambiguous create-session timeout, too.
        await billingRpc(env, 'finder_billing_customer', { p_id: row.id, p_lease: row.lease_token, p_customer: row.customer_id, p_checkout_pending: true }, transport);
        const lastSession = sessions.data[0];
        const attempt = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([lastSession?.id || null, lastSession?.status || null, config.prices[plan]]))));
        const attemptKey = [...attempt].map(value => value.toString(16).padStart(2, '0')).join('');
        const checkout = await stripeRequest<CheckoutSession>(env, '/checkout/sessions', transport, new URLSearchParams({
            mode: 'subscription', ui_mode: 'hosted_page', customer: row.customer_id!, client_reference_id: account.identity.userId,
            // Preserve the previous billing calculation mode instead of taking
            // the newer API's flexible-mode default implicitly.
            'subscription_data[billing_mode][type]': 'classic',
            'line_items[0][price]': config.prices[plan], 'line_items[0][quantity]': '1', 'payment_method_types[0]': 'card',
            'metadata[finder_plan]': plan, 'subscription_data[metadata][finder_user_id]': account.identity.userId,
            'subscription_data[metadata][finder_billing_id]': row.id,
            'metadata[finder_mode]': config.sandbox ? 'sandbox' : 'live',
            'subscription_data[metadata][finder_mode]': config.sandbox ? 'sandbox' : 'live',
            success_url: config.origin + '/account/?billing=success', cancel_url: config.origin + '/account/?billing=cancelled',
        }), 'finder-checkout/' + row.id + '/' + plan + '/' + attemptKey);
        if (checkout.customer !== row.customer_id || checkout.status !== 'open') throw new BillingError();
        return reply(200, { url: checkoutUrl(checkout.url) });
    } catch (error) {
        if (error instanceof BillingError) return reply(error.status, { code: error.code });
        if (error instanceof FinderHttpError) return reply(error.status, { code: error.code });
        // Never log Stripe/Supabase response bodies, emails, payloads or credentials.
        console.error(JSON.stringify({ event: 'billing_failure', requestId }));
        return reply(503, { code: 'billing_unavailable' });
    } finally { if (row) await release(env, row, transport); }
}
