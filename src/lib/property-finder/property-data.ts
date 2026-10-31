import { originalListingUrl, propertyTitle, type FinderProperty } from './model';

// The restricted view projects iizuna_akiya_bank through these public attributions.
const sourceAttributions = {
    iizuna_akiya_bank: ['Iizuna Town Akiya Bank', 'Rakuen Shinshu Akiya Bank (Iizuna)'],
};
const PORTAL_SOURCES = ['SUUMO', 'Rakusumu'];

/** Public listing identity and approved geography, independent of image permission. */
function portalListingIdentifier(sourceName: string, listing: string | null, municipality: string | null): string | null {
    if (!listing || !['Myoko', 'Shinano Town'].includes(municipality || '')) return null;
    try {
        const url = new URL(listing);
        if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
        if (sourceName === 'SUUMO' && url.hostname === 'suumo.jp') {
            const match = /^\/(?:chukoikkodate|ikkodate)\/(niigata\/sc_myoko|nagano\/sc_kamiminochigun)\/nc_([0-9]+)\/$/.exec(url.pathname);
            return match && match[1] === (municipality === 'Myoko' ? 'niigata/sc_myoko' : 'nagano/sc_kamiminochigun') ? match[2] : null;
        }
        if (sourceName === 'Rakusumu' && municipality === 'Myoko' && url.hostname === 'www.rakusumu.com') {
            return /^\/sale\/(?:fdetail|detail)\/([0-9]{5}-[0-9]{6})$/.exec(url.pathname)?.[1] || null;
        }
    } catch { /* Malformed links cannot establish permitted image identity. */ }
    return null;
}

function permittedPortalThumbnail(src: string, sourceName: string, title: string | null, listing: string | null, municipality: string | null): FinderProperty['thumbnail'] {
    const identifier = portalListingIdentifier(sourceName, listing, municipality);
    if (!identifier) return null;
    try {
        const url = new URL(src);
        if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
        const query = url.searchParams;
        if (sourceName === 'SUUMO') {
            if (url.hostname !== 'img01.suumo.com' || url.pathname !== '/jj/resizeImage'
                || [...query].length !== 3 || ['src', 'w', 'h'].some(key => query.getAll(key).length !== 1)
                || ['w', 'h'].some(key => !/^[0-9]{1,4}$/.test(query.get(key)!) || Number(query.get(key)) === 0)
                || !new RegExp(`^gazo/bukken/[A-Za-z0-9/_-]+/${identifier}/${identifier}_[0-9]+\\.(?:jpg|jpeg|png)$`, 'i').test(query.get('src')!)) return null;
        } else {
            const agency = identifier.split('-')[0];
            if (url.hostname !== 'www.rakusumu.com'
                || !new RegExp(`^/images/${agency}/${identifier}/img_${identifier}_G_[0-9]+_[A-Za-z0-9]+\\.(?:jpg|jpeg|png)$`, 'i').test(url.pathname)
                || (url.search && ([...query].length !== 1 || query.getAll('u').length !== 1 || !/^[0-9]+$/.test(query.get('u')!)))) return null;
        }
        return { src, alt: title || `${sourceName} property photograph`, permission: 'permitted' };
    } catch { return null; }
}

export interface CustomerViewRow {
    listing_id?: string;
    municipality: string | null;
    property_type: string | null;
    transaction_type: string | null;
    purchase_conditions_ja: string | null;
    title: string | null;
    asking_price_jpy: string | number | null;
    location_en: string | null;
    location_display: string | null;
    location_ja: string | null;
    publication_status: string;
    availability_status: string;
    source_attribution: string;
    original_pdf_url: string | null;
    thumbnail_url: string | null;
    location_needs_review: boolean;
    region_en: string | null;
    region_ja: string | null;
}

/** The restricted view returns null unless the stored image permission is permitted.
 * Only reviewed source/host/path pairs are enabled; unknown sources keep placeholders.
 */
function permittedThumbnail(src: string | null, sourceName: string, title: string | null, listing: string | null, municipality: string | null): FinderProperty['thumbnail'] {
    if (!src) return null;
    if (PORTAL_SOURCES.includes(sourceName)) return permittedPortalThumbnail(src, sourceName, title, listing, municipality);
    const source = new Map([
        ['Joetsu City Akiya Bank', { host: 'joetsu-akiyabank.jp', path: '/wp-content/uploads/' }],
        ['Myoko Akiya Bank', { host: 'www.city.myoko.niigata.jp', path: '/fs/' }],
        ['Shinano Town Akiya Bank', { host: 'shinanomachi-iju.jp', path: '/shinanomachi/wordpress/wp-content/uploads/' }],
        ['Iizuna Town Akiya Bank', { host: 'www.town.iizuna.nagano.jp', path: '/fs/' }],
    ]).get(sourceName);
    if (!source) return null;
    try {
        const url = new URL(src);
        if (url.protocol !== 'https:' || url.hostname !== source.host
            || url.username || url.password || url.port || !url.pathname.startsWith(source.path)
            || !/\.(jpe?g|png|webp)$/i.test(url.pathname)) return null;
        if (sourceName === 'Iizuna Town Akiya Bank' && (url.search || url.hash
            || /[\s\\?#]/.test(decodeURIComponent(url.pathname)))) return null;
        if (sourceName === 'Joetsu City Akiya Bank' && (url.search || url.hash
            || /seiyaku|sold|closed|floor.?plan|madori|間取|平面|地図/i.test(decodeURIComponent(url.pathname)))) return null;
        return { src, alt: title || `${sourceName} property photograph`, permission: 'permitted' };
    } catch {
        return null;
    }
}

export function customerProperty(row: CustomerViewRow): FinderProperty | null {
    if (row.publication_status !== 'active' || row.availability_status !== 'active') return null;
    if (!row.source_attribution.startsWith('Source: ') || !row.source_attribution.slice(8).trim()) throw new Error('Invalid source attribution');
    const sourceName = row.source_attribution.slice(8).trim();
    if (PORTAL_SOURCES.includes(sourceName) && (row.transaction_type !== 'sale' || row.property_type !== 'house'
        || !portalListingIdentifier(sourceName, row.original_pdf_url, row.municipality))) return null;
    // Defence in depth alongside the protected view and RLS predicate.
    if (['Shinano Town Akiya Bank', 'Joetsu City Akiya Bank'].includes(sourceName) && (row.transaction_type !== 'sale'
        || !['house', 'apartment', 'lodge', 'commercial'].includes(row.property_type || ''))) return null;
    const isIizunaSource = sourceAttributions.iizuna_akiya_bank.includes(sourceName);
    if (row.municipality === 'Iizuna Town' && !isIizunaSource) return null;
    if (isIizunaSource) {
        if (row.municipality !== 'Iizuna Town' || row.transaction_type !== 'sale' || row.property_type !== 'house' || !row.original_pdf_url) return null;
        try {
            const url = new URL(row.original_pdf_url);
            const municipal = sourceName === 'Iizuna Town Akiya Bank';
            if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
                || url.hostname !== (municipal ? 'www.town.iizuna.nagano.jp' : 'rakuen-akiya.jp')
                || !(municipal ? /^\/ijuportal\/live\/sale\/[0-9]+\.html$/ : /^\/bukken\/[0-9]+\/$/).test(url.pathname)) return null;
        } catch { return null; }
    }
    const types: Record<string, FinderProperty['propertyType']> = {
        house: 'House', land: 'Land', apartment: 'Apartment', lodge: 'Pension/Lodge',
        commercial: 'Commercial', other: 'Other',
    };
    const english = row.location_en?.trim() || null;
    const needsReview = row.location_needs_review || (!english && Boolean(row.location_ja?.trim()));
    // The review flag can also concern district tags; location_en is verified locality.
    const neighbourhood = english || row.location_ja?.trim() || null;
    const price = row.asking_price_jpy === null ? null : Number(row.asking_price_jpy);
    if (price !== null && (!Number.isSafeInteger(price) || price < 0)) throw new Error('Invalid asking price');
    const property: FinderProperty = {
        ...(row.listing_id ? { id: row.listing_id } : {}),
        title: row.title,
        municipality: row.municipality?.trim() || null,
        area: neighbourhood,
        neighbourhood,
        regionEn: row.region_en,
        regionJa: row.region_ja,
        areaJa: row.location_ja,
        locationNeedsReview: needsReview,
        purchaseConditionsJa: typeof row.purchase_conditions_ja === 'string' && row.purchase_conditions_ja.trim()
            ? row.purchase_conditions_ja : null,
        askingPriceJpy: price,
        availability: 'Available',
        sourceName,
        originalListingUrl: row.original_pdf_url,
        // The view gates thumbnail_url on permitted display rights; no copies are made.
        thumbnail: null,
        propertyType: row.property_type && Object.hasOwn(types, row.property_type) ? types[row.property_type] : null,
        listedAt: null,
    };
    property.title = propertyTitle(property);
    property.thumbnail = permittedThumbnail(row.thumbnail_url, sourceName, property.title, row.original_pdf_url, row.municipality);
    property.originalListingUrl = originalListingUrl(property);
    return property;
}

