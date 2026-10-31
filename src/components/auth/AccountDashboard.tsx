'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { announceSignout, authMessage, authRequest, fetchAccount, refreshSession } from '@/lib/auth/client';
import type { AccountDetails } from '@/lib/auth/types';
import styles from './auth.module.css';
import accountStyles from './account.module.css';
import AuthLayout from './AuthLayout';
import layoutStyles from './auth-layout.module.css';
import SavedPropertiesSection from '../property-finder/SavedPropertiesSection';
export default function AccountDashboard() {
    const [account, setAccount] = useState<AccountDetails | null>(null), [loading, setLoading] = useState(true);
    const [message, setMessage] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false);
    const generation = useRef(0);
    const invalidate = useCallback(() => { generation.current++; }, []);
    const load = useCallback(async () => {
        const current = ++generation.current;
        try { const value = await fetchAccount(); if (current === generation.current) { setAccount(value); setName(value.user.name); setMessage(''); } }
        catch (e) { if (current === generation.current) { setAccount(null); setMessage(authMessage(e instanceof Error ? e.message : 'authentication_unavailable')); } }
        finally { if (current === generation.current) setLoading(false); }
    }, []);
    useEffect(() => {
        const initialLoad = window.setTimeout(() => { void load(); }, 0);
        const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
        const onSignout = () => { invalidate(); setAccount(null); setName(''); setLoading(false); setMessage('You have signed out.'); };
        const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) { setAccount(null); void load(); } };
        const channel = 'BroadcastChannel' in window ? new BroadcastChannel('llm-auth') : null;
        if (channel) channel.onmessage = event => { if (event.data === 'signed-out') onSignout(); };
        document.addEventListener('visibilitychange', onVisible); window.addEventListener('pageshow', onPageShow); window.addEventListener('llm-signout', onSignout);
        return () => { window.clearTimeout(initialLoad); invalidate(); channel?.close(); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('pageshow', onPageShow); window.removeEventListener('llm-signout', onSignout); };
    }, [load, invalidate]);
    useEffect(() => {
        if (!account) return;
        const delay = Math.max(1000, account.sessionExpiresAt - Date.now() - 60000);
        const timer = window.setTimeout(() => { setAccount(null); refreshSession().then(load).catch(() => setMessage('Your session has ended. Please sign in again.')); }, delay);
        return () => window.clearTimeout(timer);
    }, [account, load]);
    const updateProfile = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); setBusy(true); setMessage('');
        try { await authRequest('profile', { name }); await load(); setMessage('Your name has been updated.'); }
        catch (e) { setMessage(authMessage(e instanceof Error ? e.message : 'authentication_unavailable')); }
        finally { setBusy(false); }
    };
    const logout = async () => {
        setBusy(true); let notice = 'You have signed out.';
        try { await authRequest('logout', {}); }
        catch (e) { notice = authMessage(e instanceof Error ? e.message : 'authentication_unavailable'); }
        finally { announceSignout(); setAccount(null); setName(''); setMessage(notice); setBusy(false); }
    };
    if (loading) return <><AccountHeader /><div className={styles.panel}><p role="status">Checking your account…</p></div></>;
    if (!account) return <SignedOutAccount message={message} />;
    return <>
        <AccountHeader onSignout={logout} busy={busy} />
        {message && <p className={styles.message} role="status">{message}</p>}
        <AccountPanels account={account} name={name} busy={busy} onNameChange={setName} onSave={updateProfile} />
        <SavedPropertiesSection key={account.user.id} account={account} />
    </>;
}

export function AccountHeader({ onSignout, busy = false }: { onSignout?: () => void; busy?: boolean }) {
    return <header className={accountStyles.header}>
        <div className={accountStyles.heading}><p className={accountStyles.eyebrow}>LOVE LIVE MYOKO · PROPERTY FINDER</p><h1>Your account</h1></div>
        <div className={accountStyles.headerActions}><p>Manage your details and view your membership status.</p>
            {onSignout && <button type="button" className={`button button--secondary ${accountStyles.signout}`} onClick={onSignout} disabled={busy}>Sign out</button>}
        </div>
    </header>;
}

export function AccountPanels({ account, name, busy, onNameChange, onSave }: {
    account: AccountDetails; name: string; busy: boolean; onNameChange: (name: string) => void; onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
    const administrator = account.role === 'administrator';
    return <div className={accountStyles.panels}>
        <section className={accountStyles.panel} aria-labelledby="account-details">
            <h2 id="account-details">Your details</h2>
            <dl className={accountStyles.facts}>
                <dt>Email</dt><dd>{account.user.email}</dd>
                <dt>Email verified</dt><dd><span className={account.user.verified ? accountStyles.verified : undefined}>{account.user.verified ? 'Yes' : 'No'}</span></dd>
                <dt>Account role</dt><dd>{administrator ? 'Administrator' : 'Customer'}</dd>
            </dl>
            <form className={accountStyles.nameForm} onSubmit={onSave} aria-busy={busy}>
                <label htmlFor="account-name">Name</label>
                <div className={accountStyles.nameControls}>
                    <input id="account-name" name="name" autoComplete="name" maxLength={80} value={name} onChange={e => onNameChange(e.target.value)} disabled={busy} />
                    <button type="submit" className="button button--secondary" disabled={busy}>Save name</button>
                </div>
            </form>
            <Link className={accountStyles.reset} href="/forgot-password/">Reset password</Link>
        </section>
        <section className={`${accountStyles.panel} ${accountStyles.membership}`} aria-labelledby="account-membership">
            <h2 id="account-membership">Your membership</h2>
            <dl className={accountStyles.facts}>
                <dt>Plan</dt><dd>{administrator ? 'Not required' : account.membership.tier ? account.membership.tier === 'premium' ? 'Premium' : 'Basic' : 'No membership'}</dd>
                <dt>Status</dt><dd>{administrator ? 'Administrator access' : account.membership.active ? 'Active' : 'Not active'}</dd>
                {account.membership.paidThrough && !administrator && <><dt>Paid through</dt><dd>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(account.membership.paidThrough))}</dd></>}
            </dl>
            {administrator ? <><p>Your administrator role does not require a paid subscription.</p><Link className={`button ${accountStyles.finderButton}`} href="/property-finder/search/">Open administrator Property Finder</Link></>
                : !account.membership.active ? <><p>You are registered, but you do not have an active paid membership. Property Finder listings remain locked.</p><p>Subscription purchasing is not available yet. Creating an account does not start a subscription or charge you.</p><Link className={`button ${accountStyles.finderButton}`} href="/membership/">View membership options</Link></>
                    : account.finderAccess ? <><p>Your membership includes Property Finder access.</p><Link className={`button ${accountStyles.finderButton}`} href="/property-finder/search/">Open Property Finder</Link></>
                        : <p>Your membership is recorded, but member listing access has not been activated yet.</p>}
        </section>
    </div>;
}

export function SignedOutAccount({ message = '' }: { message?: string }) {
    return <AuthLayout embedded title="Welcome back" description="Sign in to manage your account, membership and saved properties.">
        <div className={`${styles.panel} ${layoutStyles.card} ${layoutStyles.prompt}`}>
            {message && <p className={styles.message} role="status">{message}</p>}
            <Link className={`button button--primary ${layoutStyles.primaryAction}`} href="/login/">Sign in</Link>
            <nav className={`${layoutStyles.registration} ${layoutStyles.secondaryLinks}`} aria-label="Account links">
                <Link href="/register/">Create an account</Link>
                <Link href="/membership/">View membership options</Link>
            </nav>
        </div>
    </AuthLayout>;
}
