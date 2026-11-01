import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveBillingState, emptyState, type StripeSubscription } from '../server/billing/model';
import { paidState, stripeCustomer, stripeInvoice, stripeNow as now, stripePrices, stripeSchedule, stripeSubscription } from './fixtures/stripe-billing';
const derive = (sub: StripeSubscription, previous = emptyState(), schedule: ReturnType<typeof stripeSchedule> | null = null, time = now) =>
    deriveBillingState(sub, previous, schedule, stripePrices, stripeCustomer, false, time);

test('Initial Basic/Premium and renewals require confirmed paid invoices for the exact current price/customer/subscription', () => {
    for (const plan of ['basic', 'premium'] as const) {
        assert.equal(derive(stripeSubscription(plan)).entitledPlan, plan);
        assert.equal(derive(stripeSubscription(plan, false)).active, false);
        for (const corrupt of ['customer', 'subscription', 'price', 'manual']) {
            const sub = stripeSubscription(plan); const invoice = stripeInvoice(plan);
            if (corrupt === 'customer') invoice.customer = 'cus_OtherCustomer';
            if (corrupt === 'subscription') invoice.parent!.subscription_details!.subscription = 'sub_OtherSubscription';
            if (corrupt === 'price') invoice.lines.data[0].pricing!.price_details!.price = 'price_Unrelated';
            if (corrupt === 'manual') invoice.payments!.data = [];
            sub.latest_invoice = invoice; assert.equal(derive(sub).active, false, corrupt);
        }
    }
    const renewed = stripeSubscription('premium');
    renewed.items.data[0].current_period_start = now; renewed.items.data[0].current_period_end = now + 2592000;
    renewed.latest_invoice = stripeInvoice('premium', true, now, now + 2592000);
    assert.equal(derive(renewed, paidState()).paidEnd, new Date((now + 2592000) * 1000).toISOString());
});
test('A Premium-to-Basic schedule preserves paid Premium until the effective phase, and records only the future intent', () => {
    const sub = stripeSubscription(), schedule = stripeSchedule(); sub.schedule = schedule.id;
    const pending = derive(sub, paidState(), schedule);
    assert.equal(pending.currentPlan, 'premium'); assert.equal(pending.entitledPlan, 'premium');
    assert.equal(pending.paidEnd, paidState().paidEnd);
    assert.equal(pending.scheduledPlan, 'basic'); assert.equal(pending.scheduledAt, new Date((now + 86400) * 1000).toISOString());
    assert.equal(pending.scheduleId, schedule.id);
    // At the boundary an unchanged/stale phase cannot renew Premium by itself.
    assert.equal(derive(sub, pending, schedule, now + 86400).active, false);
    const effective = stripeSubscription('basic'); effective.items.data[0].current_period_start = now + 86400;
    effective.items.data[0].current_period_end = now + 2678400;
    effective.latest_invoice = stripeInvoice('basic', true, now + 86400, now + 2678400);
    const basic = derive(effective, pending, null, now + 86401);
    assert.equal(basic.entitledPlan, 'basic'); assert.equal(basic.scheduledPlan, null); assert.equal(basic.scheduleId, null);
});
test('Dahlia expanded invoice, price and PaymentIntent references preserve exact owner/payment matching', () => {
    const sub = stripeSubscription(); const invoice = stripeInvoice();
    sub.customer = { id: stripeCustomer }; invoice.customer = { id: stripeCustomer };
    invoice.parent!.subscription_details!.subscription = { id: sub.id };
    invoice.lines.data[0].pricing!.price_details!.price = { id: stripePrices.premium };
    invoice.payments!.data[0].invoice = { id: invoice.id };
    invoice.payments!.data[0].payment.payment_intent = { id: 'pi_ExpandedPayment' };
    sub.latest_invoice = invoice; assert.equal(derive(sub).entitledPlan, 'premium');
    invoice.lines.data[0].pricing!.price_details!.price = { id: stripePrices.basic };
    assert.equal(derive(sub).active, false, 'an expanded Basic price cannot prove paid Premium');
});
test('Dahlia off-Stripe payments, PaymentRecords, incomplete allocations and manually-paid statuses never grant Premium', () => {
    for (const scenario of ['manual', 'paymentRecord', 'charge', 'partialOffStripe', 'wrongMode', 'wrongInvoice', 'wrongCurrency', 'openPayment', 'truncatedPayments']) {
        const sub = stripeSubscription('premium'); const invoice = stripeInvoice(); invoice.amount_paid_off_stripe = 4000;
        const payment = invoice.payments!.data[0];
        if (scenario === 'manual') invoice.payments!.data = [];
        if (scenario === 'paymentRecord') payment.payment = { type: 'payment_record', payment_record: 'pyr_OffStripe' };
        if (scenario === 'charge') payment.payment = { type: 'charge', charge: 'ch_UnapprovedLegacyCharge' };
        if (scenario === 'partialOffStripe') { payment.amount_paid = 3000; invoice.amount_paid_off_stripe = 1000; }
        if (scenario === 'wrongMode') payment.livemode = true;
        if (scenario === 'wrongInvoice') payment.invoice = 'in_Unrelated';
        if (scenario === 'wrongCurrency') payment.currency = 'usd';
        if (scenario === 'openPayment') payment.status = 'open';
        if (scenario === 'truncatedPayments') invoice.payments!.has_more = true;
        sub.latest_invoice = invoice;
        assert.equal(derive(sub, paidState('basic')).entitledPlan, 'basic', scenario);
    }
    const credit = stripeSubscription(); const invoice = stripeInvoice();
    invoice.amount_due = 0; invoice.amount_paid = 0; invoice.payments = undefined; credit.latest_invoice = invoice;
    assert.equal(derive(credit).entitledPlan, 'premium', 'Stripe-confirmed zero-due settlements remain supported');
});
test('Canceling/releasing or replacing a pending downgrade clears/replaces future intent without changing paid Premium', () => {
    const sub = stripeSubscription(), schedule = stripeSchedule(); sub.schedule = schedule.id;
    const pending = derive(sub, paidState(), schedule);
    sub.schedule = null;
    const canceled = derive(sub, pending);
    assert.equal(canceled.entitledPlan, 'premium'); assert.equal(canceled.scheduledPlan, null); assert.equal(canceled.scheduleId, null);
    const replacement = stripeSchedule('sub_sched_ReplacementTest', now + 172800); sub.schedule = replacement.id;
    const replaced = derive(sub, pending, replacement);
    assert.equal(replaced.entitledPlan, 'premium'); assert.equal(replaced.scheduleId, replacement.id);
    assert.equal(replaced.scheduledAt, new Date((now + 172800) * 1000).toISOString());
    replacement.phases[1].items[0].price = stripePrices.premium;
    assert.equal(derive(sub, replaced, replacement).scheduledPlan, null, 'replacement with no downgrade clears old intent');
    assert.throws(() => derive(sub, pending, schedule), /billing_schedule_review/, 'old schedule cannot masquerade as replacement');
});
test('Immediate Basic-to-Premium upgrades retain Basic until the Premium proration invoice is paid', () => {
    const sub = stripeSubscription('premium', false), basic = paidState('basic');
    const waiting = derive(sub, basic);
    assert.equal(waiting.entitledPlan, 'basic'); assert.equal(waiting.paidEnd, basic.paidEnd);
    sub.status = 'past_due'; assert.equal(derive(sub, waiting).entitledPlan, 'basic', 'unpaid upgrade does not erase already-paid Basic time');
    sub.status = 'active'; sub.latest_invoice = stripeInvoice('premium');
    assert.equal(derive(sub, waiting).entitledPlan, 'premium');
    const prorated = stripeInvoice('premium');
    prorated.lines.data[0].parent = { invoice_item_details: { subscription: sub.id, proration: true } };
    prorated.lines.data[0].quantity = null;
    prorated.lines.data.push({ ...structuredClone(prorated.lines.data[0]), amount: -1000,
        pricing: { price_details: { price: stripePrices.basic } } });
    prorated.amount_due = 3000; prorated.amount_paid = 3000; prorated.payments!.data[0].amount_paid = 3000;
    sub.latest_invoice = prorated;
    assert.equal(derive(sub, waiting).entitledPlan, 'premium', 'Basil invoice-item proration and Basic credit confirm the paid upgrade');
    prorated.lines.data[0].parent!.invoice_item_details!.subscription = 'sub_Unrelated';
    assert.equal(derive(sub, basic).entitledPlan, 'basic', 'another subscription proration cannot prove this upgrade');
    sub.latest_invoice = stripeInvoice('basic');
    assert.equal(derive(sub, basic).entitledPlan, 'basic', 'old paid invoice cannot prove Premium payment');
    sub.pending_update = { expires_at: now + 300 }; sub.latest_invoice = stripeInvoice('premium', false);
    assert.equal(derive(sub, basic).entitledPlan, 'basic');
});
test('Failed renewals, cancellation and unsupported billing shapes cannot extend or invent access', () => {
    const previous = paidState(), failed = stripeSubscription('premium', false); failed.status = 'past_due';
    failed.items.data[0].current_period_start = now + 86400; failed.items.data[0].current_period_end = now + 2678400;
    assert.equal(derive(failed, previous, null, now + 86401).active, false);
    const cancel = stripeSubscription(); cancel.cancel_at_period_end = true;
    assert.equal(derive(cancel, previous).entitledPlan, 'premium');
    cancel.status = 'canceled'; assert.equal(derive(cancel, previous).active, false);
    for (const status of ['unpaid', 'paused', 'trialing', 'incomplete', 'incomplete_expired']) {
        cancel.status = status; assert.equal(derive(cancel, previous).active, false, status);
    }
    const unknown = stripeSubscription(); unknown.items.data[0].price.id = 'price_Unexpected'; assert.throws(() => derive(unknown), /billing_subscription_review/);
    const different = stripeSubscription(); different.id = 'sub_NewSubscription'; different.latest_invoice = null;
    assert.equal(derive(different, previous).active, false, 'old subscription payment is not reusable');
});
