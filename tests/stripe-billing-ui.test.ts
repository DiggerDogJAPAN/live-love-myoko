import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { billingRedirect, parseBillingStatus, type BillingStatus } from '../src/lib/billing/client';
import { paidState } from './fixtures/stripe-billing';
let Summary: typeof import('../src/components/billing/BillingControls')['BillingSummary'];
let Actions: typeof import('../src/components/billing/BillingControls')['BillingPlanActions'];
before(async () => {
    const require = createRequire(process.cwd() + '/package.json'); require.extensions['.css'] = module => { module.exports = {}; };
    Summary = (await import('../src/components/billing/BillingControls')).BillingSummary;
    Actions = (await import('../src/components/billing/BillingControls')).BillingPlanActions;
});
test('Account plan controls offer upgrade, scheduled downgrade or cancellation independently of billing management', () => {
    const render = (status: BillingStatus, busy = false) => renderToStaticMarkup(createElement(Actions, { status, busy, onAction: () => undefined }));
    const premium: BillingStatus = { enabled: true, ...paidState(), scheduledPlan: null };
    assert.match(render(premium), /Downgrade to Basic/); assert.doesNotMatch(render(premium), /Upgrade to Premium|Cancel pending/);
    assert.match(render({ enabled: true, ...paidState('basic'), scheduledPlan: null }), /Upgrade to Premium/);
    const pending = { ...premium, scheduledPlan: 'basic' as const, scheduledAt: premium.periodEnd };
    assert.match(render(pending), /Cancel pending downgrade/); assert.doesNotMatch(render(pending), /Downgrade to Basic/);
    assert.match(render(pending, true), /disabled/);
    for (const status of [{ enabled: false }, { ...premium, administrator: true }, { ...premium, active: false },
        { ...premium, cancelAtPeriodEnd: true }, { ...premium, currentPlan: 'premium' as const, entitledPlan: 'basic' as const }]) assert.doesNotMatch(render(status), /<button/);
    assert.match(renderToStaticMarkup(createElement(Summary, { status: pending })), /first cancel the pending downgrade/);
});
test('Billing summary distinguishes current paid Premium, future Basic change and unconfirmed Premium upgrade', () => {
    const pending: BillingStatus = { enabled: true, ...paidState(), scheduledPlan: 'basic', scheduledAt: '2026-12-01T00:00:00Z' };
    const html = renderToStaticMarkup(createElement(Summary, { status: pending }));
    assert(html.includes('Scheduled change')); assert(html.includes('Basic from 1 Dec 2026'));
    assert(html.includes('paid Premium benefits remain available')); assert(!html.includes('only after payment is confirmed'));
    const upgrade = renderToStaticMarkup(createElement(Summary, { status: { ...pending, entitledPlan: 'basic', scheduledPlan: null, scheduledAt: null } }));
    assert(upgrade.includes('only after payment is confirmed')); assert(!upgrade.includes('Scheduled change'));
    const canceled = renderToStaticMarkup(createElement(Summary, { status: { ...pending, status: 'canceled', scheduledPlan: null, scheduledAt: null } }));
    assert(!canceled.includes('Next renewal'));
    assert.equal(renderToStaticMarkup(createElement(Summary, { status: { enabled: true, administrator: true } })), '');
});
test('Client projection validates billing fields, discards internal identifiers and permits only hosted Stripe redirect origins', () => {
    const data = parseBillingStatus({ enabled: true, ...paidState(), customer_id: 'INTERNAL_CUSTOMER', lease_token: 'NEVER_RETURN' });
    assert(!JSON.stringify(data).includes('INTERNAL')); assert(!JSON.stringify(data).includes('NEVER_RETURN'));
    for (const patch of [{ active: 'yes' }, { scheduledAt: 'invalid' }, { currentPlan: 'administrator' }, { entitledPlan: 'administrator' }]) assert.throws(() => parseBillingStatus({ enabled: true, ...paidState(), ...patch }));
    assert.deepEqual(parseBillingStatus({ enabled: false }), { enabled: false });
    assert.equal(billingRedirect('https://checkout.stripe.com/c/pay/test', 'checkout'), 'https://checkout.stripe.com/c/pay/test');
    assert.equal(billingRedirect('https://billing.stripe.com/p/session/test', 'portal'), 'https://billing.stripe.com/p/session/test');
    for (const url of ['https://evil.invalid/', 'javascript:alert(1)', 'https://checkout.stripe.com.evil.invalid/', 'https://user@checkout.stripe.com/']) assert.throws(() => billingRedirect(url, 'checkout'));
});
test('Administrator test billing is explicitly labelled Sandbox and is not presented as a change to website permissions', () => {
    const status = parseBillingStatus({ enabled: true, sandbox: true, ...paidState() });
    assert.equal(status.sandbox, true);
    const html = renderToStaticMarkup(createElement(Summary, { status }));
    assert.match(html, /Stripe Sandbox — administrator testing only/);
    assert.match(html, /simulated payments/); assert.match(html, /website membership permissions are unchanged/);
    assert.match(html, /Sandbox subscription status/);
    assert.throws(() => parseBillingStatus({ enabled: true, sandbox: 'true', ...paidState() }));
});
