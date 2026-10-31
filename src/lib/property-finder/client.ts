import { supabaseRpc } from '../auth/supabase';
import { customerProperty, type CustomerViewRow } from './property-data';
import type { FinderProperty } from './model';

/** Same bounded snapshot and client filters/sorting/pagination as before. */
export async function fetchFinderProperties(signal?: AbortSignal): Promise<FinderProperty[]> {
    const data = await supabaseRpc('finder_properties', {}, signal);
    if (!Array.isArray(data.rows) || data.rows.length > 500 || data.count !== data.rows.length) throw new Error('directory_unavailable');
    try { return data.rows.map(row => customerProperty(row as CustomerViewRow)).filter((p): p is FinderProperty => p !== null); }
    catch { throw new Error('directory_unavailable'); }
}
