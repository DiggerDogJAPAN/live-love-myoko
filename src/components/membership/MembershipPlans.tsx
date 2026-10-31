'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchAccount } from '@/lib/auth/client';
import type { AccountDetails } from '@/lib/auth/types';
import styles from '@/app/membership/membership.module.css';

type Plan = 'basic' | 'premium';
const plans: { id: Plan; name: string; price: string; features: { text: string; planned?: boolean; description?: string; highlighted?: boolean }[] }[] = [
    { id: 'basic' as const, name: 'Basic', price: '¥2,000', features: [
        { text: 'Access to the Property Finder directory' },
        { text: 'Search aggregated Japanese property listings' },
        { text: 'Search filters and sorting' },
        { text: 'Direct links to original Japanese property websites' },
    ] },
    { id: 'premium' as const, name: 'Premium', price: '¥4,000', features: [
        { text: 'Everything in Basic' },
        { text: 'Saved Properties', description: 'Save favourite properties to your account.' },
        { text: 'Property Alerts', description: 'Select preferred areas and receive one daily email when new matching properties are discovered.', highlighted: true },
        { text: 'Interactive Map Viewing', planned: true },
        { text: 'Eligible refund of up to three months of Premium membership fees following a qualifying property purchase through our agency' },
    ] },
];

/** Presentation only. All permissions come from the existing verified account
 * response; these links never grant membership or bypass RPC authorization. */
export function membershipAction(account: AccountDetails | null, plan: Plan, unavailable = false) {
    if (!account && !unavailable) return { href: '/register', label: 'Create an account' };
    if (account && account.user.verified && account.sessionExpiresAt > Date.now() && account.finderAccess === true
        && (plan === 'basic' || account.savedPropertiesAccess === true)) {
        return { href: '/property-finder/search/', label: 'Open Property Finder' };
    }
    return { href: '/account/', label: account ? 'View membership status' : 'Your account' };
}

export function MembershipPlanCards({ account = null, unavailable = false }: { account?: AccountDetails | null; unavailable?: boolean }) {
    return <div className={styles.plans}>
        {plans.map(plan => {
            const premium = plan.id === 'premium';
            const action = membershipAction(account, plan.id, unavailable);
            return <section key={plan.id} className={`${styles.plan} ${premium ? styles.premium : ''}`} aria-labelledby={`${plan.id}-plan`}>
                <div className={styles.planHeading}>
                    <h2 id={`${plan.id}-plan`}>{plan.name}</h2>
                    <p className={styles.price}><span className={styles.amount}>{plan.price}</span><span className={styles.period}>/ month</span></p>
                </div>
                <ul className={styles.features} role="list">
                    {plan.features.map(feature => <li key={feature.text} className={feature.highlighted ? styles.highlightedFeature : undefined}>
                        <span className={feature.planned ? styles.plannedMarker : styles.check} aria-hidden="true">{feature.planned ? '○' : '✓'}</span>
                        {feature.planned ? <span className={styles.plannedFeature}><span className={styles.plannedBadge}>PLANNED</span><span>{feature.text}</span></span> : <span>
                            {feature.highlighted ? <><span className={styles.featureLabel}>PREMIUM EXCLUSIVE</span><strong>{feature.text}</strong></> : feature.text}
                            {feature.description && <span className={styles.featureDescription}>{feature.description}</span>}
                            {feature.highlighted && <Link className={styles.featureLink} href="#property-alerts">How Property Alerts work</Link>}
                        </span>}
                    </li>)}
                </ul>
                <Link className={`button ${styles.cta} ${premium ? styles.whiteButton : styles.outlineButton}`} href={action.href}>{action.label}</Link>
            </section>;
        })}
    </div>;
}

export default function MembershipPlans() {
    const [account, setAccount] = useState<AccountDetails | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const sequence = useRef(0);
    const invalidate = useCallback(() => { sequence.current++; }, []);
    const load = useCallback(async () => {
        const current = ++sequence.current;
        try {
            const result = await fetchAccount();
            if (current === sequence.current) { setAccount(result); setUnavailable(false); }
        } catch (error) {
            if (current !== sequence.current) return;
            setAccount(null);
            setUnavailable(!(error instanceof Error && error.message === 'authentication_required'));
        }
    }, []);
    useEffect(() => {
        const initial = window.setTimeout(() => { void load(); }, 0);
        const signedOut = () => { sequence.current++; setAccount(null); setUnavailable(false); };
        const visible = () => { if (document.visibilityState === 'visible') void load(); };
        const pageShow = (event: PageTransitionEvent) => { if (event.persisted) { signedOut(); void load(); } };
        const channel = 'BroadcastChannel' in window ? new BroadcastChannel('llm-auth') : null;
        if (channel) channel.onmessage = event => { if (event.data === 'signed-out') signedOut(); };
        window.addEventListener('llm-signout', signedOut);
        window.addEventListener('pageshow', pageShow);
        document.addEventListener('visibilitychange', visible);
        return () => {
            invalidate(); window.clearTimeout(initial); channel?.close();
            window.removeEventListener('llm-signout', signedOut); window.removeEventListener('pageshow', pageShow);
            document.removeEventListener('visibilitychange', visible);
        };
    }, [load, invalidate]);
    useEffect(() => {
        if (!account) return;
        const timeout = window.setTimeout(() => { setAccount(null); void load(); }, Math.max(0, account.sessionExpiresAt - Date.now()));
        return () => window.clearTimeout(timeout);
    }, [account, load]);
    return <MembershipPlanCards account={account} unavailable={unavailable} />;
}
