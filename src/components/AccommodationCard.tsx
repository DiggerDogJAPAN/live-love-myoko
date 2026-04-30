import Link from 'next/link';
import { Accommodation } from '@/lib/directus';

interface AccommodationCardProps {
    accommodation: Accommodation;
}

export default function AccommodationCard({ accommodation }: AccommodationCardProps) {
    const isProd = process.env.NODE_ENV === 'production';
    const imageUrl = accommodation.featured_image
        ? (isProd
            ? `/images/accommodations/${accommodation.slug}/featured.jpg`
            : `${process.env.NEXT_PUBLIC_DIRECTUS_URL}/assets/${accommodation.featured_image}?width=600&height=400&fit=cover`)
        : null;

    return (
        <Link
            href={`/accommodation/${accommodation.slug}`}
            className="card"
        >
            <div className="card__image-container" style={{ position: 'relative' }}>
                {accommodation.price_display && (
                    <span style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        backgroundColor: 'var(--color-accent-primary)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        zIndex: 10
                    }}>
                        &yen; {accommodation.price_display}
                    </span>
                )}
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={accommodation.title}
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
                    <span className="text--xs u-mb-2" style={{ display: 'block', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                        {accommodation.max_guests ? `${accommodation.max_guests} guests` : 'N/A guests'} &middot; {accommodation.rooms ? `${accommodation.rooms} rooms` : '0 rooms'} &middot; {accommodation.parking ? `${accommodation.parking} parking` : 'No parking'}
                    </span>
                    <h3>{accommodation.title}</h3>
                </div>
                <div className="card__body">
                    {accommodation.summary && (
                        <p style={{
                            margin: 0,
                            color: 'var(--color-text-muted)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                        }}>
                            {accommodation.summary}
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
