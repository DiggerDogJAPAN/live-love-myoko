import Link from 'next/link';
import { Property } from '@/lib/directus';

interface PropertyCardProps {
    property: Pick<Property, 'id' | 'title' | 'slug' | 'featured_image' | 'location' | 'price_display' | 'property_type' | 'status'>;
}

export default function PropertyCard({ property }: PropertyCardProps) {
    const isProd = process.env.NODE_ENV === 'production';
    const imageUrl = property.featured_image
        ? (isProd
            ? `/images/properties/${property.slug}/featured.jpg`
            : `${process.env.NEXT_PUBLIC_DIRECTUS_URL}/assets/${property.featured_image}?width=600&height=400&fit=cover`)
        : null;

    return (
        <Link
            href={`/property/${property.slug}`}
            className="card"
        >
            <div className="card__image-container" style={{ position: 'relative' }}>
                {property.status && (
                    <span style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        backgroundColor: property.status === 'for_sale' ? 'var(--color-accent-primary)' :
                            property.status === 'sold' ? 'var(--color-error)' : 'var(--color-text-muted)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        zIndex: 10
                    }}>
                        {property.status.replace('_', ' ')}
                    </span>
                )}
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={property.title}
                        className="card__image"
                        loading="lazy"
                    />
                ) : (
                    <div className="card__image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eee' }}>
                        <span>No Image</span>
                    </div>
                )}
            </div>
            <div className="card__content">
                <div className="card__header">
                    <span className="text--xs u-mb-2" style={{ display: 'block', textTransform: 'capitalize', color: 'var(--color-accent-primary)' }}>
                        {property.property_type} • {property.location}
                    </span>
                    <h3>{property.title}</h3>
                </div>
                <div className="card__body">
                    {property.price_display && (
                        <p className="text--lead" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            &yen; {property.price_display}
                        </p>
                    )}
                </div>
                <div className="card__footer">
                    <span className="card__cta">View Details</span>
                </div>
            </div>
        </Link>
    );
}

