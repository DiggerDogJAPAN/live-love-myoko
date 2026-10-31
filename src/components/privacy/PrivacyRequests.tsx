'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { supabaseRpc } from '@/lib/auth/supabase';
import { parseRequests, privacyMessage, requestLabel, type PrivacyRequest, type RequestType } from '@/lib/privacy/requests';
import PrivacyRequestsAdmin from './PrivacyRequestsAdmin';
import styles from './privacy.module.css';

export default function PrivacyRequests({ administrator }: { administrator: boolean }) {
    const [requests, setRequests] = useState<PrivacyRequest[]>([]), [loaded, setLoaded] = useState(false);
    const [type, setType] = useState<RequestType>('access'), [details, setDetails] = useState('');
    const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
    const generation = useRef(0), loadSequence = useRef(0), submitting = useRef(false), dialog = useRef<HTMLDialogElement>(null);
    const invalidate = useCallback(() => { generation.current++; }, []);
    const nonce = useRef<{ signature: string; value: string } | null>(null);
    const load = useCallback(async () => {
        const current = generation.current, sequence = ++loadSequence.current;
        try { const rows = parseRequests(await supabaseRpc('finder_privacy_requests'));
            if (current === generation.current && sequence === loadSequence.current) { setRequests(rows); setLoaded(true); setError(''); } }
        catch (e) { if (current === generation.current && sequence === loadSequence.current) setError(privacyMessage(e)); }
    }, []);
    useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => { window.clearTimeout(timer); invalidate(); }; }, [load, invalidate]);
    const submit = async (requestType: RequestType, scope: 'account' | 'personal_data' | null, text: string) => {
        if (submitting.current) return;
        submitting.current = true; setBusy(true); setError(''); setMessage('');
        const current = generation.current, signature = JSON.stringify([requestType, scope, text]);
        if (nonce.current?.signature !== signature) nonce.current = { signature, value: crypto.randomUUID() };
        try {
            await supabaseRpc('finder_privacy_submit', { p_type: requestType, p_scope: scope, p_details: text, p_nonce: nonce.current.value });
            if (current !== generation.current) return;
            nonce.current = null; dialog.current?.close(); setDetails('');
            await load();
            if (current === generation.current) setMessage('Your request has been received. Our team will review it. You can check its status below.');
        } catch (e) { if (current === generation.current) { dialog.current?.close(); await load(); if (current === generation.current) setError(privacyMessage(e)); } }
        finally { submitting.current = false; if (current === generation.current) setBusy(false); }
    };
    const activeDeletion = requests.some(r => r.type === 'deletion' && ['pending', 'in_progress'].includes(r.status));
    const accountRequest = requests.find(r => r.type === 'deletion' && r.scope === 'account');
    return <div className={styles.stack}>
        {message && <p className={styles.notice} role="status">{message}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <section className={styles.panel} aria-labelledby="privacy-requests-heading">
            <h2 id="privacy-requests-heading">Privacy &amp; Data Requests</h2>
            <p>Request access to your personal information, correction, deletion of personal information, or details of how it is collected, used or shared.</p>
            <p>Our team reviews requests according to applicable law. We may need to verify your identity. Some information may need to be retained for legal, accounting, security or dispute-related reasons.</p>
            <form className={styles.form} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void submit(type, type === 'deletion' ? 'personal_data' : null, details); }}>
                <label htmlFor="privacy-type">Request type<select id="privacy-type" value={type} onChange={e => setType(e.target.value as RequestType)} disabled={busy}>
                    <option value="access">Access — a copy of my personal information</option><option value="correction">Correction — update inaccurate information</option>
                    <option value="deletion">Deletion — personal information</option><option value="information">Information — how my information is used</option>
                </select></label>
                <label htmlFor="privacy-details">Details (optional)<textarea id="privacy-details" value={details} onChange={e => setDetails(e.target.value)} maxLength={2000} rows={4} disabled={busy} aria-describedby="privacy-details-help" /></label>
                <p id="privacy-details-help" className={styles.small}>Please avoid passwords, card details, identity documents or unnecessary sensitive information. To close your whole account, use Account Deletion below.</p>
                <button type="submit" className="button button--primary" disabled={busy || (type === 'deletion' && activeDeletion)}>{busy ? 'Submitting…' : 'Submit Privacy Request'}</button>
            </form>
            <h3>Your requests</h3>
            {!loaded && !error && <p role="status">Loading your requests…</p>}
            <button type="button" className="button button--secondary" onClick={() => { void load(); }} disabled={busy}>Refresh Request Status</button>
            {loaded && !requests.length && <p>You have no privacy requests.</p>}
            <ol className={styles.requests}>{requests.map(r => <li key={r.id}>
                <h4>{requestLabel(r)}</h4><p><strong>Status:</strong> {r.status.replace('_', ' ')} · Submitted {new Date(r.submittedAt).toLocaleDateString('en-GB')}</p>
                <p className={styles.small}>Request reference: {r.id}</p>
                {r.details && <p>{r.details}</p>}{r.response && <p><strong>Response:</strong> {r.response}</p>}
                {r.completedAt && <p>Completed or closed: {new Date(r.completedAt).toLocaleDateString('en-GB')}</p>}
            </li>)}</ol>
            <p className={styles.small}>You can also contact <a href="mailto:info@love-live-myoko.com">info@love-live-myoko.com</a>. Read our <Link href="/privacy-policy">Privacy Policy</Link>.</p>
        </section>
        <section className={styles.panel} aria-labelledby="account-deletion-heading">
            <h2 id="account-deletion-heading">Account Deletion</h2>
            <p>Ask our team to close your account and delete personal information that is no longer required. Submitting a request does not immediately delete your account or cancel any subscription.</p>
            <p>We verify the request and review billing, records that must be retained and outstanding email deliveries before processing deletion. Some information may need to be retained where legally necessary.</p>
            {accountRequest && <p><strong>Current account deletion request:</strong> {accountRequest.status.replace('_', ' ')}</p>}
            {activeDeletion && <p>You already have an active deletion request. Its status is listed above. Contact us if you need to clarify its scope.</p>}
            <button type="button" className="button button--secondary" disabled={busy || !loaded || activeDeletion} onClick={() => dialog.current?.showModal()}>Request Account Deletion</button>
            <dialog ref={dialog} className={styles.dialog} aria-labelledby="confirm-deletion-heading">
                <form className={styles.form} onSubmit={e => { e.preventDefault(); void submit('deletion', 'account', ''); }}>
                    <h3 id="confirm-deletion-heading">Request account deletion?</h3>
                    <p>This sends a request for review. Your account will not be deleted now. Identity checks and legally necessary retention may apply.</p>
                    <div className={styles.actions}><button type="button" className="button button--secondary" disabled={busy} onClick={() => dialog.current?.close()}>Keep My Account</button>
                        <button type="submit" className="button button--primary" disabled={busy}>Confirm Deletion Request</button></div>
                </form>
            </dialog>
        </section>
        {administrator && <PrivacyRequestsAdmin />}
    </div>;
}
