'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseRpc } from '@/lib/auth/supabase';
import { parseAdminRequests, privacyMessage, requestLabel, requestStatuses, type AdminPrivacyRequest, type RequestStatus } from '@/lib/privacy/requests';
import styles from './privacy.module.css';

export default function PrivacyRequestsAdmin() {
    const [rows, setRows] = useState<AdminPrivacyRequest[]>([]), [status, setStatus] = useState('pending'), [offset, setOffset] = useState(0);
    const [error, setError] = useState(''), [loading, setLoading] = useState(false);
    const generation = useRef(0);
    const invalidate = useCallback(() => { generation.current++; }, []);
    const load = useCallback(async () => {
        const current = ++generation.current; setLoading(true);
        try { const result = parseAdminRequests(await supabaseRpc('finder_privacy_admin_requests', { p_status: status || null, p_offset: offset }));
            if (current === generation.current) { setRows(result); setError(''); } }
        catch (e) { if (current === generation.current) { setRows([]); setError(privacyMessage(e)); } }
        finally { if (current === generation.current) setLoading(false); }
    }, [status, offset]);
    useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => { window.clearTimeout(timer); invalidate(); }; }, [load, invalidate]);
    return <section className={styles.panel} aria-labelledby="admin-privacy-heading">
        <h2 id="admin-privacy-heading">Privacy Requests — Administrator</h2>
        <p>Review requests, verify identity and record actions taken. Internal response target: 30 days, subject to applicable law and any shorter deadline. Check the relevant deadline for every request.</p>
        <p className={styles.small}>Notes are private to administrators. The response field is visible to the customer. Keep records factual and avoid unnecessary personal information. After saving a status change, select the corresponding filter to continue processing the request.</p>
        <label htmlFor="admin-privacy-filter">Request status<select className={styles.filter} id="admin-privacy-filter" value={status} onChange={e => { setOffset(0); setStatus(e.target.value); }}>
            <option value="">All statuses</option>{requestStatuses.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {loading && <p role="status">Loading requests…</p>}
        <div className={styles.actions}><button type="button" className="button button--secondary" disabled={loading} onClick={() => { void load(); }}>Refresh Queue</button>
            <button type="button" className="button button--secondary" disabled={loading || offset === 0} onClick={() => setOffset(n => Math.max(0, n - 50))}>Previous</button>
            <button type="button" className="button button--secondary" disabled={loading || rows.length < 50} onClick={() => setOffset(n => n + 50)}>Next</button></div>
        {!loading && !error && !rows.length && <p>No requests in this view.</p>}
        {rows.map(row => <AdminCase key={`${row.id}-${row.updatedAt}`} row={row} onUpdated={load} />)}
    </section>;
}

export function AdminCase({ row, onUpdated }: { row: AdminPrivacyRequest; onUpdated: () => Promise<void> }) {
    const [status, setStatus] = useState<RequestStatus>(row.status), [notes, setNotes] = useState(row.adminNotes), [response, setResponse] = useState(row.response);
    const [verified, setVerified] = useState(!!row.identityVerifiedAt), [reviewed, setReviewed] = useState(!!row.retentionReviewedAt), [hold, setHold] = useState(row.legalHold);
    const [confirmation, setConfirmation] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
    const alive = useRef(true), running = useRef(false);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const run = async (operation: () => Promise<void>) => {
        if (running.current) return;
        running.current = true; setBusy(true); setError(''); setMessage('');
        try { await operation(); }
        catch (e) { if (alive.current) setError(privacyMessage(e)); }
        finally { running.current = false; if (alive.current) setBusy(false); }
    };
    const save = () => run(async () => {
        await supabaseRpc('finder_privacy_admin_update', { p_id: row.id, p_status: status, p_notes: notes, p_response: response,
            p_verified: verified, p_retention_reviewed: reviewed, p_hold: hold, p_expected_updated_at: row.updatedAt });
        if (alive.current) { setMessage('Review saved.'); await onUpdated(); }
    });
    const download = () => {
        if (!window.confirm('Confirm the requester’s identity before downloading. This file contains personal information. Store it securely outside the website/repository and review it before release.')) return;
        void run(async () => {
            const result = await supabaseRpc('finder_privacy_admin_export', { p_id: row.id });
            if (!alive.current) return;
            const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = `privacy-export-${row.id}.json`;
            document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage('Export downloaded locally. Verify and redact where required before securely releasing it to the requester.');
        });
    };
    const expectedConfirmation = `DELETE ${row.userId} FOR ${row.id}`;
    const deleteAccount = () => {
        if (!window.confirm(`Permanently delete account ${row.userId} for request ${row.id}? This cannot be undone. Continue only after identity, billing and retention review.`)) return;
        void run(async () => { await supabaseRpc('finder_privacy_admin_delete_account', { p_id: row.id, p_confirmation: confirmation });
            if (alive.current) { setMessage('Account deletion completed. A minimal case record remains.'); await onUpdated(); } });
    };
    const accountDeletion = row.type === 'deletion' && row.scope === 'account';
    return <details className={styles.case}>
        <summary>{new Date(row.submittedAt).toLocaleDateString('en-GB')} · {requestLabel(row)} · {row.status.replace('_', ' ')}</summary>
        <p className={styles.small}>Request: {row.id}<br />Account: {row.userId || 'Removed — minimal case record'}</p>
        {row.details && <p><strong>Details:</strong> {row.details}</p>}
        {row.completedAt && <p>Completed or closed: {new Date(row.completedAt).toLocaleString('en-GB')}</p>}
        {row.accountDeletedAt && <p>Account deleted: {new Date(row.accountDeletedAt).toLocaleString('en-GB')}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.notice} role="status">{message}</p>}
        <form className={styles.form} onSubmit={e => { e.preventDefault(); void save(); }}>
            <label htmlFor={`${row.id}-status`}>Status<select id={`${row.id}-status`} value={status} onChange={e => setStatus(e.target.value as RequestStatus)} disabled={busy || !row.userId}>
                {requestStatuses.map(s => <option key={s} value={s} disabled={s === 'completed' && accountDeletion}>{s.replace('_', ' ')}</option>)}
            </select></label>
            <label htmlFor={`${row.id}-notes`}>Administrator notes / actions taken<textarea id={`${row.id}-notes`} value={notes} onChange={e => setNotes(e.target.value)} maxLength={4000} rows={4} disabled={busy || !row.userId} /></label>
            <label htmlFor={`${row.id}-response`}>Customer-visible response / rejection reason<textarea id={`${row.id}-response`} value={response} onChange={e => setResponse(e.target.value)} maxLength={2000} rows={3} disabled={busy || !row.userId} /></label>
            <label className={styles.check}><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} disabled={busy || !row.userId} />I verified this requester’s identity.</label>
            <label className={styles.check}><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} disabled={busy || !row.userId} />I reviewed external records, billing and legally necessary retention, and protected any required records.</label>
            <label className={styles.check}><input type="checkbox" checked={hold} onChange={e => setHold(e.target.checked)} disabled={busy || !row.userId} />Retain this account’s alert history for an unresolved investigation or legal obligation.</label>
            <button type="submit" className="button button--primary" disabled={busy || !row.userId}>Save Review</button>
        </form>
        <p className={styles.small}>Save identity verification and set the request to in progress before export. Account deletion also needs a recent retention review and recorded actions. Review flags older than seven days must be cleared and saved, then reverified and saved.</p>
        <button type="button" className="button button--secondary" onClick={download} disabled={busy || !row.userId || row.status !== 'in_progress' || !row.identityVerifiedAt || !['access', 'deletion'].includes(row.type)}>Download Individual JSON Export</button>
        {accountDeletion && row.userId && <div className={styles.form}>
            <h3>Verified account deletion</h3>
            <p>This removes the selected Auth account and its linked records. Administrator accounts, retention holds, unresolved billing and pending/uncertain email deliveries block deletion.</p>
            <p className={styles.confirmation}>Type exactly: <code>{expectedConfirmation}</code></p>
            <label htmlFor={`${row.id}-confirm`}>Deletion confirmation<input id={`${row.id}-confirm`} autoComplete="off" maxLength={100} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} /></label>
            <button type="button" className="button button--secondary" onClick={deleteAccount} disabled={busy || row.status !== 'in_progress' || !row.identityVerifiedAt || !row.retentionReviewedAt || row.legalHold || confirmation !== expectedConfirmation}>Delete Verified Account</button>
        </div>}
    </details>;
}
