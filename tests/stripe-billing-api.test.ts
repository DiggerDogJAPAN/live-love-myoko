import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { billingEvents, handleBillingRequest } from '../server/billing/api';
import type { BillingEnv } from '../server/billing/provider';
import { BillingError, emptyState, type BillingRecord, type StripeSchedule } from '../server/billing/model';
import type { AccountSnapshot } from '../server/auth/account-rpc';
import type { AuthDependencies } from '../server/auth/account';
import { paidState, stripeCustomer, stripeInvoice, stripeNow, stripePrice, stripePrices, stripeProducts, stripeSchedule, stripeSubscription } from './fixtures/stripe-billing';
const origin = 'http://127.0.0.1:8788', uid = '00000000-0000-4000-8000-000000000001', sid = '00000000-0000-4000-8000-000000000002';
const env: BillingEnv = { FINDER_AUTH_SITE_ORIGIN: origin, FINDER_AUTH_ENABLED: 'enabled', FINDER_SUPABASE_PROJECT_REF: 'fgdoqsepihlzfqlqymet',
    FINDER_CUSTOMER_ACCESS: 'enabled', FINDER_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_BillingUnitTest', FINDER_AUTH_COOKIE_SECRET: 'unit-test-cookie-secret-only-never-use-in-production-0123456789',
    FINDER_BILLING_ENABLED: 'enabled', FINDER_BILLING_SANDBOX_ENABLED: 'enabled', FINDER_STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_UnitTestOnly0123456789', STRIPE_WEBHOOK_SECRET: 'whsec_UnitTestOnly0123456789',
    STRIPE_BASIC_PRICE_ID: stripePrices.basic, STRIPE_PREMIUM_PRICE_ID: stripePrices.premium,
    STRIPE_BASIC_PRODUCT_ID: stripeProducts.basic, STRIPE_PREMIUM_PRODUCT_ID: stripeProducts.premium,
    STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_UnitTestOnly', STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID: 'bpc_UpgradeUnitTestOnly', FINDER_BILLING_SUPABASE_SECRET_KEY: 'sb_secret_BillingUnitTestOnly' };
const snapshot: AccountSnapshot = { schemaVersion: 2, userId: uid, sessionId: sid, sessionActive: true, sessionValidUntil: null, accountActive: true,
    role: 'customer', subscriptionActive: false, tier: null, status: 'inactive', paymentStatus: 'unpaid', accessStartsAt: null, paidThrough: null, revokedAt: null,
    finderAccess: false, savedPropertiesAccess: false, paidAccessEnabled: true, membershipActive: false };
function harness(runtimeEnv: BillingEnv = env) {
    const row: BillingRecord = { id: '00000000-0000-4000-8000-000000000004', user_id: uid, customer_id: stripeCustomer, livemode: false,
        state: paidState(), lease_token: '00000000-0000-4000-8000-000000000005', synced_at: new Date().toISOString() };
    const h = { row, sub: stripeSubscription() as ReturnType<typeof stripeSubscription> | null, schedule: stripeSchedule(), unknownCustomer: false,
        failApply: false, badPrice: false, badPortal: false, administrator: true, unauthenticated: false, unspecifiedTax: false, badCheckoutTotal: false,
        scheduleCount: 0, timeoutCreate: false, timeoutUpdate: false, failUpdate: false, historyMore: false, truncatedEvidence: false,
        terminalSchedules: [] as StripeSchedule[], creations: new Map<string, StripeSchedule>(),
        sessions: [] as { id: string; customer: string; status: string; expires_at: number; url: string; subscription: unknown; metadata: { finder_plan: string };
            currency: string; amount_subtotal: number; amount_total: number; automatic_tax: { enabled: boolean };
            total_details: { amount_tax: number; amount_discount: number; amount_shipping: number | null } }[],
        processed: new Set<string>(), calls: [] as { path: string; body: Record<string, unknown>; headers: Headers; form: URLSearchParams }[] };
    const dependencies: Partial<AuthDependencies> = {
        verify: async () => { if (h.unauthenticated) throw new BillingError('authentication_required', 401); return { kind: 'customer', userId: uid, sessionId: sid, tokenExpiresAt: Date.now() + 3600000 }; },
        snapshot: async () => h.administrator ? { ...snapshot, role: 'administrator', finderAccess: true, savedPropertiesAccess: true } : snapshot,
        transport: async (input, init) => {
            const url = new URL(String(input)); const body = init?.body && url.hostname.endsWith('supabase.co') ? JSON.parse(String(init.body)) : {};
            const call = { path: url.pathname, body, headers: new Headers(init?.headers), form: new URLSearchParams(String(init?.body || '')) }; h.calls.push(call);
            assert.equal(init?.redirect, 'manual'); assert.equal(init?.cache, 'no-store');
            if (url.pathname.endsWith('/auth/v1/user')) return Response.json({ id: uid, email: 'synthetic@example.invalid', email_confirmed_at: new Date().toISOString() });
            if (url.hostname.endsWith('supabase.co')) {
                assert.equal(call.headers.get('apikey'), env.FINDER_BILLING_SUPABASE_SECRET_KEY);
                if (url.pathname.endsWith('/finder_billing_lock')) {
                    assert(body.p_user === uid || body.p_customer === stripeCustomer);
                    return Response.json(h.unknownCustomer ? null : body.p_event && h.processed.has(body.p_event) ? { duplicate: true } : h.row);
                }
                if (url.pathname.endsWith('/finder_billing_customer')) { row.customer_id = body.p_customer; return Response.json(true); }
                if (url.pathname.endsWith('/finder_billing_apply')) {
                    if (h.failApply) return Response.json({ message: 'billing_lease_expired' }, { status: 400 });
                    row.state = body.p_state; if (body.p_event) h.processed.add(body.p_event); return Response.json({ applied: true });
                }
                if (url.pathname.endsWith('/finder_billing_release')) return Response.json(true);
                throw Error('Unexpected database operation');
            }
            assert.equal(url.origin, 'https://api.stripe.com'); assert.equal(call.headers.get('Authorization'), 'Bearer ' + runtimeEnv.STRIPE_SECRET_KEY);
            assert.equal(call.headers.get('Stripe-Version'), '2026-07-29.dahlia');
            if (url.pathname.startsWith('/v1/prices/')) { const price = stripePrice(url.pathname.endsWith(stripePrices.basic) ? 'basic' : 'premium'); price.livemode = runtimeEnv.FINDER_STRIPE_MODE === 'live'; if (h.badPrice) price.unit_amount = 1; if (h.unspecifiedTax) price.tax_behavior = 'unspecified'; return Response.json(price); }
            if (url.pathname === '/v1/subscriptions') return Response.json({ data: h.sub ? [structuredClone(h.sub)] : [], has_more: false });
            if (url.pathname === '/v1/subscriptions/sub_TestSubscription') return Response.json(h.sub);
            if (url.pathname === '/v1/subscription_schedules' && !init?.body) return Response.json({ data: h.terminalSchedules, has_more: h.historyMore });
            if (url.pathname === '/v1/subscription_schedules') {
                const key = call.headers.get('Idempotency-Key')!;
                if (h.creations.has(key)) return Response.json(h.creations.get(key));
                if (h.sub!.schedule) return Response.json({ error: 'already_attached' }, { status: 400 });
                assert.equal(call.form.get('from_subscription'), h.sub!.id); assert.equal([...call.form.keys()].length, 1);
                const created = stripeSchedule('sub_sched_Created' + ++h.scheduleCount);
                created.metadata = {}; created.phases = [created.phases[0]];
                h.schedule = created; h.sub!.schedule = created.id; h.creations.set(key, structuredClone(created));
                if (h.timeoutCreate) { h.timeoutCreate = false; throw Error('ambiguous_provider_timeout'); }
                return Response.json(created);
            }
            if (url.pathname.endsWith('/release')) {
                assert.equal(call.form.get('preserve_cancel_date'), 'true');
                const released = { ...h.schedule, status: 'released', subscription: null, released_subscription: h.sub!.id };
                h.terminalSchedules.unshift(released); h.sub!.schedule = null; return Response.json(released);
            }
            if (url.pathname.startsWith('/v1/subscription_schedules/') && init?.body) {
                assert(![...call.form.keys()].some(key => key.includes('[iterations]')));
                assert.equal(call.form.get('phases[1][duration][interval]'), 'month');
                assert.equal(call.form.get('phases[1][duration][interval_count]'), '1');
                if (h.failUpdate) return Response.json({ error: 'unavailable' }, { status: 503 });
                const boundary = Number(call.form.get('phases[1][start_date]'));
                h.schedule = stripeSchedule(h.schedule.id, boundary);
                h.schedule.metadata = Object.fromEntries([...call.form].filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v]));
                if (h.timeoutUpdate) { h.timeoutUpdate = false; throw Error('ambiguous_provider_timeout'); }
                return Response.json(h.schedule);
            }
            if (url.pathname.startsWith('/v1/subscription_schedules/')) return Response.json(h.schedule);
            if (url.pathname.endsWith('/lines')) return Response.json({ ...stripeInvoice().lines, has_more: h.truncatedEvidence });
            if (url.pathname === '/v1/invoice_payments') {
                assert.equal(url.searchParams.get('invoice'), 'in_PremiumTest');
                return Response.json({ ...stripeInvoice().payments, has_more: h.truncatedEvidence });
            }
            if (url.pathname.startsWith('/v1/invoices/')) return Response.json(stripeInvoice(h.sub?.items.data[0].price.id === stripePrices.basic ? 'basic' : 'premium'));
            if (url.pathname === '/v1/customers') return Response.json({ id: stripeCustomer });
            if (url.pathname === '/v1/checkout/sessions' && !init?.body) return Response.json({ data: h.sessions, has_more: false });
            if (url.pathname === '/v1/checkout/sessions') {
                const amount = call.form.get('metadata[finder_plan]') === 'basic' ? 2000 : 4000;
                const session = { id: 'cs_test_CheckoutTest', customer: stripeCustomer, status: 'open', expires_at: stripeNow + 86400,
                    currency: 'jpy', amount_subtotal: amount, amount_total: h.badCheckoutTotal ? amount + 200 : amount,
                    automatic_tax: { enabled: false }, total_details: { amount_tax: 0, amount_discount: 0, amount_shipping: 0 },
                    url: 'https://checkout.stripe.com/c/pay/cs_test_CheckoutTest', subscription: null, metadata: { finder_plan: call.form.get('metadata[finder_plan]')! } };
                h.sessions.push(session); return Response.json(session);
            }
            if (url.pathname.startsWith('/v1/billing_portal/configurations/')) {
                const upgrade = url.pathname.endsWith(env.STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID!);
                return Response.json({ id: upgrade ? env.STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID : env.STRIPE_PORTAL_CONFIGURATION_ID, active: true, livemode: runtimeEnv.FINDER_STRIPE_MODE === 'live',
                    features: { subscription_update: { enabled: upgrade || h.badPortal, default_allowed_updates: ['price'], proration_behavior: h.badPortal ? 'none' : 'always_invoice',
                        products: url.searchParams.getAll('expand[]').includes('features.subscription_update.products') ? [{ product: stripeProducts.premium, prices: [stripePrices.premium] }] : undefined,
                        schedule_at_period_end: { conditions: upgrade ? [{ type: 'decreasing_item_amount' }] : [] } },
                    subscription_cancel: { enabled: true, mode: 'at_period_end' }, payment_method_update: { enabled: true }, invoice_history: { enabled: true } } });
            }
            if (url.pathname === '/v1/billing_portal/sessions') return Response.json({ url: 'https://billing.stripe.com/p/session/test_session' });
            throw Error('Unexpected Stripe operation: ' + url.pathname);
        },
    };
    return { h, dependencies };
}
function request(path: string, body?: object, headers: Record<string, string> = {}) {
    return new Request(origin + '/api/billing/' + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, Cookie: '__Host-llm-access=unit-test-bearer', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
function event(type: string, name: string, patch: object = {}) {
    const object = type.startsWith('checkout.session.') ? 'checkout.session' : type.startsWith('subscription_schedule.') ? 'subscription_schedule' : type.startsWith('invoice.') ? 'invoice' : 'subscription';
    return { id: 'evt_' + name.replace(/[^A-Za-z0-9]/g, ''), object: 'event', api_version: '2026-07-29.dahlia', created: stripeNow, type, livemode: false,
        data: { object: { object, customer: stripeCustomer, id: type.startsWith('subscription_schedule') ? 'sub_sched_OldEvent' : 'sub_TestSubscription' } }, ...patch };
}
function webhook(value: object, timestamp = stripeNow, secret = env.STRIPE_WEBHOOK_SECRET!) {
    const raw = JSON.stringify(value), signature = createHmac('sha256', secret).update(timestamp + '.' + raw).digest('hex');
    return new Request(origin + '/api/billing/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw });
}
test('Schedule/subscription webhooks preserve Premium, clear canceled intent and follow replacement schedules instead of old payloads', async () => {
    const { h, dependencies } = harness(); h.sub!.schedule = h.schedule.id;
    for (const type of ['subscription_schedule.created', 'subscription_schedule.updated', 'customer.subscription.updated']) {
        const result = await handleBillingRequest(webhook(event(type, 'Scheduled' + type.replaceAll('.', ''))), env, dependencies);
        assert.equal(result.status, 200); assert.equal(h.row.state.entitledPlan, 'premium'); assert.equal(h.row.state.scheduledPlan, 'basic');
    }
    h.schedule = stripeSchedule('sub_sched_Replacement', stripeNow + 172800); h.sub!.schedule = h.schedule.id;
    assert.equal((await handleBillingRequest(webhook(event('subscription_schedule.released', 'OldReleased')), env, dependencies)).status, 200);
    assert.equal(h.row.state.scheduleId, 'sub_sched_Replacement'); assert.equal(h.row.state.entitledPlan, 'premium');
    assert(!h.calls.some(c => c.path.endsWith('/sub_sched_OldEvent')));
    h.sub!.schedule = null;
    for (const type of ['subscription_schedule.released', 'subscription_schedule.canceled']) {
        assert.equal((await handleBillingRequest(webhook(event(type, 'Cleared' + type.replaceAll('.', ''))), env, dependencies)).status, 200);
        assert.equal(h.row.state.scheduledPlan, null); assert.equal(h.row.state.entitledPlan, 'premium');
    }
    h.sub!.status = 'canceled';
    assert.equal((await handleBillingRequest(webhook(event('customer.subscription.deleted', 'Deleted')), env, dependencies)).status, 200);
    assert.equal(h.row.state.active, false);
});
test('Only paid Premium evidence upgrades Basic; duplicates are idempotent and delayed events reconcile canonical current state', async () => {
    const { h, dependencies } = harness(); h.row.state = paidState('basic'); h.sub = stripeSubscription('premium', false);
    assert.equal((await handleBillingRequest(webhook(event('customer.subscription.updated', 'UnpaidUpgrade')), env, dependencies)).status, 200);
    assert.equal(h.row.state.entitledPlan, 'basic');
    assert.equal((await handleBillingRequest(webhook(event('invoice.payment_failed', 'FailedUpgrade')), env, dependencies)).status, 200);
    assert.equal(h.row.state.entitledPlan, 'basic');
    h.sub.latest_invoice = stripeInvoice('premium'); const paid = event('invoice.paid', 'PaidUpgrade');
    assert.equal((await handleBillingRequest(webhook(paid), env, dependencies)).status, 200); assert.equal(h.row.state.entitledPlan, 'premium');
    const reads = h.calls.filter(c => c.path.startsWith('/v1/')).length;
    assert.equal((await handleBillingRequest(webhook(paid), env, dependencies)).status, 200);
    assert.equal(h.calls.filter(c => c.path.startsWith('/v1/')).length, reads);
    h.sub.latest_invoice = 'in_PremiumTest';
    assert.equal((await handleBillingRequest(webhook(event('invoice.paid', 'ExpandedDahliaPayment')), env, dependencies)).status, 200);
    assert(h.calls.some(c => c.path === '/v1/invoices/in_PremiumTest')); assert.equal(h.row.state.entitledPlan, 'premium');
    h.sub = stripeSubscription('basic');
    assert.equal((await handleBillingRequest(webhook(event('invoice.paid', 'OlderPaidEvent', { created: stripeNow - 86400 })), env, dependencies)).status, 200);
    assert.equal(h.row.state.entitledPlan, 'basic');
    h.failApply = true;
    assert.equal((await handleBillingRequest(webhook(event('customer.subscription.updated', 'ExpiredFence')), env, dependencies)).status, 503);
    assert(!h.processed.has('evt_ExpiredFence'));
});
test('Dahlia invoice line/payment list responses resolve partial expansions and fail closed if still truncated', async () => {
    for (const truncated of [false, true]) {
        const { h, dependencies } = harness(); h.row.state = paidState('basic'); h.truncatedEvidence = truncated;
        const invoice = stripeInvoice(); invoice.lines.has_more = true; invoice.payments!.has_more = true; h.sub!.latest_invoice = invoice;
        const result = await handleBillingRequest(webhook(event('invoice.paid', truncated ? 'TruncatedDahliaEvidence' : 'CompleteDahliaEvidence')), env, dependencies);
        assert.equal(result.status, truncated ? 503 : 200);
        assert.equal(h.row.state.entitledPlan, truncated ? 'basic' : 'premium');
        assert(h.calls.some(c => c.path === '/v1/invoices/in_PremiumTest/lines'));
        assert(h.calls.some(c => c.path === '/v1/invoice_payments'));
    }
});
test('Webhooks require raw-body signatures, mode and timestamp checks; unknown customers and event types never create memberships', async () => {
    const { h, dependencies } = harness();
    for (const req of [webhook(event('invoice.paid', 'Forged'), stripeNow, 'wrong-secret'), webhook(event('invoice.paid', 'Old'), stripeNow - 301),
        webhook(event('invoice.paid', 'WrongMode', { livemode: true })), webhook(event('invoice.paid', 'ConnectedAccount', { account: 'acct_Unknown' }))]) {
        assert.equal((await handleBillingRequest(req, env, dependencies)).status, 400);
    }
    assert.equal(h.calls.length, 0);
    assert.equal((await handleBillingRequest(webhook(event('unrelated.event', 'Unrelated')), env, dependencies)).status, 200);
    h.unknownCustomer = true;
    assert.equal((await handleBillingRequest(webhook(event('invoice.paid', 'UnknownCustomer')), env, dependencies)).status, 200);
    assert(!h.calls.some(c => c.path.includes('finder_billing_apply')));
    const raw = JSON.stringify(event('invoice.paid', 'Changed'));
    const valid = webhook(JSON.parse(raw));
    const tampered = new Request(valid, { body: raw + ' ' });
    assert.equal((await handleBillingRequest(tampered, env, dependencies)).status, 400);
});
test('Only the pinned Dahlia snapshot envelope is accepted; thin events, Connect/organisation contexts and wrong resource shapes fail before reconciliation', async () => {
    const { h, dependencies } = harness();
    for (const patch of [{ api_version: '2025-06-30.basil' }, { api_version: '2026-08-26.dahlia' }, { api_version: null },
        { api_version: undefined }, { object: 'v2.core.event' }, { context: 'acct_AnotherAccount' },
        { data: { object: [] } }, { data: { object: { object: 'payment_intent', customer: stripeCustomer } } },
        { data: undefined, related_object: { id: 'in_SyntheticInvoice', type: 'invoice', url: '/v1/invoices/in_SyntheticInvoice' } }]) {
        const result = await handleBillingRequest(webhook(event('invoice.paid', 'UnsupportedSnapshot', patch)), env, dependencies);
        assert.equal(result.status, 400);
    }
    assert.equal(h.calls.length, 0);
});
test('Every supported Dahlia snapshot event routes by customer only and ignores stale payment, schedule and entitlement fields', async () => {
    for (const type of billingEvents) {
        const { h, dependencies } = harness(); h.sub = stripeSubscription('premium', false); h.row.state = paidState('basic');
        // These are synthetic snapshots shaped from the official Dahlia contract,
        // deliberately claiming paid Premium and a future Basic phase. Current
        // REST reads must take precedence over both snapshot and previous fields.
        const resource = type.startsWith('invoice.') ? stripeInvoice('premium') : type.startsWith('subscription_schedule.') ? stripeSchedule() :
            type.startsWith('checkout.session.') ? { id: 'cs_test_Snapshot', status: 'complete', payment_status: 'paid', customer: stripeCustomer,
                subscription: 'sub_TestSubscription', ui_mode: 'hosted_page', metadata: { finder_plan: 'premium' } } : stripeSubscription('premium');
        const snapshot = event(type, 'DahliaSnapshot' + type.replaceAll('.', ''));
        const payload = { ...snapshot, context: null, pending_webhooks: 1, request: { id: null, idempotency_key: null },
            data: { object: { ...resource, object: snapshot.data.object.object, customer: { id: stripeCustomer, object: 'customer' } },
                previous_attributes: { status: 'canceled', schedule: 'sub_sched_StaleSnapshot' } } };
        assert.equal((await handleBillingRequest(webhook(payload), env, dependencies)).status, 200, type);
        assert.equal(h.row.state.entitledPlan, 'basic', type); assert.equal(h.row.state.scheduledPlan, null, type);
        assert(h.calls.some(c => c.path === '/v1/subscriptions'), type);
        assert(!h.calls.some(c => c.path.includes('StaleSnapshot')), type);
    }
});
test('Checkout uses only authenticated owner/configured monthly prices and reuses an open session instead of double charging', async () => {
    const { h, dependencies } = harness(); h.row.customer_id = null; h.row.state = emptyState(); h.sub = null;
    const first = await handleBillingRequest(request('checkout', { plan: 'premium' }), env, dependencies);
    assert.equal(first.status, 200); assert.equal((await first.json()).url, h.sessions[0].url);
    const create = h.calls.find(c => c.path === '/v1/checkout/sessions' && c.form.get('mode'))!;
    assert.equal(create.form.get('line_items[0][price]'), stripePrices.premium); assert.equal(create.form.get('client_reference_id'), uid);
    assert.equal(create.form.get('success_url'), origin + '/account/?billing=success'); assert(create.headers.has('Idempotency-Key'));
    assert.equal(create.form.get('ui_mode'), 'hosted_page');
    assert.equal(create.form.get('automatic_tax[enabled]'), 'false');
    assert.equal(create.form.get('adaptive_pricing[enabled]'), 'false');
    assert.equal(create.form.get('allow_promotion_codes'), 'false');
    assert.equal(create.form.get('subscription_data[billing_mode][type]'), 'classic');
    assert.equal((await handleBillingRequest(request('checkout', { plan: 'premium' }), env, dependencies)).status, 200);
    assert.equal(h.calls.filter(c => c.form.get('mode') === 'subscription').length, 1);
    assert.equal((await handleBillingRequest(request('checkout', { plan: 'basic' }), env, dependencies)).status, 409);
    assert.equal((await handleBillingRequest(request('checkout', { plan: 'premium', customer: 'cus_Other' }), env, dependencies)).status, 400);
    assert.equal((await handleBillingRequest(request('checkout', { plan: 'premium' }), { ...env, FINDER_CUSTOMER_ACCESS: 'disabled' }, dependencies)).status, 200, 'administrators can test while customer purchasing stays disabled');
    h.sessions[0].status = 'complete'; h.sessions[0].subscription = 'sub_TestSubscription';
    h.sub = stripeSubscription(); h.sub.status = 'canceled';
    assert.equal((await handleBillingRequest(request('checkout', { plan: 'basic' }), env, dependencies)).status, 200,
        'a confirmed terminal subscription does not block rejoining until its old Checkout expires');
});
test('Management Portal is bound to the authenticated customer and forbids plan changes', async () => {
    const { h, dependencies } = harness();
    assert.equal((await handleBillingRequest(request('portal', {}), env, dependencies)).status, 200);
    const create = h.calls.find(c => c.path === '/v1/billing_portal/sessions')!;
    assert.equal(create.form.get('customer'), stripeCustomer); assert.equal(create.form.get('configuration'), env.STRIPE_PORTAL_CONFIGURATION_ID);
    h.badPortal = true; assert.equal((await handleBillingRequest(request('portal', {}), env, dependencies)).status, 503);
    h.badPrice = true; assert.equal((await handleBillingRequest(request('checkout', { plan: 'premium' }), env, dependencies)).status, 503);
});
test('Unspecified-tax Basic/Premium Checkout totals stay fixed and altered new or reused totals cannot redirect', async () => {
    for (const plan of ['basic', 'premium'] as const) {
        const { h, dependencies } = harness(); h.sub = null; h.row.state = emptyState(); h.unspecifiedTax = true;
        const response = await handleBillingRequest(request('checkout', { plan }), env, dependencies);
        assert.equal(response.status, 200);
        assert.equal(h.sessions[0].amount_total, plan === 'basic' ? 2000 : 4000);
        h.sessions[0].total_details.amount_shipping = null;
        assert.equal((await handleBillingRequest(request('checkout', { plan }), env, dependencies)).status, 200);
        for (const scenario of ['total', 'subtotal', 'currency', 'tax', 'discount', 'shipping', 'automaticTax']) {
            const session = structuredClone(h.sessions[0]);
            if (scenario === 'total') session.amount_total += 200;
            if (scenario === 'subtotal') session.amount_subtotal -= 200;
            if (scenario === 'currency') session.currency = 'usd';
            if (scenario === 'tax') session.total_details.amount_tax = 200;
            if (scenario === 'discount') session.total_details.amount_discount = 200;
            if (scenario === 'shipping') session.total_details.amount_shipping = 200;
            if (scenario === 'automaticTax') session.automatic_tax.enabled = true;
            const original = h.sessions[0]; h.sessions[0] = session;
            const denied = await handleBillingRequest(request('checkout', { plan }), env, dependencies);
            assert.equal(denied.status, 409, scenario);
            assert.deepEqual(await denied.json(), { code: 'billing_checkout_review' });
            h.sessions[0] = original;
        }
        assert.equal(h.calls.filter(c => c.form.get('mode') === 'subscription').length, 1);
        const bad = harness(); bad.h.sub = null; bad.h.row.state = emptyState(); bad.h.badCheckoutTotal = true;
        const denied = await handleBillingRequest(request('checkout', { plan }), env, bad.dependencies);
        assert.equal(denied.status, 409);
        assert.deepEqual(await denied.json(), { code: 'billing_checkout_review' });
    }
});
test('Upgrade confirmation targets only the authenticated Basic item and approved Premium price without granting access', async () => {
    const { h, dependencies } = harness(); h.sub = stripeSubscription('basic'); h.row.state = paidState('basic');
    const result = await handleBillingRequest(request('upgrade', {}), env, dependencies);
    assert.equal(result.status, 200); assert.equal(h.row.state.entitledPlan, 'basic');
    const create = h.calls.find(c => c.path === '/v1/billing_portal/sessions')!;
    assert.equal(create.form.get('configuration'), env.STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID);
    assert.equal(create.form.get('flow_data[type]'), 'subscription_update_confirm');
    assert.equal(create.form.get('flow_data[subscription_update_confirm][subscription]'), h.sub.id);
    assert.equal(create.form.get('flow_data[subscription_update_confirm][items][0][id]'), 'si_TestItem');
    assert.equal(create.form.get('flow_data[subscription_update_confirm][items][0][price]'), stripePrices.premium);
    assert.equal(create.form.get('flow_data[subscription_update_confirm][items][0][quantity]'), '1');
    assert(![...create.form.values()].includes(stripePrices.basic));
    assert.equal((await handleBillingRequest(request('upgrade', { price: stripePrices.basic }), env, dependencies)).status, 400);
    h.sub = stripeSubscription();
    assert.equal((await handleBillingRequest(request('upgrade', {}), env, dependencies)).status, 409);
});
test('Downgrade creates two phases on the existing subscription at its paid boundary, repeats safely, releases and reschedules', async () => {
    const { h, dependencies } = harness();
    const result = await handleBillingRequest(request('downgrade', {}), env, dependencies);
    assert.equal(result.status, 200); assert.equal(h.sub!.items.data[0].price.id, stripePrices.premium);
    assert.equal(h.row.state.entitledPlan, 'premium'); assert.equal(h.row.state.scheduledPlan, 'basic');
    assert.equal(h.row.state.scheduledAt, h.row.state.paidEnd);
    const update = h.calls.find(c => c.path.startsWith('/v1/subscription_schedules/') && c.form.has('phases[1][start_date]'))!;
    assert.equal(update.form.get('phases[0][items][0][price]'), stripePrices.premium);
    assert.equal(update.form.get('phases[1][items][0][price]'), stripePrices.basic);
    assert.equal(update.form.get('phases[0][end_date]'), String(h.sub!.items.data[0].current_period_end));
    assert.equal(update.form.get('phases[1][start_date]'), update.form.get('phases[0][end_date]'));
    assert.equal(update.form.get('proration_behavior'), 'none'); assert.equal(update.form.get('end_behavior'), 'release');
    assert.equal(update.form.get('phases[1][duration][interval]'), 'month');
    assert.equal(update.form.get('phases[1][duration][interval_count]'), '1');
    assert(![...update.form.keys()].some(key => key.includes('[iterations]'))); assert(update.headers.has('Idempotency-Key'));
    assert.equal((await handleBillingRequest(request('downgrade', {}), env, dependencies)).status, 200); assert.equal(h.scheduleCount, 1);
    assert.equal((await handleBillingRequest(request('cancel-downgrade', {}), env, dependencies)).status, 200);
    assert.equal(h.sub!.schedule, null); assert.equal(h.row.state.scheduledPlan, null); assert.equal(h.row.state.entitledPlan, 'premium');
    assert.equal((await handleBillingRequest(request('cancel-downgrade', {}), env, dependencies)).status, 200);
    assert.equal(h.calls.filter(c => c.path.endsWith('/release')).length, 1); assert(!h.calls.some(c => c.path.endsWith('/cancel')));
    assert.equal((await handleBillingRequest(request('downgrade', {}), env, dependencies)).status, 200);
    assert.equal(h.scheduleCount, 2); assert.equal(h.sub!.schedule, 'sub_sched_Created2');
    assert.equal((await handleBillingRequest(webhook(event('subscription_schedule.released', 'StaleReleasedDuringReplacement')), env, dependencies)).status, 200);
    assert.equal(h.row.state.scheduleId, 'sub_sched_Created2');
    for (let i = 0; i < 3; i++) {
        assert.equal((await handleBillingRequest(request('cancel-downgrade', {}), env, dependencies)).status, 200);
        h.terminalSchedules.reverse(); // Equal created timestamps must not reuse an older attempt.
        assert.equal((await handleBillingRequest(request('downgrade', {}), env, dependencies)).status, 200);
        assert.equal(h.scheduleCount, i + 3);
    }
});
test('Ambiguous schedule create/update calls recover idempotently; incomplete changes retain Premium', async () => {
    for (const timeout of ['timeoutCreate', 'timeoutUpdate'] as const) {
        const { h, dependencies } = harness(); h[timeout] = true;
        assert.equal((await handleBillingRequest(request('downgrade', {}), env, dependencies)).status, 503);
        assert.equal(h.row.state.entitledPlan, 'premium');
        assert.equal((await handleBillingRequest(request('downgrade', {}), env, dependencies)).status, 200);
        assert.equal(h.scheduleCount, 1); assert.equal(h.row.state.scheduledPlan, 'basic');
    }
    const { h, dependencies } = harness(); h.failUpdate = true;
    assert.equal((await handleBillingRequest(request('downgrade', {}), env, dependencies)).status, 503);
    assert.equal(h.row.state.entitledPlan, 'premium'); assert.equal(h.row.state.scheduledPlan, null);
    h.failUpdate = false; assert.equal((await handleBillingRequest(request('downgrade', {}), env, dependencies)).status, 200);
    assert.equal(h.scheduleCount, 1);
});
test('Downgrade actions reject unpaid, cancelling, expired, foreign and unrelated schedules without modifying them', async () => {
    for (const scenario of ['basic', 'unpaid', 'cancelling', 'pendingPayment', 'wrongOwner', 'boundary', 'otherSchedule', 'otherBareSchedule', 'otherCustomer', 'historyMore', 'expiredLease', 'discount', 'tax']) {
        const { h, dependencies } = harness();
        if (scenario === 'basic') { h.sub = stripeSubscription('basic'); h.row.state = paidState('basic'); }
        if (scenario === 'unpaid') { h.sub = stripeSubscription('premium', false); h.row.state = emptyState(); }
        if (scenario === 'cancelling') h.sub!.cancel_at_period_end = true;
        if (scenario === 'pendingPayment') h.sub!.pending_update = { expires_at: stripeNow + 3600 };
        if (scenario === 'wrongOwner') h.sub!.metadata = { finder_billing_id: 'OTHER_ACCOUNT' };
        if (scenario === 'boundary') h.sub!.items.data[0].current_period_end = stripeNow + 10;
        if (scenario === 'otherSchedule') { h.sub!.schedule = h.schedule.id; h.schedule.metadata = { owned_by: 'another_application' }; }
        if (scenario === 'otherBareSchedule') { h.sub!.schedule = h.schedule.id; h.schedule.metadata = {}; h.schedule.phases = [h.schedule.phases[0]]; }
        if (scenario === 'otherCustomer') h.sub!.customer = 'cus_AnotherCustomer';
        if (scenario === 'historyMore') h.historyMore = true;
        if (scenario === 'expiredLease') h.failApply = true;
        if (scenario === 'discount') h.sub!.discounts = ['di_UnexpectedDiscount'];
        if (scenario === 'tax') h.sub!.automatic_tax = { enabled: true };
        assert.notEqual((await handleBillingRequest(request('downgrade', {}), env, dependencies)).status, 200, scenario);
        assert.equal(h.scheduleCount, 0, scenario); assert(!h.calls.some(c => c.path.endsWith('/release')));
        assert(!h.calls.some(c => c.form.has('phases[1][start_date]')));
    }
});
test('Effective downgrade becomes Basic and its continuation releases before a new upgrade or billing-management session', async () => {
    for (const action of ['upgrade', 'portal']) {
        const { h, dependencies } = harness(); const start = stripeNow - 300, end = stripeNow + 86400;
        h.sub = stripeSubscription('basic'); h.sub.items.data[0].current_period_start = start;
        h.sub.latest_invoice = stripeInvoice('basic', true, start, end);
        h.schedule = stripeSchedule('sub_sched_Effective', start); h.sub.schedule = h.schedule.id;
        h.schedule.current_phase = { start_date: start, end_date: h.schedule.phases[1].end_date };
        assert.equal((await handleBillingRequest(request(action, {}), env, dependencies)).status, 200);
        assert.equal(h.row.state.entitledPlan, 'basic'); assert.equal(h.sub.schedule, null);
        assert(h.calls.some(c => c.path.endsWith('/release')));
    }
});
test('Sandbox plan-change operations enforce authentication, origin, administrator-only access and server-only targets', async () => {
    for (const action of ['upgrade', 'downgrade', 'cancel-downgrade']) {
        const { h, dependencies } = harness();
        assert.equal((await handleBillingRequest(request(action, { user_id: uid }), env, dependencies)).status, 400);
        assert.equal((await handleBillingRequest(request(action, {}, { Origin: 'https://evil.invalid' }), env, dependencies)).status, 403);
        h.unauthenticated = true;
        assert.equal((await handleBillingRequest(request(action, {}), env, dependencies)).status, 401);
        h.unauthenticated = false; h.administrator = false;
        assert.equal((await handleBillingRequest(request(action, {}), env, dependencies)).status, 403);
        assert(!h.calls.some(c => c.path.startsWith('/v1/')));
    }
});
test('Disabled billing, unverified/ordinary requests and administrator accounts never receive a paid-access bypass', async () => {
    const { h, dependencies } = harness();
    const disabled = await handleBillingRequest(request('status'), { ...env, FINDER_BILLING_ENABLED: undefined }, dependencies);
    assert.deepEqual(await disabled.json(), { enabled: false });
    assert.equal((await handleBillingRequest(request('checkout', { plan: 'basic' }), env, { ...dependencies, verify: async () => { throw new BillingError('authentication_required', 401); } })).status, 401);
    assert.equal((await handleBillingRequest(request('checkout', { plan: 'basic' }, { Origin: 'https://evil.invalid' }), env, dependencies)).status, 403);
    assert.equal((await handleBillingRequest(request('checkout', { plan: 'basic' }), { ...env, FINDER_AUTH_SITE_ORIGIN: 'https://love-live-myoko.com' }, dependencies)).status, 403);
    const liveEnv = { ...env, FINDER_STRIPE_MODE: 'live', FINDER_BILLING_SANDBOX_ENABLED: undefined, STRIPE_SECRET_KEY: 'sk_live_UnitTestOnly0123456789' };
    h.administrator = true;
    assert.equal((await handleBillingRequest(request('checkout', { plan: 'basic' }), liveEnv, dependencies)).status, 403);
    assert.equal((await handleBillingRequest(request('portal', {}), liveEnv, dependencies)).status, 403);
    const status = await handleBillingRequest(request('status'), liveEnv, dependencies);
    const payload = await status.json(); assert.deepEqual(payload, { enabled: true, administrator: true });
    assert.match(status.headers.get('Cache-Control')!, /private, no-store/);
    assert(!JSON.stringify(payload).includes(env.STRIPE_SECRET_KEY!));
    h.administrator = false;
    assert.equal((await handleBillingRequest(request('checkout', { plan: 'basic' }), { ...liveEnv, FINDER_CUSTOMER_ACCESS: 'disabled' }, dependencies)).status, 409);
    assert.equal((await handleBillingRequest(request('checkout', { plan: 'basic' }), liveEnv,
        { ...dependencies, snapshot: async () => ({ ...snapshot, paidAccessEnabled: false }) })).status, 409);
});
test('Sandbox checkout works for the verified administrator on the existing HTTPS site while all customer billing routes stay closed', async () => {
    const { h, dependencies } = harness(); h.sub = null; h.row.state = emptyState(); h.row.customer_id = null;
    const site = 'https://love-live-myoko.com';
    const productionEnv = { ...env, FINDER_AUTH_SITE_ORIGIN: site, FINDER_CUSTOMER_ACCESS: 'disabled' };
    const req = (path: string, body?: object) => new Request(site + '/api/billing/' + path, { method: body ? 'POST' : 'GET',
        headers: { Origin: site, Cookie: '__Host-llm-access=unit-test-bearer', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await handleBillingRequest(req('checkout', { plan: 'basic' }), productionEnv, dependencies);
    assert.equal(result.status, 200);
    const checkout = h.calls.find(c => c.form.get('mode') === 'subscription')!;
    assert.equal(checkout.form.get('success_url'), site + '/account/?billing=success');
    assert.equal(checkout.form.get('metadata[finder_mode]'), 'sandbox');
    assert.equal(checkout.form.get('subscription_data[metadata][finder_mode]'), 'sandbox');
    const status = await handleBillingRequest(req('status'), productionEnv, dependencies);
    assert.equal((await status.json()).sandbox, true);
    const calls = h.calls.filter(c => c.path.startsWith('/v1/') || c.path.includes('finder_billing_')).length;
    h.administrator = false;
    for (const action of ['status','checkout','portal','upgrade','downgrade','cancel-downgrade']) {
        const response = await handleBillingRequest(req(action, action === 'status' ? undefined : action === 'checkout' ? { plan: 'premium' } : {}), productionEnv, dependencies);
        assert.equal(response.status, action === 'status' ? 200 : 403, action);
        if (action === 'status') assert.deepEqual(await response.json(), { enabled: false });
    }
    assert.equal(h.calls.filter(c => c.path.startsWith('/v1/') || c.path.includes('finder_billing_')).length, calls);
    h.administrator = true;
    assert.equal((await handleBillingRequest(req('checkout', { plan: 'basic' }), { ...productionEnv, FINDER_BILLING_SANDBOX_ENABLED: undefined }, dependencies)).status, 503);
});
test('A billing record with the wrong mode cannot seed reconciliation or receive a provider operation', async () => {
    const { h, dependencies } = harness(); h.row.livemode = true;
    assert.equal((await handleBillingRequest(request('status'), env, dependencies)).status, 503);
    assert(!h.calls.some(c => c.path.startsWith('/v1/')));
    assert(!h.calls.some(c => c.path.includes('finder_billing_apply')));
});
test('Rejected upgrade logs only fixed configuration fields and preserves Basic without creating a Portal session or payment', async t => {
    const logs: string[] = [];
    t.mock.method(console, 'error', (message: string) => { logs.push(message); });
    const { h, dependencies } = harness(); h.sub = stripeSubscription('basic'); h.row.state = paidState('basic'); h.badPortal = true;
    const result = await handleBillingRequest(request('upgrade', {}), env, dependencies);
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { code: 'billing_portal_configuration' });
    assert.equal(h.row.state.entitledPlan, 'basic');
    assert(!h.calls.some(c => c.path === '/v1/billing_portal/sessions' || c.path === '/v1/checkout/sessions'));
    assert(h.calls.some(c => c.path.endsWith('/finder_billing_release')));
    assert.equal(logs.length, 1);
    const log = JSON.parse(logs[0]);
    assert.deepEqual(Object.keys(log).sort(), ['configuration', 'event', 'fields', 'requestId']);
    assert.equal(log.event, 'billing_portal_configuration'); assert.equal(log.configuration, 'upgrade');
    assert.deepEqual(log.fields, ['subscription_update.proration_behavior']);
    assert(!logs[0].includes(uid) && !logs[0].includes(stripeCustomer) && !logs[0].includes(env.STRIPE_SECRET_KEY!));
});
test('Sandbox administrator can verify upgrade configuration using GET without touching billing state or creating a session', async () => {
    const { h, dependencies } = harness();
    const response = await handleBillingRequest(request('status?check=upgrade'), env, dependencies);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { enabled: true, sandbox: true, upgradeConfigurationValid: true });
    assert(!h.calls.some(c => c.path.includes('finder_billing_') || c.path === '/v1/billing_portal/sessions' || c.path === '/v1/checkout/sessions'));
    const reads = h.calls.length;
    h.administrator = false;
    assert.deepEqual(await (await handleBillingRequest(request('status?check=upgrade'), env, dependencies)).json(), { enabled: false });
    assert.equal(h.calls.length, reads + 1); // Verified user read only; no Stripe call.
});
test('Administrator can preflight both Live Portal configurations with customer purchasing closed and no mutations', async () => {
    const liveEnv = { ...env, FINDER_STRIPE_MODE: 'live', FINDER_BILLING_SANDBOX_ENABLED: 'disabled',
        STRIPE_SECRET_KEY: 'sk_live_UnitTestOnly', FINDER_CUSTOMER_ACCESS: 'disabled' };
    const { h, dependencies } = harness(liveEnv);
    const response = await handleBillingRequest(request('status?check=configuration'), liveEnv, dependencies);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { enabled: true, sandbox: false, configurationValid: true });
    assert.equal(h.calls.filter(c => c.path.startsWith('/v1/billing_portal/configurations/')).length, 2);
    assert(!h.calls.some(c => c.path.includes('finder_billing_') || c.path === '/v1/checkout/sessions' || c.path === '/v1/billing_portal/sessions'));
    assert.deepEqual(await (await handleBillingRequest(request('status'), liveEnv, dependencies)).json(), { enabled: true, administrator: true });
    assert.equal((await handleBillingRequest(request('checkout', { plan: 'basic' }), liveEnv, dependencies)).status, 403);
    h.administrator = false;
    const calls = h.calls.length;
    const denied = await handleBillingRequest(request('status?check=configuration'), liveEnv, dependencies);
    assert.equal(denied.status, 403); assert.deepEqual(await denied.json(), { code: 'billing_admin_only' });
    assert.equal(h.calls.length, calls + 1);
});
test('A revoked customer cannot start a Live purchase or upgrade even when customer launch gates are open', async () => {
    const liveEnv = { ...env, FINDER_STRIPE_MODE: 'live', FINDER_BILLING_SANDBOX_ENABLED: 'disabled', STRIPE_SECRET_KEY: 'sk_live_UnitTestOnly' };
    const { h, dependencies } = harness(liveEnv); h.administrator = false;
    const revoked = { ...dependencies, snapshot: async () => ({ ...snapshot, revokedAt: new Date().toISOString() }) };
    for (const action of ['checkout', 'upgrade']) {
        const response = await handleBillingRequest(request(action, action === 'checkout' ? { plan: 'basic' } : {}), liveEnv, revoked);
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), { code: 'billing_membership_revoked' });
    }
    assert(!h.calls.some(c => c.path.startsWith('/v1/') || c.path.includes('finder_billing_')));
});
