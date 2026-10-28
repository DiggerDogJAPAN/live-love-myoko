/** Customer-facing display fields only. No crawler IDs, raw labels or credentials.
 * A future authenticated backend must project and authorize records before delivery.
 * Neither a browser flag nor this model is an entitlement/eligibility check.
 */
export interface FinderProperty {
    title: string | null;
    municipality: string | null;
    area: string | null;
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

export function propertyTitle(property: FinderProperty): string {
    return property.title || [property.area, property.municipality].filter(Boolean).join(', ') || 'Property listing';
}

export function propertyLocation(property: FinderProperty): string {
    return [property.area, property.municipality].filter(Boolean).join(' / ');
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
