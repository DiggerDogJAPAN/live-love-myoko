'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { announceSignout, authMessage, authRequest, fetchAccount, refreshSession } from '@/lib/auth/client';
import type { AccountDetails } from '@/lib/auth/types';
import styles from './auth.module.css';
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
    if (loading) return <div className={styles.panel}><p role="status">Checking your account…</p></div>;
    if (!account) return <div className={styles.panel}><p role="status">{message || 'Sign in to manage your account.'}</p><div className={styles.links}><Link href="/login">Sign in</Link><Link href="/register">Create account</Link><Link href="/membership">Membership options</Link></div></div>;
    const administrator = account.role === 'administrator';
    return <>
        {message && <p className={styles.message} role="status">{message}</p>}
        <div className={styles.dashboard}>
            <section className={styles.panel} aria-labelledby="account-details"><h2 id="account-details">Your details</h2>
                <dl className={styles.facts}><dt>Email</dt><dd>{account.user.email}</dd><dt>Email verified</dt><dd>{account.user.verified ? 'Yes' : 'No'}</dd><dt>Account role</dt><dd>{administrator ? 'Administrator' : 'Customer'}</dd></dl>
                <form className={styles.form} onSubmit={updateProfile}><label htmlFor="account-name">Name<input id="account-name" autoComplete="name" maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label><button className="button button--secondary" disabled={busy}>Save name</button></form>
                <div className={styles.links}><Link href="/forgot-password">Reset password</Link><button type="button" className="button button--secondary" onClick={logout} disabled={busy}>Sign out</button></div>
            </section>
            <section className={styles.panel} aria-labelledby="account-membership"><h2 id="account-membership">Your membership</h2>
                <dl className={styles.facts}><dt>Plan</dt><dd>{administrator ? 'Not required' : account.membership.tier ? account.membership.tier === 'premium' ? 'Premium' : 'Basic' : 'No membership'}</dd><dt>Status</dt><dd>{administrator ? 'Administrator access' : account.membership.active ? 'Active' : 'Not active'}</dd>{account.membership.paidThrough && !administrator && <><dt>Paid through</dt><dd>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(account.membership.paidThrough))}</dd></>}</dl>
                {administrator ? <><p>Your administrator role does not require a paid subscription.</p><a className="button button--primary" href="/property-finder/search/">Open administrator Property Finder</a></>
                    : !account.membership.active ? <><p>You are registered, but you do not have an active paid membership. Property Finder listings remain locked.</p><p>Subscription purchasing is not available yet. Creating an account does not start a subscription or charge you.</p><Link className="button button--secondary" href="/membership">View membership options</Link></>
                        : account.finderAccess ? <><p>Your membership includes Property Finder access.</p><a className="button button--primary" href="/property-finder/search/">Open Property Finder</a></>
                            : <p>Your membership is recorded, but member listing access has not been activated yet.</p>}
            </section>
        </div>
    </>;
}
