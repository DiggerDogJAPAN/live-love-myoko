'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { FinderProperty } from '@/lib/property-finder/model';
import PropertyFinderDirectory from './PropertyFinderDirectory';
import styles from './finder.module.css';

type AccessState =
    | { kind: 'loading' | 'locked' | 'error' }
    | { kind: 'ready'; properties: FinderProperty[] };

export default function PropertyFinderAccess() {
    const [state, setState] = useState<AccessState>({ kind: 'loading' });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        let sequence = 0;
        const load = async () => {
            const requestNumber = ++sequence;
            try {
                const response = await fetch('/api/property-finder/properties', {
                    credentials: 'same-origin', cache: 'no-store', redirect: 'manual',
                    headers: { Accept: 'application/json' }, signal: controller.signal,
                });
                if (controller.signal.aborted || requestNumber !== sequence) return;
                // Access may send a sign-in redirect/HTML instead of an API response.
                if ([0, 401, 403].includes(response.status) || !response.headers.get('Content-Type')?.includes('application/json')) {
                    setState({ kind: 'locked' });
                    return;
                }
                if (!response.ok) { setState({ kind: 'error' }); return; }
                const data = await response.json();
                if (controller.signal.aborted || requestNumber !== sequence) return;
                if (!Array.isArray(data.properties) || data.count !== data.properties.length) throw new Error('Unexpected directory response');
                setState({ kind: 'ready', properties: data.properties });
            } catch {
                if (!controller.signal.aborted && requestNumber === sequence) setState({ kind: 'error' });
            }
        };
        void load();
        const refresh = () => { if (document.visibilityState === 'visible') void load(); };
        document.addEventListener('visibilitychange', refresh);
        return () => { controller.abort(); document.removeEventListener('visibilitychange', refresh); };
    }, [attempt]);

    if (state.kind === 'ready') return <PropertyFinderDirectory properties={state.properties} mode="live" />;
    const retry = () => { setState({ kind: 'loading' }); setAttempt((value) => value + 1); };
    return (
        <section className={styles.gated}>
            <div className="layout__container">
                <p className={styles.eyebrow}>Property Finder · Administrator preview</p>
                <span className={styles.gateMark} aria-hidden="true">↗</span>
                <h1>Your next property search.<br /><em>Securely, with local insight.</em></h1>
                <div role="status" aria-live="polite">
                    {state.kind === 'loading' && <p>Checking your directory access…</p>}
                    {state.kind === 'locked' && <><p>Live Property Finder access is currently limited to approved administrators and developers.</p><p>Sign in with your authorized account. Paid membership access will follow in a later phase.</p></>}
                    {state.kind === 'error' && <p>The live directory is not available right now. Please try again later.</p>}
                </div>
                <div className={styles.gatedActions}>
                    {state.kind === 'locked' && <a href="https://love-live-myoko.com/api/property-finder/login" className="button button--primary">Administrator Sign In</a>}
                    {state.kind !== 'loading' && <button type="button" onClick={retry} className="button button--secondary">Check Access Again</button>}
                    <Link href="/property-finder" className="button button--secondary">About Property Finder</Link>
                </div>
                <p className={styles.gateNote}>Our directly handled listings remain open. <Link href="/properties">View Our Properties →</Link></p>
            </div>
        </section>
    );
}
