import Link from 'next/link';
import { Property } from '@/lib/directus';

interface PropertyCardProps {
    property: Pick<Property, 'id' | 'title' | 'slug'>;
}

export default function PropertyCard({ property }: PropertyCardProps) {
    return (
        <Link
            href={`/property/${property.slug}`}
            className="property-card"
        >
            <div className="property-card__image">
                <div className="property-card__placeholder">
                    <span>No Image</span>
                </div>
            </div>
            <div className="property-card__content">
                <h2 className="property-card__title">{property.title}</h2>
                <span className="button button--secondary">View Details &rarr;</span>
            </div>
        </Link>
    );
}
