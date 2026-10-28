import Link from 'next/link';
import type { Property } from '@/lib/directus';
import { directusPropertyStatus } from '@/lib/property-status';
import styles from './PropertyCard.module.css';

interface PropertyCardProps {
    property: Pick<Property, 'id' | 'title' | 'slug' | 'featured_image' | 'location' | 'price_display' | 'property_type' | 'status' | 'listing_status'>;
}

export default function PropertyCard({ property }: PropertyCardProps) {
    const isProd = process.env.NODE_ENV === 'production';
    const imageUrl = property.featured_image
        ? (isProd
            ? `/images/properties/${property.slug}/featured.jpg`
            : `${process.env.NEXT_PUBLIC_DIRECTUS_URL}/assets/${property.featured_image}?width=600&height=400&fit=cover`)
        : null;
    // A sold/managed property must not be relabelled for sale by an optional "available" field.
    const status = directusPropertyStatus(property);
    const sold = status === 'sold';
    const statusLabels: Record<string, string> = {
        for_sale: 'For sale', available: 'For sale', managed: 'Managed',
        under_offer: 'Under offer', sold: 'Sold', withdrawn: 'Withdrawn',
    };
    const availability = status && Object.hasOwn(statusLabels, status) ? statusLabels[status]
        : status ? status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) : 'Availability not provided';
    const forSale = ['for_sale', 'available'].includes(status || '');

    return (
        <Link href={`/property/${property.slug}`} className={styles.card}>
            <div className={styles.image}>
                {imageUrl ? (
                    // Preserve the existing Directus asset transforms and native lazy loading.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={property.title} className={`${styles.photograph}${sold ? ' property-photo--sold' : ''}`} loading="lazy" />
                ) : (
                    <div className={styles.placeholder}>
                        <svg viewBox="0 0 240 110" fill="none" aria-hidden="true">
                            <path d="M0 100 53 46l33 36 40-66 49 61 26-29 39 52" stroke="currentColor" strokeWidth="1.5" />
                            <path d="m77 100 38-30 38 30M88 92v18m54-18v18m-30-2V94h14v14" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                        <span>No Image</span>
                    </div>
                )}
                {sold && <span className="property-sold-badge">SOLD</span>}
            </div>
            <div className={styles.content}>
                <div className={styles.topRow}>
                    <span className={styles.location}>{property.location || 'Location not provided'}</span>
                    <span className={`${styles.availability} ${forSale ? styles.forSale : ''}`}>
                        <span className={styles.statusDot} aria-hidden="true" />
                        {availability}
                    </span>
                </div>
                <h3 className={styles.title}>{property.title}</h3>
                <dl className={styles.facts}>
                    <dt>Price</dt>
                    <dd className={styles.price}>{property.price_display ? <>&yen; {property.price_display}</> : 'Price not provided'}</dd>
                    <dt>Type</dt>
                    <dd className={styles.type}>{property.property_type || 'Not provided'}</dd>
                </dl>
                <span className={styles.detailsButton}>View Details <span aria-hidden="true">→</span></span>
            </div>
        </Link>
    );
}
