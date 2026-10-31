'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { AccountDetails } from '@/lib/auth/types';
import { supabaseRpc } from '@/lib/auth/supabase';
import { alertAreas, type AlertArea, type AlertPreferences } from '@/lib/property-finder/alerts';
import styles from './alerts.module.css';
async function alertsRequest(action: 'status' | 'test') {
    const response = await fetch('/api/property-alerts/' + action, { method: action === 'test' ? 'POST' : 'GET',
        credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json', ...(action === 'test' ? { 'Content-Type': 'application/json' } : {}) },
        ...(action === 'test' ? { body: '{}' } : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.code || 'alerts_unavailable');
    return data;
}
export function validatePreferences(data: Record<string, unknown>): AlertPreferences {
    if (typeof data.enabled !== 'boolean' || !Array.isArray(data.areas) || data.areas.length > 4
        || new Set(data.areas).size !== data.areas.length || data.areas.some(a => !alertAreas.some(v => v.id === a))
        || (data.enabled && !data.areas.length) || typeof data.deliveryNeedsReview !== 'boolean') throw Error('alerts_unavailable');
    return data as unknown as AlertPreferences;
}
function messageFor(code: string) {
    if (code === 'alerts_test_rate_limited') return 'Please wait five minutes before sending another test email.';
    if (code === 'alerts_access_denied' || code === 'authentication_required') return 'Please sign in with an eligible account to manage Property Alerts.';
    if (code === 'invalid_alert_preferences') return 'Select at least one area to enable email alerts.';
    return 'Property Alerts is being configured or is temporarily unavailable. Please try again later.';
}
export default function PropertyAlerts({ account }: { account: AccountDetails }) {
    return <section id="property-alerts" className={styles.section} aria-labelledby="property-alerts-heading">
        <p className={styles.eyebrow}>PROPERTY FINDER · PREMIUM</p>
        <h2 id="property-alerts-heading">Property Alerts</h2>
        {account.savedPropertiesAccess === true ? <AlertControls key={account.user.id} administrator={account.role === 'administrator'} />
            : <p className={styles.description}>Property Alerts are included with Premium membership. Get notified when new properties appear in your selected areas.</p>}
    </section>;
}
function AlertControls({ administrator }: { administrator: boolean }) {
    const [preferences, setPreferences] = useState<AlertPreferences | null>(null);
    const [configured, setConfigured] = useState(false), [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(''), [error, setError] = useState('');
    const generation = useRef(0);
    const invalidate = useCallback(() => { generation.current++; }, []);
    const load = useCallback(async () => {
        const current = ++generation.current;
        try {
            const [data, status] = await Promise.all([supabaseRpc('finder_alert_preferences'), alertsRequest('status')]);
            if (current !== generation.current) return;
            setPreferences(validatePreferences(data)); setConfigured(status.configured === true); setError('');
        } catch (e) { if (current === generation.current) { setPreferences(null); setError(messageFor(e instanceof Error ? e.message : '')); } }
    }, []);
    useEffect(() => { const initial = window.setTimeout(() => { void load(); }, 0); return () => { invalidate(); window.clearTimeout(initial); }; }, [load, invalidate]);
    const save = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); if (!preferences || busy) return;
        setMessage(''); setError('');
        if (preferences.enabled && !preferences.areas.length) { setError(messageFor('invalid_alert_preferences')); return; }
        const current = generation.current; setBusy(true);
        try {
            const saved = validatePreferences(await supabaseRpc('finder_set_alert_preferences', { p_enabled: preferences.enabled, p_areas: preferences.areas }));
            if (generation.current === current) { setPreferences(saved); setMessage('Your alert preferences have been saved.'); }
        } catch (e) { if (generation.current === current) setError(messageFor(e instanceof Error ? e.message : '')); }
        finally { if (generation.current === current) setBusy(false); }
    };
    const testEmail = async () => {
        if (busy) return; const current = generation.current; setBusy(true); setError(''); setMessage('');
        try { const result = await alertsRequest('test'); if (current === generation.current) setMessage(result.sent ? 'Test email accepted for delivery to your verified account email address.' : 'No eligible properties are available for a test email, or a test is already being processed.'); }
        catch (e) { if (current === generation.current) setError(messageFor(e instanceof Error ? e.message : '')); }
        finally { if (current === generation.current) setBusy(false); }
    };
    const toggleArea = (area: AlertArea, selected: boolean) => setPreferences(p => p ? { ...p, areas: selected ? [...p.areas, area] : p.areas.filter(a => a !== area) } : p);
    return <>
        <p className={styles.description}>Be the first to know when new properties are listed in your favourite areas. Select your preferred locations and we&apos;ll email you when something new appears.</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {message && <p role="status" className={styles.notice}>{message}</p>}
        {!preferences && !error && <p role="status">Loading your alert preferences…</p>}
        {!preferences && error && <button type="button" className="button button--secondary" onClick={() => { void load(); }}>Try Again</button>}
        {preferences && <form onSubmit={save} className={styles.panel} aria-busy={busy}>
            {!configured && <p className={styles.notice}>Email delivery setup is not complete. Your preferences can be saved, but alerts will not be sent yet.</p>}
            {preferences.deliveryNeedsReview && <p className={styles.error} role="status">A previous delivery needs review before daily alerts can resume. Please contact our team.</p>}
            <fieldset disabled={busy} className={styles.areas}><legend>Your preferred areas</legend>
                {alertAreas.map(area => <label key={area.id}><input type="checkbox" checked={preferences.areas.includes(area.id)} onChange={e => toggleArea(area.id, e.target.checked)} />{area.label}</label>)}
            </fieldset>
            <label className={styles.toggle}><input type="checkbox" role="switch" checked={preferences.enabled} disabled={busy} onChange={e => setPreferences({ ...preferences, enabled: e.target.checked })} />Email me about new properties</label>
            <p className={styles.note}>One daily email, only when new matching properties are found. You can disable emails at any time without changing your membership.</p>
            <div className={styles.actions}><button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Please wait…' : 'Save Preferences'}</button>
                {administrator && <button type="button" className="button button--secondary" disabled={busy || !configured} onClick={() => { void testEmail(); }}>Send Test Email</button>}
            </div>
            {administrator && <p className={styles.note}>Test emails use real current listings and go only to your own verified email address. They do not affect daily alert records.</p>}
        </form>}
    </>;
}
