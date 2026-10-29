'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authMessage, authRequest } from '@/lib/auth/client';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, registrationFullName } from '@/lib/auth/validation';
import styles from './auth.module.css';
export type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'verify';
const labels = { login: 'Sign in', register: 'Create account', forgot: 'Send reset link', reset: 'Set new password', verify: 'Verify email' };
export default function AuthForm({ mode }: { mode: AuthMode }) {
    const router = useRouter();
    const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [name, setName] = useState(''), [token, setToken] = useState('');
    const [enabled, setEnabled] = useState(false), [google, setGoogle] = useState(false), [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(''), [error, setError] = useState('');
    useEffect(() => {
        let alive = true;
        const linkExpired = Boolean(window.location.hash) || new URLSearchParams(window.location.search).get('error') === 'link_expired';
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
        authRequest('config').then(config => { if (alive) { setEnabled(config.enabled === true); setGoogle(config.googleEnabled === true); if (!config.enabled) setMessage(authMessage('authentication_not_configured')); if (linkExpired) setError(authMessage('link_expired')); } }).catch(() => { if (alive) setError(authMessage(linkExpired ? 'link_expired' : 'authentication_unavailable')); });
        return () => { alive = false; };
    }, []);
    const run = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); setError(''); setMessage('');
        const fullName = registrationFullName(name);
        if (mode === 'register') {
            if (!fullName) { setError(authMessage('invalid_name')); return; }
            setName(fullName);
        }
        if ((mode === 'register' || mode === 'reset') && password.length < MIN_PASSWORD_LENGTH) { setError(authMessage('invalid_password')); return; }
        if (['login', 'register', 'reset'].includes(mode) && password.length > MAX_PASSWORD_LENGTH) { setError(authMessage('password_too_long')); return; }
        if ((mode === 'register' || mode === 'reset') && password !== confirm) { setError('The passwords do not match.'); return; }
        setBusy(true);
        try {
            const action = mode === 'forgot' ? 'recover' : mode === 'reset' ? 'password' : mode === 'verify' ? 'verify-email' : mode;
            const body = mode === 'login' ? { email, password } : mode === 'register' ? { email, password, name: fullName } : mode === 'reset' ? { password } : mode === 'verify' ? { email, token } : { email };
            await authRequest(action, body); setPassword(''); setConfirm(''); setToken('');
            if (mode === 'login' || mode === 'verify') router.replace('/account/');
            else if (mode === 'reset') { setMessage('Your password has been updated. Sign in with your new password.'); }
            else setMessage('If this address can receive account emails, please check your inbox. Open the latest link in this browser within 15 minutes.');
        } catch (e) { setError(authMessage(e instanceof Error ? e.message : 'authentication_unavailable')); }
        finally { setBusy(false); }
    };
    const googleLogin = async () => {
        setBusy(true); setError('');
        try { const result = await authRequest('google', {}); if (typeof result.redirect !== 'string') throw Error(); window.location.assign(result.redirect); }
        catch { setError(authMessage('google_not_configured')); setBusy(false); }
    };
    const resend = async () => { setBusy(true); setError(''); try { await authRequest('resend', { email }); setMessage('If verification is available for this address, please check your inbox. Open the latest link in this browser within 15 minutes.'); } catch (e) { setError(authMessage(e instanceof Error ? e.message : 'authentication_unavailable')); } finally { setBusy(false); } };
    return <div className={styles.panel}>
        {mode === 'register' && <p className={styles.note}>Creating an account does not provide Property Finder access. Membership purchasing will be added in a later phase.</p>}
        {mode === 'reset' && <p>Use the password reset link emailed to you. Links must be opened in the browser where you requested them.</p>}
        {message && <p className={styles.message} role="status">{message}</p>}
        {error && <p className={`${styles.message} ${styles.error}`} role="alert">{error}</p>}
        <form className={styles.form} onSubmit={run}>
            {mode === 'register' && <label htmlFor="auth-name">Full Name<input id="auth-name" autoComplete="name" maxLength={80} required value={name} onChange={e => setName(e.target.value)} onBlur={() => setName(name.trim())} /></label>}
            {mode !== 'reset' && <label htmlFor="auth-email">Email address<input id="auth-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} /></label>}
            {['login', 'register', 'reset'].includes(mode) && <label htmlFor="auth-password">{mode === 'reset' ? 'New password' : 'Password'}<input id="auth-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_LENGTH} required value={password} onChange={e => setPassword(e.target.value)} aria-describedby={mode !== 'login' ? 'password-policy' : undefined} /></label>}
            {(mode === 'register' || mode === 'reset') && <><p className={styles.note} id="password-policy">Must be 8 characters or more.</p><label htmlFor="auth-confirm">Confirm password<input id="auth-confirm" type="password" autoComplete="new-password" maxLength={MAX_PASSWORD_LENGTH} required value={confirm} onChange={e => setConfirm(e.target.value)} /></label></>}
            {mode === 'verify' && <label htmlFor="auth-code">Email verification code<input id="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" maxLength={10} required value={token} onChange={e => setToken(e.target.value)} /><span className={styles.note}>If your email contains a code, enter it here. Otherwise, open its verification link in the original browser.</span></label>}
            <button type="submit" className="button button--primary" disabled={!enabled || busy}>{busy ? 'Please wait…' : labels[mode]}</button>
        </form>
        {(mode === 'login' || mode === 'register') && google && <button type="button" className={`button button--secondary ${styles.google}`} disabled={busy} onClick={googleLogin}>Continue with Google</button>}
        {mode === 'verify' && <button type="button" className={`button button--secondary ${styles.google}`} disabled={!enabled || busy || !email} onClick={resend}>Resend verification email</button>}
        <nav className={styles.links} aria-label="Account links"><Link href="/login">Sign in</Link><Link href="/register">Create account</Link><Link href="/forgot-password">Reset password</Link><Link href="/verify-email">Verify email</Link><Link href="/membership">Membership options</Link></nav>
        <p className={styles.note}>Administrator permissions are managed securely by our team.</p>
    </div>;
}
