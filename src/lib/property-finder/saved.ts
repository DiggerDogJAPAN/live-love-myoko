import type { FinderProperty } from './model';
export interface SavedEntry { propertyId: string; savedAt: string; property: FinderProperty | null }
export interface SavedPage { items: SavedEntry[]; total: number; nextCursor: string | null }
export const LISTING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
