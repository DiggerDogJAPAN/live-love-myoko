/** Customer-facing display fields only. No crawler IDs, raw labels or credentials.
 * A future authenticated backend must project and authorize records before delivery.
 * Neither a browser flag nor this model is an entitlement/eligibility check.
 */
export const finderMunicipalities = ['Myoko', 'Shinano', 'Joetsu', 'Iizuna Town'] as const;

export interface FinderProperty {
    title: string | null;
    municipality: string | null;
    /** Visitor-facing area; source neighbourhoods are retained separately. */
    area: string | null;
    neighbourhood?: string | null;
    regionEn?: string | null;
    regionJa?: string | null;
    /** Source Japanese is retained separately from the English display/filter value. */
    areaJa?: string | null;
    locationNeedsReview?: boolean;
    /** Public source disclosure, preserved in Japanese; never private source_facts. */
    purchaseConditionsJa: string | null;
    askingPriceJpy: number | null;
    propertyType: 'House' | 'Land' | 'Apartment' | 'Lodge' | 'Pension/Lodge' | 'Commercial' | 'Other' | null;
    availability: 'Available' | 'Under negotiation' | 'Unavailable' | 'Unknown';
    sourceName: string;
    /** Must be the property's original listing, never a source homepage. */
    originalListingUrl: string | null;
    /** Set only when image reuse permission has been verified by the backend. */
    thumbnail: { src: string; alt: string; permission: 'permitted' } | null;
    /** Actual listing/publication date, not crawler last_checked_at. */
    listedAt: string | null;
}

/** A failed URL stays a placeholder until this card receives a different source URL. */
export function visibleThumbnail(thumbnail: FinderProperty['thumbnail'], failedSrc: string | null): FinderProperty['thumbnail'] {
    return thumbnail?.permission === 'permitted' && thumbnail.src !== failedSrc ? thumbnail : null;
}

/** Keep stored municipality names intact; shorten only for visitors. */
export function municipalityLabel(value: string | null): string | null {
    const name = value?.trim() || null;
    return name === 'Shinano Town' ? 'Shinano' : name === 'Iizuna Town' ? 'Iizuna' : name;
}

// Restore the reviewed Myoko-bank grouping from commit 784d763. Other sources'
// district tags are deliberately not interpreted as display-area prefixes.
const MYOKO_SOURCE_AREAS = new Map([
    ['Arai', 'Arai'], ['新井', 'Arai'],
    ['Myoko Kogen', 'Myoko Kogen'], ['妙高高原', 'Myoko Kogen'],
    ['Myoko', 'Myoko'], ['妙高', 'Myoko'],
]);

function sourceDisplayArea(property: FinderProperty): string | null {
    if (property.sourceName !== 'Myoko Akiya Bank' || !['Myoko', 'Myoko City'].includes(property.municipality || '')) return null;
    const english = MYOKO_SOURCE_AREAS.get(property.regionEn?.trim() || '');
    const japanese = MYOKO_SOURCE_AREAS.get(property.regionJa?.trim() || '');
    if (english && japanese && english !== japanese) return null;
    return english || japanese || null;
}

function locationLabel(property: FinderProperty, area: string | null): string {
    const value = property.neighbourhood ?? (property.locationNeedsReview ? property.areaJa : property.area);
    const neighbourhood = typeof value === 'string' ? value.trim() : '';
    const valid = neighbourhood && !/^(unknown|undefined|null|n[/.]?a|not (provided|available))$/i.test(neighbourhood)
        && !/[<>()[\]{}]/.test(neighbourhood);
    if (!valid) return area || '';
    if (!area) return neighbourhood;
    if ([area, property.municipality].some(name => name?.trim().toLowerCase() === neighbourhood.toLowerCase())) return area;
    return `${area} (${neighbourhood})`;
}

/** Display area for cards, titles, image descriptions and enquiries. */
export function propertyLocation(property: FinderProperty): string {
    return locationLabel(property, sourceDisplayArea(property) || municipalityLabel(property.municipality));
}

/** Stable filter value: changing a geographic label never changes stored selections. */
export function propertyArea(property: FinderProperty): string | null {
    return locationLabel(property, municipalityLabel(property.municipality)) || null;
}

export function propertyDisplayArea(property: FinderProperty): string | null {
    return propertyLocation(property) || null;
}

export function propertyTitle(property: FinderProperty): string {
    const location = propertyLocation(property);
    return location ? `Property in ${location}` : property.title || 'Property listing';
}

export function formatPrice(price: number | null): string {
    if (price === null) return 'Price not provided';
    return `¥${new Intl.NumberFormat('en-US').format(price)}`;
}

export function originalListingUrl(property: FinderProperty): string | null {
    if (!property.originalListingUrl) return null;
    try {
        const url = new URL(property.originalListingUrl);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
        // Reject generic homepages. The backend must verify property-specific provenance.
        if (!url.pathname.replace(/\//g, '')) return null;
        return url.href;
    } catch {
        return null;
    }
}

export function enquiryMailto(property: FinderProperty): string {
    const title = propertyTitle(property);
    const location = propertyLocation(property);
    const original = originalListingUrl(property);
    const details = [
        `Property: ${title}`,
        property.askingPriceJpy !== null ? `Price: ${formatPrice(property.askingPriceJpy)}` : null,
        location ? `Area: ${location}` : null,
        property.purchaseConditionsJa ? `Source conditions (Japanese):\n${property.purchaseConditionsJa}` : null,
        property.sourceName ? `Source: ${property.sourceName}` : null,
        original ? `Original listing: ${original}` : null,
    ].filter(Boolean).join('\n');
    const body = `Hello Love Live Myoko,\n\nI'm interested in the following property:\n\n${details}\n\nMy question:\n\n\nBest regards,\n`;
    return `mailto:info@myokoworks.com?subject=${encodeURIComponent(`Property Enquiry — ${title}`)}&body=${encodeURIComponent(body)}`;
}
