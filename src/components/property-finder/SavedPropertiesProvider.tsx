'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { fetchAccount } from '@/lib/auth/client';
import type { AccountDetails } from '@/lib/auth/types';
import { optimisticSave, savedError, savedIds, savedRequest } from '@/lib/property-finder/saved-client';
import { LISTING_ID } from '@/lib/property-finder/saved';
import styles from './saved.module.css';

interface SavedState {
    ids: Set<string>; pending: Set<string>; ready: boolean; available: boolean; error: string;
    toggle: (id: string) => Promise<void>; reload: () => void;
}
const SavedContext = createContext<SavedState | null>(null);
export function useSavedProperties() { return useContext(SavedContext); }
export function SavedPropertiesProvider({ children, account, enabled = true }: { children: ReactNode; account?: AccountDetails; enabled?: boolean }) {
    const [ids, setIds] = useState(new Set<string>()), [pending, setPending] = useState(new Set<string>());
    const [ready, setReady] = useState(false), [available, setAvailable] = useState(false), [error, setError] = useState('');
    const owner = useRef<string | null>(null);
    const generation = useRef(0), locks = useRef(new Set<string>()), values = useRef(new Set<string>());
    const invalidate = useCallback(() => { generation.current++; }, []);
    const reload = useCallback(async () => {
        if (!enabled || locks.current.size) return;
        const current = ++generation.current;
        try {
            const details = account || await fetchAccount();
            if (current !== generation.current) return;
            if (owner.current !== details.user.id) {
                owner.current = details.user.id; values.current.clear(); setIds(new Set()); setReady(false);
            }
            const access = details.savedPropertiesAccess === true;
            setAvailable(access);
            const result = access ? await savedIds() : [];
            if (current !== generation.current || locks.current.size) return;
            values.current = new Set(result); setIds(new Set(result)); setReady(true); setError('');
        } catch (e) {
            if (current !== generation.current) return;
            values.current.clear(); setIds(new Set()); setReady(false); setError(savedError(e instanceof Error ? e.message : 'saved_properties_unavailable'));
        }
    }, [account, enabled]);
    useEffect(() => {
        const initial = window.setTimeout(() => { void reload(); }, 0);
        const clear = () => { generation.current++; owner.current = null; locks.current.clear(); values.current.clear(); setPending(new Set()); setIds(new Set()); setReady(false); setAvailable(false); setError(''); };
        const visible = () => { if (document.visibilityState === 'visible') void reload(); };
        const pageshow = (event: PageTransitionEvent) => { if (event.persisted) { clear(); void reload(); } };
        const changed = () => { void reload(); };
        const auth = 'BroadcastChannel' in window ? new BroadcastChannel('llm-auth') : null;
        const saves = 'BroadcastChannel' in window ? new BroadcastChannel('llm-saved') : null;
        if (auth) auth.onmessage = event => { if (event.data === 'signed-out') clear(); };
        if (saves) saves.onmessage = event => { if (event.data === 'changed') void reload(); };
        window.addEventListener('llm-signout', clear); window.addEventListener('llm-saved-changed', changed); window.addEventListener('pageshow', pageshow); document.addEventListener('visibilitychange', visible);
        return () => { invalidate(); window.clearTimeout(initial); auth?.close(); saves?.close(); window.removeEventListener('llm-signout', clear); window.removeEventListener('llm-saved-changed', changed); window.removeEventListener('pageshow', pageshow); document.removeEventListener('visibilitychange', visible); };
    }, [reload, invalidate]);
    const toggle = async (id: string) => {
        if (!LISTING_ID.test(id) || !ready || !available || locks.current.size > 0) return;
        // Invalidate any in-flight reload before changing the optimistic state.
        const current = ++generation.current, previous = values.current.has(id);
        locks.current.add(id); setPending(new Set(locks.current)); setError('');
        const update = (saved: boolean) => {
            if (saved) values.current.add(id); else values.current.delete(id);
            setIds(new Set(values.current));
        };
        let succeeded = false;
        try {
            await optimisticSave(previous, update, () => savedRequest('/' + id, previous ? 'DELETE' : 'PUT'), () => current === generation.current);
            succeeded = true;
        } catch (e) {
            if (current !== generation.current) return;
            setError(savedError(e instanceof Error ? e.message : 'saved_properties_unavailable'));
        } finally {
            if (current === generation.current) {
                locks.current.delete(id);
                setPending(new Set(locks.current));
                if (succeeded) {
                    window.dispatchEvent(new Event('llm-saved-changed'));
                    if ('BroadcastChannel' in window) { const channel = new BroadcastChannel('llm-saved'); channel.postMessage('changed'); channel.close(); }
                }
            }
        }
    };
    return <SavedContext.Provider value={{ ids, pending, ready, available, error, toggle, reload: () => { void reload(); } }}>{children}</SavedContext.Provider>;
}
export function SavedPropertiesStatus() {
    const state = useSavedProperties();
    if (!state?.error) return null;
    return <div className={styles.feedback} role="alert"><p>{state.error}</p>{!state.ready && <button type="button" className="button button--secondary" onClick={state.reload}>Try Saved Properties Again</button>}</div>;
}
export function SavePropertyButton({ propertyId, title, removeLabel = false }: { propertyId: string; title: string; removeLabel?: boolean }) {
    const state = useSavedProperties();
    if (!state || !LISTING_ID.test(propertyId)) return null;
    if (state.ready && !state.available) return <Link className={styles.saveButton} href="/membership" aria-label={`Save ${title} with Premium`}><Heart filled={false} /></Link>;
    const saved = state.ids.has(propertyId), busy = state.pending.has(propertyId);
    return <button type="button" className={`${styles.saveButton} ${removeLabel ? styles.removeButton : ''}`} aria-pressed={saved} aria-busy={busy}
        disabled={!state.ready || state.pending.size > 0} onClick={() => { void state.toggle(propertyId); }} aria-label={saved ? `Remove ${title} from Saved Properties` : `Save ${title}`}>
        <Heart filled={saved} />{removeLabel && <span>{busy ? 'Removing…' : 'Remove from Saved'}</span>}
    </button>;
}
function Heart({ filled }: { filled: boolean }) {
    return <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>;
}
