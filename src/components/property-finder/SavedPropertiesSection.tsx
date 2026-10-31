'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { AccountDetails } from '@/lib/auth/types';
import { savedError, savedPage } from '@/lib/property-finder/saved-client';
import type { SavedEntry } from '@/lib/property-finder/saved';
import { Heart, SavePropertyButton, SavedPropertiesProvider, SavedPropertiesStatus, useSavedProperties } from './SavedPropertiesProvider';
import PropertyFinderCard from './PropertyFinderCard';
import finderStyles from './finder.module.css';
import styles from './saved.module.css';

export default function SavedPropertiesSection({ account }: { account: AccountDetails }) {
    return <section className={styles.section} aria-labelledby="account-saved-properties">
        {account.savedPropertiesAccess === true ? <SavedPropertiesProvider account={account}><SavedList /></SavedPropertiesProvider> : <><SavedPropertiesHeader /><div className={styles.empty}>
            <p>Save your favourite properties and access them anytime with a Premium membership.</p>
            {account.membership.tier === 'premium' && account.membership.active && !account.paidAccessEnabled && <p>Member listing access has not been activated yet. Your saved properties remain private.</p>}
            <Link href="/membership" className="button button--secondary">Explore Premium Membership</Link>
        </div></>}
    </section>;
}
function SavedList() {
    const state = useSavedProperties()!;
    const [entries, setEntries] = useState<SavedEntry[]>([]), [cursor, setCursor] = useState<string | null>(null);
    const [busy, setBusy] = useState(true), [error, setError] = useState('');
    const generation = useRef(0), inFlight = useRef(false);
    const invalidate = useCallback(() => { generation.current++; }, []);
    const load = useCallback(async (after: string | null = null) => {
        if (after && inFlight.current) return;
        const current = ++generation.current; inFlight.current = true; setBusy(true); setError('');
        try {
            const page = await savedPage(after);
            if (current !== generation.current) return;
            setEntries(previous => after ? [...new Map([...previous, ...page.items].map(item => [item.propertyId, item])).values()] : page.items);
            setCursor(page.nextCursor);
        } catch (e) { if (current === generation.current) { setEntries([]); setCursor(null); setError(savedError(e instanceof Error ? e.message : 'saved_properties_unavailable')); } }
        finally { if (current === generation.current) { setBusy(false); inFlight.current = false; } }
    }, []);
    useEffect(() => {
        if (!state.ready || !state.available) return;
        const initial = window.setTimeout(() => { void load(); }, 0);
        const refresh = () => { void load(); };
        const visible = () => { if (document.visibilityState === 'visible') refresh(); };
        const clear = () => { generation.current++; setEntries([]); setCursor(null); setBusy(false); };
        const channel = 'BroadcastChannel' in window ? new BroadcastChannel('llm-saved') : null;
        if (channel) channel.onmessage = event => { if (event.data === 'changed') refresh(); };
        window.addEventListener('llm-saved-changed', refresh); window.addEventListener('llm-signout', clear); document.addEventListener('visibilitychange', visible);
        return () => { invalidate(); window.clearTimeout(initial); channel?.close(); window.removeEventListener('llm-saved-changed', refresh); window.removeEventListener('llm-signout', clear); document.removeEventListener('visibilitychange', visible); };
    }, [state.ready, state.available, load, invalidate]);
    return <>
        <SavedPropertiesHeader count={state.ready && state.available ? state.ids.size : undefined} />
        <SavedPropertiesStatus />
        {((!state.ready && !state.error) || (state.ready && busy)) && <p role="status">Loading your saved properties…</p>}
        {error && <div className={styles.feedback} role="alert"><p>{error}</p><button type="button" className="button button--secondary" onClick={() => { void load(); }}>Try Again</button></div>}
        {state.ready && state.available && !error && <>
            {!busy && state.ids.size === 0 && <div className={styles.empty}><span className={styles.heart}><Heart filled={false} /></span><h3>Your next discovery is waiting.</h3><p>Tap the heart on a Finder listing to save it here.</p><Link className="button button--primary" href="/property-finder/search/">Explore Property Finder</Link></div>}
            <div className={finderStyles.resultsGrid}>{entries.filter(entry => state.ids.has(entry.propertyId)).map(entry => entry.property
                ? <PropertyFinderCard key={entry.propertyId} property={entry.property} savedList />
                : <article key={entry.propertyId} className={styles.unavailable}><h3>Listing no longer available</h3><p>This saved listing is no longer eligible for display. Its previous details are not shown.</p><p>Saved {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(entry.savedAt))}</p><SavePropertyButton propertyId={entry.propertyId} title="unavailable listing" removeLabel /></article>)}</div>
            {cursor && <div className={styles.more}><button type="button" className="button button--secondary" disabled={busy} onClick={() => { void load(cursor); }}>Load More Saved Properties</button></div>}
        </>}
    </>;
}

export function SavedPropertiesHeader({ count }: { count?: number }) {
    return <header className={styles.header}>
        <div><p className={styles.eyebrow}>PROPERTY FINDER · PREMIUM</p><div className={styles.titleRow}><h2 id="account-saved-properties">Saved Properties</h2>
            {count !== undefined && <span className={styles.count} role="status" aria-live="polite">{count} saved {count === 1 ? 'property' : 'properties'}</span>}
        </div></div>
        <Link href="/property-finder/search/" className="button button--secondary">Open Property Finder</Link>
    </header>;
}
