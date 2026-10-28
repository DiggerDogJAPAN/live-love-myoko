import type { Property } from './directus';

/** Match the existing card availability precedence without altering CMS records. */
export function directusPropertyStatus(property: Pick<Property, 'status' | 'listing_status'>) {
    return property.status === 'sold' ? 'sold'
        : property.listing_status && property.listing_status !== 'available' ? property.listing_status
            : property.status || property.listing_status;
}
