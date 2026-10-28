/* eslint-disable @next/next/no-img-element -- Preserve the existing CMS image and lightbox sources. */
import Link from 'next/link';
import type { Accommodation } from '@/lib/directus';

interface AccommodationCardProps {
    accommodation: Pick<Accommodation, 'slug' | 'title' | 'featured_image' | 'price_display' | 'max_guests' | 'rooms' | 'parking' | 'summary'>;
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
            <div className="card__image-container">
                {accommodation.price_display && (
                    <span className="accommodation-card__price">
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
                    <div className="card__image accommodation-card__placeholder">
                        <span>No Image</span>
                    </div>
                )}
            </div>
            <div className="card__content">
                <div className="card__header">
                    <span className="accommodation-card__meta u-mb-2">
                        {accommodation.max_guests ? `${accommodation.max_guests} guests` : 'N/A guests'} &middot; {accommodation.rooms ? `${accommodation.rooms} rooms` : '0 rooms'} &middot; {accommodation.parking ? `${accommodation.parking} parking` : 'No parking'}
                    </span>
                    <h3>{accommodation.title}</h3>
                </div>
                <div className="card__body">
                    {accommodation.summary && (
                        <p className="accommodation-card__summary">
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
