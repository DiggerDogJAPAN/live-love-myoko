import { supabaseRpc } from '../auth/supabase';
import { customerProperty, type CustomerViewRow } from './property-data';
import { LISTING_ID, type SavedPage } from './saved';

export async function setSavedProperty(propertyId: string, saved: boolean): Promise<void> {
    if (!LISTING_ID.test(propertyId)) throw new Error('invalid_listing_id');
    const data = await supabaseRpc(saved ? 'finder_save_property' : 'finder_remove_saved_property', { p_property: propertyId });
    if (data.propertyId !== propertyId || data.saved !== saved) throw new Error('saved_properties_unavailable');
}
export async function savedIds(): Promise<{ ids: string[]; userId: string }> {
    const data = await supabaseRpc('finder_saved_ids');
    if (typeof data.userId !== 'string' || !LISTING_ID.test(data.userId)
        || !Array.isArray(data.ids) || data.ids.length > 500 || data.total !== data.ids.length
        || new Set(data.ids).size !== data.ids.length || data.ids.some(id => typeof id !== 'string' || !LISTING_ID.test(id))) throw new Error('saved_properties_unavailable');
    return { ids: data.ids, userId: data.userId };
}
export async function savedPage(cursor: string | null): Promise<SavedPage> {
    const data = await supabaseRpc('finder_saved_page', { p_cursor: cursor });
    if (!Array.isArray(data.items) || data.items.length > 20 || typeof data.total !== 'number' || !Number.isInteger(data.total) || data.total < 0 || data.total > 500
        || !(data.nextCursor === null || (typeof data.nextCursor === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f-]{36}$/i.test(data.nextCursor)))
        || data.items.some(item => !item || !LISTING_ID.test(item.propertyId) || typeof item.savedAt !== 'string' || !Number.isFinite(Date.parse(item.savedAt)))) throw new Error('saved_properties_unavailable');
    try {
        return { total: data.total, nextCursor: data.nextCursor as string | null, items: data.items.map(item => {
            if (item.property === null) return item;
            if (!item.property || item.property.listing_id !== item.propertyId || typeof item.property.source_attribution !== 'string') throw Error();
            return { ...item, property: customerProperty(item.property as CustomerViewRow) };
        }) };
    } catch { throw new Error('saved_properties_unavailable'); }
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
