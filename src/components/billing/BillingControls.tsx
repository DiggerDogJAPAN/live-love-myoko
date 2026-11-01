'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { billingMessage, billingRedirect, billingRequest, parseBillingStatus, type BillingAction, type BillingStatus } from '@/lib/billing/client';
import type { AccountDetails } from '@/lib/auth/types';
import styles from '../auth/account.module.css';
const date = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value));

export function BillingSummary({ status }: { status: BillingStatus }) {
    if (!status.enabled || status.administrator) return null;
    return <>
        {status.sandbox && <p role="status"><strong>Stripe Sandbox — administrator testing only.</strong> These are simulated payments. Your administrator role and website membership permissions are unchanged.</p>}
        <dl className={styles.facts}>
            <dt>{status.sandbox ? 'Sandbox subscription status' : 'Subscription status'}</dt><dd>{status.status?.replaceAll('_', ' ')}</dd>
            {status.periodEnd && ['active', 'past_due'].includes(status.status || '') && <><dt>{status.cancelAtPeriodEnd ? 'Subscription ends' : 'Next renewal'}</dt><dd>{date(status.periodEnd)}</dd></>}
            {status.scheduledPlan && status.scheduledAt && <><dt>Scheduled change</dt><dd>Basic from {date(status.scheduledAt)}</dd></>}
        </dl>
        {status.scheduledPlan && status.entitledPlan === 'premium' && status.active && <p>Your paid Premium benefits remain available until the scheduled downgrade takes effect, subject to payment and your paid-through date.</p>}
        {status.scheduledPlan && <p>To cancel your subscription instead, first cancel the pending downgrade below, then use Manage Billing. Payment methods and invoices remain available in Manage Billing.</p>}
        {status.currentPlan === 'premium' && status.entitledPlan !== 'premium' && <p>Premium access will start only after payment is confirmed. Any remaining paid Basic access is unchanged.</p>}
        {status.cancelAtPeriodEnd && <p>Your subscription will not renew. Paid access ends on its paid-through date.</p>}
    </>;
}
export function BillingPlanActions({ status, busy, onAction }: { status: BillingStatus; busy: boolean; onAction: (action: BillingAction) => void }) {
    if (!status.enabled || status.administrator || !status.active || status.status !== 'active' || status.cancelAtPeriodEnd) return null;
    return <div className={styles.billingActions}>
        {status.currentPlan === 'basic' && status.entitledPlan === 'basic' && <button type="button" className={`button ${styles.finderButton}`} disabled={busy} onClick={() => onAction('upgrade')}>Upgrade to Premium</button>}
        {status.currentPlan === 'premium' && status.entitledPlan === 'premium' && (status.scheduledPlan ?
            <button type="button" className={`button ${styles.finderButton}`} disabled={busy} onClick={() => onAction('cancel-downgrade')}>Cancel pending downgrade</button> :
            <button type="button" className={`button ${styles.finderButton}`} disabled={busy} onClick={() => onAction('downgrade')}>Downgrade to Basic</button>)}
    </div>;
}
export default function BillingControls({ account, onMembershipChanged }: { account: AccountDetails; onMembershipChanged?: () => Promise<void> }) {
    const [status, setStatus] = useState<BillingStatus | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const sequence = useRef(0), working = useRef(false), accountRef = useRef(account);
    const invalidate = useCallback(() => { sequence.current++; }, []);
    useEffect(() => { accountRef.current = account; }, [account]);
    const load = useCallback(async () => {
        const current = ++sequence.current;
        try {
            const next = parseBillingStatus(await billingRequest('status'));
            if (current !== sequence.current) return;
            setStatus(next); setError('');
            const membership = accountRef.current.membership;
            if (next.enabled && !next.administrator && !next.sandbox && (next.entitledPlan !== membership.tier || next.active !== membership.active
                || (next.paidEnd && Date.parse(next.paidEnd) !== Date.parse(membership.paidThrough || '')))) await onMembershipChanged?.();
        } catch (e) { if (current === sequence.current) setError(billingMessage(e)); }
    }, [onMembershipChanged]);
    useEffect(() => {
        const timer = window.setTimeout(() => { void load(); }, 0);
        return () => { window.clearTimeout(timer); invalidate(); };
    }, [account.user.id, account.role, load, invalidate]);
    const start = async (kind: BillingAction, plan?: 'basic' | 'premium') => {
        if (working.current) return;
        const context = status?.sandbox ? 'Stripe Sandbox test — no real payment or membership change. ' : '';
        if (kind === 'downgrade' && !window.confirm(context + 'Schedule Basic membership at ¥2,000/month from the end of your current paid billing period? Premium benefits remain available until then.')) return;
        if (kind === 'cancel-downgrade' && !window.confirm(context + 'Cancel the pending downgrade and continue Premium membership at ¥4,000/month?')) return;
        working.current = true; setBusy(true); setError(''); setMessage(''); const current = ++sequence.current;
        try {
            const result = await billingRequest(kind, plan ? { plan } : {});
            if (current !== sequence.current) return;
            if (kind === 'downgrade' || kind === 'cancel-downgrade') {
                setStatus(parseBillingStatus(result));
                setMessage(kind === 'downgrade' ? 'Your downgrade to Basic is scheduled. Premium benefits remain available until the change takes effect.' : 'Your pending downgrade has been cancelled. Your Premium subscription will continue.');
            } else window.location.assign(billingRedirect(result.url, kind === 'checkout' ? 'checkout' : 'portal'));
        } catch (e) { if (current === sequence.current) setError(billingMessage(e)); }
        finally { working.current = false; if (current === sequence.current) setBusy(false); }
    };
    if (account.role === 'administrator' && !status?.sandbox && !error) return null;
    const existing = !!status?.enabled && status.status !== 'none';
    return <div className={styles.billing} aria-busy={busy}>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {!status?.enabled ? !account.membership.active && <p>Subscription purchasing is not available yet. Creating an account does not start a subscription or charge you.</p> : <>
            <BillingSummary status={status} />
            {existing && <button type="button" className={`button ${styles.finderButton}`} disabled={busy} onClick={() => { void start('portal'); }}>{status.sandbox ? 'Manage Sandbox Billing' : 'Manage Billing'}</button>}
            <BillingPlanActions status={status} busy={busy} onAction={action => { void start(action); }} />
            {(!existing || ['canceled', 'incomplete_expired'].includes(status.status || '')) && <div className={styles.billingActions}>
                <button type="button" className={`button ${styles.finderButton}`} disabled={busy} onClick={() => { void start('checkout', 'basic'); }}>{status.sandbox ? 'Test Basic' : 'Choose Basic'} — ¥2,000/month</button>
                <button type="button" className={`button ${styles.finderButton}`} disabled={busy} onClick={() => { void start('checkout', 'premium'); }}>{status.sandbox ? 'Test Premium' : 'Choose Premium'} — ¥4,000/month</button>
            </div>}
            <p>Prices include tax. Monthly subscriptions renew automatically unless cancelled. Upgrades are billed immediately on a prorated basis; Premium access requires confirmed payment. Downgrades take effect at the next renewal.</p>
        </>}
        {(status?.enabled || error) && <button type="button" className={styles.billingRefresh} disabled={busy} onClick={() => { void load(); }}>Refresh billing status</button>}
    </div>;
}
