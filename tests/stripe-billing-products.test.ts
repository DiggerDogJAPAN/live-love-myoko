import assert from 'node:assert/strict';
import { test } from 'node:test';
import { billingConfiguration, validatePortal, validatePrices, type BillingEnv } from '../server/billing/provider';
import { deriveBillingState, type Plan, type StripePrice } from '../server/billing/model';
import { paidState, stripeCustomer, stripeNow, stripePrice, stripePrices, stripeProducts, stripeSchedule, stripeSubscription } from './fixtures/stripe-billing';

const env: BillingEnv = {
    FINDER_AUTH_SITE_ORIGIN: 'http://127.0.0.1:8788', FINDER_SUPABASE_PROJECT_REF: 'fgdoqsepihlzfqlqymet',
    FINDER_BILLING_ENABLED: 'enabled', FINDER_BILLING_SANDBOX_ENABLED: 'enabled', FINDER_STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_ProductsUnitTestOnly',
    STRIPE_WEBHOOK_SECRET: 'whsec_ProductsUnitTestOnly', FINDER_BILLING_SUPABASE_SECRET_KEY: 'sb_secret_ProductsUnitTestOnly',
    STRIPE_BASIC_PRICE_ID: stripePrices.basic, STRIPE_PREMIUM_PRICE_ID: stripePrices.premium,
    STRIPE_BASIC_PRODUCT_ID: stripeProducts.basic, STRIPE_PREMIUM_PRODUCT_ID: stripeProducts.premium, STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_ProductsUnitTest', STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID: 'bpc_UpgradeProductsUnitTest',
};
function harness(upgrade = false) {
    const prices = { basic: stripePrice('basic'), premium: stripePrice('premium') };
    const portal = { id: upgrade ? env.STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID : env.STRIPE_PORTAL_CONFIGURATION_ID, active: true, livemode: false, features: {
        subscription_update: { enabled: upgrade, default_allowed_updates: ['price'], proration_behavior: 'always_invoice', billing_cycle_anchor: null as string | null,
            products: [{ product: stripeProducts.premium, prices: [stripePrices.premium] }],
            schedule_at_period_end: { conditions: [] as { type: string }[] } },
        subscription_cancel: { enabled: true, mode: 'at_period_end' }, payment_method_update: { enabled: true }, invoice_history: { enabled: true },
    } };
    const transport: typeof fetch = async (input, init) => {
        const url = new URL(String(input)); assert.equal(url.origin, 'https://api.stripe.com'); assert.equal(init?.redirect, 'error');
        if (url.pathname.startsWith('/v1/prices/')) return Response.json(prices[url.pathname.endsWith(stripePrices.basic) ? 'basic' : 'premium']);
        assert.equal(url.pathname, '/v1/billing_portal/configurations/' + portal.id);
        return Response.json(portal);
    };
    return { prices, portal, transport };
}
test('Separate Basic/Premium products each validate against their own configured monthly JPY tax-inclusive price', async () => {
    const h = harness(); const config = await validatePrices(env, h.transport);
    assert.deepEqual(config.products, stripeProducts); assert.deepEqual(config.prices, stripePrices);
    assert.notEqual(config.products.basic, config.products.premium);
    h.prices.basic.product = { id: stripeProducts.basic }; h.prices.premium.product = { id: stripeProducts.premium };
    await validatePrices(env, h.transport);
    assert.throws(() => billingConfiguration({ ...env, STRIPE_BASIC_PRODUCT_ID: undefined }), /billing_not_configured/);
    assert.throws(() => billingConfiguration({ ...env, STRIPE_BASIC_PRODUCT_ID: stripeProducts.premium }), /billing_not_configured/);
});
test('Sandbox on the existing production origin requires explicit opt-in and cannot be combined with live keys or live mode', () => {
    const production = { ...env, FINDER_AUTH_SITE_ORIGIN: 'https://love-live-myoko.com' };
    assert.equal(billingConfiguration(production).sandbox, true);
    assert.throws(() => billingConfiguration({ ...production, FINDER_BILLING_SANDBOX_ENABLED: undefined }), /billing_not_configured/);
    assert.throws(() => billingConfiguration({ ...production, STRIPE_SECRET_KEY: 'sk_live_ProductsUnitTestOnly' }), /billing_not_configured/);
    assert.throws(() => billingConfiguration({ ...production, FINDER_STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'sk_live_ProductsUnitTestOnly' }), /billing_not_configured/);
    assert.equal(billingConfiguration({ ...production, FINDER_BILLING_SANDBOX_ENABLED: undefined, FINDER_STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'sk_live_ProductsUnitTestOnly' }).sandbox, false);
});
test('Either price fails independently for the wrong product, amount, currency, recurrence, tax behavior or mode', async () => {
    const mutations: ((p: StripePrice, plan: Plan) => void)[] = [
        (p, plan) => { p.product = stripeProducts[plan === 'basic' ? 'premium' : 'basic']; },
        p => { p.product = null; }, p => { p.currency = 'usd'; }, p => { p.unit_amount = 1; },
        p => { p.recurring.interval = 'year'; }, p => { p.recurring.interval_count = 2; }, p => { p.recurring.usage_type = 'metered'; },
        p => { p.tax_behavior = 'exclusive'; }, p => { p.tax_behavior = 'unspecified'; }, p => { p.active = false; }, p => { p.livemode = true; },
        p => { p.id = 'price_Unapproved'; },
    ];
    for (const plan of ['basic', 'premium'] as const) for (const mutate of mutations) {
        const h = harness(); mutate(h.prices[plan], plan);
        await assert.rejects(validatePrices(env, h.transport), /billing_price_configuration/);
    }
});
test('Management Portal disables plan updates; upgrade-only Portal never includes Basic even in a stale session', async () => {
    const management = harness(); await validatePortal(env, management.transport);
    management.portal.features.subscription_update.enabled = true;
    await assert.rejects(validatePortal(env, management.transport), /billing_portal_configuration/);
    const upgrade = harness(true); await validatePortal(env, upgrade.transport, true);
    for (const scenario of ['basicTarget', 'wrongProduct', 'extraPrice', 'extraProduct', 'quantity', 'noProration', 'immediateCancellation', 'delayedUpgrade', 'disabled', 'anchorReset']) {
        const bad = harness(true); const update = bad.portal.features.subscription_update;
        if (scenario === 'basicTarget') update.products[0].prices = [stripePrices.basic];
        if (scenario === 'wrongProduct') update.products[0].product = stripeProducts.basic;
        if (scenario === 'extraPrice') update.products[0].prices.push(stripePrices.basic);
        if (scenario === 'extraProduct') update.products.push({ product: stripeProducts.basic, prices: [stripePrices.basic] });
        if (scenario === 'quantity') update.default_allowed_updates.push('quantity');
        if (scenario === 'noProration') update.proration_behavior = 'none';
        if (scenario === 'immediateCancellation') bad.portal.features.subscription_cancel.mode = 'immediately';
        if (scenario === 'delayedUpgrade') update.schedule_at_period_end.conditions.push({ type: 'decreasing_item_amount' });
        if (scenario === 'disabled') update.enabled = false;
        if (scenario === 'anchorReset') update.billing_cycle_anchor = 'now';
        await assert.rejects(validatePortal(env, bad.transport, true), /billing_portal_configuration/, scenario);
    }
    assert.throws(() => billingConfiguration({ ...env, STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID: env.STRIPE_PORTAL_CONFIGURATION_ID }), /billing_not_configured/);
});
test('Cross-product schedules and paid/unpaid upgrades retain their existing entitlement rules and single-item quantity restriction', () => {
    const basic = stripeSubscription('basic'), premium = stripeSubscription('premium', false);
    assert.notEqual(basic.items.data[0].price.product, premium.items.data[0].price.product);
    let state = deriveBillingState(premium, paidState('basic'), null, stripePrices, stripeCustomer, false, stripeNow);
    assert.equal(state.entitledPlan, 'basic');
    const paid = stripeSubscription('premium'); state = deriveBillingState(paid, state, null, stripePrices, stripeCustomer, false, stripeNow);
    assert.equal(state.entitledPlan, 'premium');
    const schedule = stripeSchedule(); paid.schedule = schedule.id;
    state = deriveBillingState(paid, state, schedule, stripePrices, stripeCustomer, false, stripeNow);
    assert.equal(state.entitledPlan, 'premium'); assert.equal(state.scheduledPlan, 'basic');
    paid.schedule = null;
    state = deriveBillingState(paid, state, null, stripePrices, stripeCustomer, false, stripeNow);
    assert.equal(state.scheduledPlan, null); assert.equal(state.entitledPlan, 'premium');
    assert.equal(deriveBillingState(basic, state, null, stripePrices, stripeCustomer, false, stripeNow).entitledPlan, 'basic');
    basic.items.data[0].quantity = 2;
    assert.throws(() => deriveBillingState(basic, state, null, stripePrices, stripeCustomer, false, stripeNow), /billing_subscription_review/);
});
