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
    return name === 'Shinano Town' ? 'Shinano' : name;
}

/** One location label for cards, filters, image descriptions and enquiries.
 * District tags never override the actual locality, including Japanese fallbacks.
 */
export function propertyLocation(property: FinderProperty): string {
    const municipality = municipalityLabel(property.municipality);
    const value = property.neighbourhood ?? (property.locationNeedsReview ? property.areaJa : property.area);
    const neighbourhood = typeof value === 'string' ? value.trim() : '';
    const valid = neighbourhood && !/^(unknown|undefined|null|n[/.]?a|not (provided|available))$/i.test(neighbourhood)
        && !/[<>()[\]{}]/.test(neighbourhood);
    if (!valid) return municipality || '';
    if (!municipality) return neighbourhood;
    if ([municipality, property.municipality].some(name => name?.trim().toLowerCase() === neighbourhood.toLowerCase())) return municipality;
    return `${municipality} (${neighbourhood})`;
}

export function propertyArea(property: FinderProperty): string | null {
    return propertyLocation(property) || null;
}

export function propertyDisplayArea(property: FinderProperty): string | null {
    return propertyArea(property);
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
        property.sourceName ? `Source: ${property.sourceName}` : null,
        original ? `Original listing: ${original}` : null,
    ].filter(Boolean).join('\n');
    const body = `Hello Love Live Myoko,\n\nI'm interested in the following property:\n\n${details}\n\nMy question:\n\n\nBest regards,\n`;
    return `mailto:info@myokoworks.com?subject=${encodeURIComponent(`Property Enquiry — ${title}`)}&body=${encodeURIComponent(body)}`;
}
