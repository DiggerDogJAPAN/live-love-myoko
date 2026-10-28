/** Customer-facing display fields only. No crawler IDs, raw labels or credentials.
 * A future authenticated backend must project and authorize records before delivery.
 * Neither a browser flag nor this model is an entitlement/eligibility check.
 */
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
    askingPriceJpy: number | null;
    propertyType: 'House' | 'Land' | 'Apartment' | 'Lodge' | null;
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

const SOURCE_AREAS = new Map<string, string>([
    ['Arai', 'Arai'], ['新井', 'Arai'],
    ['Myoko Kogen', 'Myoko Kogen'], ['妙高高原', 'Myoko Kogen'],
    ['Myoko', 'Myoko'], ['妙高', 'Myoko'],
]);

/** Use the bank's regional grouping, never infer Arai from a similar place name.
 * Missing/conflicting regional evidence retains the original location as fallback.
 */
function sourceArea(property: FinderProperty): string | null {
    if (property.sourceName !== 'Myoko Akiya Bank' || property.municipality !== 'Myoko') return null;
    const english = SOURCE_AREAS.get(property.regionEn || '');
    const japanese = SOURCE_AREAS.get(property.regionJa || '');
    if (english && japanese && english !== japanese) return null;
    return english || japanese || null;
}

export function propertyArea(property: FinderProperty): string | null {
    return sourceArea(property) || property.neighbourhood || property.area;
}

/** Display-only label. Filters continue to use the unadorned propertyArea. */
export function propertyDisplayArea(property: FinderProperty): string | null {
    const area = propertyArea(property);
    const neighbourhood = typeof property.neighbourhood === 'string' ? property.neighbourhood.trim() : '';
    if (!area || property.locationNeedsReview || !neighbourhood
        || !/^\p{Script=Latin}[\p{Script=Latin}\p{M}0-9 .’'-]*$/u.test(neighbourhood)
        || /^(unknown|undefined|null|n[/.]?a|not (provided|available))$/i.test(neighbourhood)
        || neighbourhood.toLowerCase() === area.trim().toLowerCase()) return area;
    return `${area} (${neighbourhood})`;
}

export function propertyTitle(property: FinderProperty): string {
    const area = sourceArea(property);
    if (area) return `Property in ${propertyDisplayArea(property)}`;
    return property.title || [propertyArea(property), property.municipality].filter(Boolean).join(', ') || 'Property listing';
}

export function propertyLocation(property: FinderProperty): string {
    return [propertyDisplayArea(property), property.municipality].filter(Boolean).join(' / ');
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
        property.sourceName ? `Source: ${property.sourceName}` : null,
        original ? `Original listing: ${original}` : null,
    ].filter(Boolean).join('\n');
    const body = `Hello Love Live Myoko,\n\nI'm interested in the following property:\n\n${details}\n\nMy question:\n\n\nBest regards,\n`;
    return `mailto:info@myokoworks.com?subject=${encodeURIComponent(`Property Enquiry — ${title}`)}&body=${encodeURIComponent(body)}`;
}
