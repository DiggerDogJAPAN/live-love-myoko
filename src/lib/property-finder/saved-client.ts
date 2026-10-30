import { refreshSession } from '../auth/client';
import { LISTING_ID, type SavedPage } from './saved';

export async function savedRequest(path = '', method: 'GET' | 'PUT' | 'DELETE' = 'GET'): Promise<Record<string, unknown>> {
    const run = () => fetch('/api/property-finder/saved-properties' + path, {
        method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' },
    });
    let response = await run();
    if (response.status === 401) { await refreshSession(); response = await run(); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.code === 'string' ? data.code : 'saved_properties_unavailable');
    return data;
}
export async function savedIds(): Promise<string[]> {
    const data = await savedRequest('/ids');
    if (!Array.isArray(data.ids) || data.ids.length > 500 || data.ids.some(id => typeof id !== 'string' || !LISTING_ID.test(id))) throw new Error('saved_properties_unavailable');
    return data.ids;
}
export async function savedPage(cursor: string | null): Promise<SavedPage> {
    const data = await savedRequest(cursor ? '?cursor=' + encodeURIComponent(cursor) : '');
    if (!Array.isArray(data.items) || data.items.length > 20 || typeof data.total !== 'number' || data.total < 0 || data.total > 500
        || !(data.nextCursor === null || typeof data.nextCursor === 'string')
        || data.items.some(item => !item || !LISTING_ID.test(item.propertyId) || typeof item.savedAt !== 'string'
            || !(item.property === null || (item.property?.id === item.propertyId && typeof item.property?.sourceName === 'string')))) throw new Error('saved_properties_unavailable');
    return data as unknown as SavedPage;
}
export function savedError(code: string): string {
    const messages: Record<string, string> = {
        saved_properties_unavailable: 'Saved Properties is temporarily unavailable. Please try again.',
        saved_rate_limited: 'Please wait a minute before changing or reloading your saved properties.',
        saved_limit_reached: 'You can save up to 500 properties. Remove one before saving another.',
        saved_listing_unavailable: 'This listing is no longer available to save. Refresh the directory for current listings.',
        authentication_required: 'Please sign in again to use Saved Properties.',
        active_membership_required: 'Saved Properties requires an active Premium membership.',
        membership_upgrade_required: 'Saved Properties requires a Premium membership.',
        customer_access_disabled: 'Member listing access has not been activated yet.',
        saved_access_denied: 'Your Saved Properties access has changed. Please sign in again.',
    };
    return messages[code] || messages.saved_properties_unavailable;
}

/** Optimistic presentation only; the server always decides permission/ownership. */
export async function optimisticSave(previous: boolean, update: (saved: boolean) => void, write: () => Promise<unknown>, isCurrent: () => boolean): Promise<void> {
    update(!previous);
    try { await write(); }
    catch (error) { if (isCurrent()) update(previous); throw error; }
}
