import { getProperties, getProperty } from '@/lib/directus';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PropertyGallery from '@/components/PropertyGallery';
import { Metadata } from 'next';

// Generate dynamic metadata for SEO
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
    const { slug } = await params;
    const property = await getProperty(slug);

    if (!property) return { title: 'Property Not Found' };

    return {
        title: property.seo_title || `${property.title} | LiveLove Myoko`,
        description: property.seo_description || property.summary || `View details for ${property.title} in ${property.location}.`,
    };
}

// Generate static params for all properties at build time
export async function generateStaticParams() {
    const properties = await getProperties();
    return properties.map((property) => ({
        slug: property.slug,
    }));
}

export default async function PropertyPage({ params }: { params: { slug: string } }) {
    const { slug } = await params;
    const property = await getProperty(slug);

    if (!property) {
        notFound();
    }

    const isProd = process.env.NODE_ENV === 'production';
    const featuredImageUrl = property.featured_image
        ? (isProd
            ? `/images/properties/${slug}/featured.jpg`
            : `${process.env.NEXT_PUBLIC_DIRECTUS_URL}/assets/${property.featured_image}`)
        : null;

    return (
        <main>
            {/* Hero Image Section */}
            {featuredImageUrl && (
                <div className="hero" style={{
                    backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.4)), url(${featuredImageUrl})`,
                    minHeight: '50vh',
                    backgroundAttachment: 'scroll'
                }}>
                </div>
            )}

            <div className="layout__container section">
                <div style={{ maxWidth: "900px", margin: "0 auto" }}>
                    <Link href="/properties" className="button button--secondary u-mb-8">&larr; Back to Listings</Link>

                    <div className="u-mb-8">
                        <span className="text--xs u-mb-2" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-accent-primary)' }}>
                            {property.property_type} • {property.location}
                        </span>
                        <h1 className="u-mb-2">{property.title}</h1>
                        {property.price_display && (
                            <p className="text--lead" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                {property.price_display}
                            </p>
                        )}
                    </div>

                    {/* Summary Section */}
                    {property.summary && (
                        <p className="text--lead u-mb-8" style={{ color: 'var(--color-text-primary)', fontStyle: 'italic' }}>
                            {property.summary}
                        </p>
                    )}

                    {/* Specs Grid */}
                    <div className="u-mb-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '1.5rem 0' }}>
                        {property.status && (
                            <div>
                                <span className="text--xs" style={{ display: 'block', color: 'var(--color-text-muted)' }}>Status</span>
                                <strong style={{
                                    textTransform: 'capitalize',
                                    color: property.status === 'for_sale' ? 'var(--color-accent-primary)' :
                                        property.status === 'sold' ? 'var(--color-error)' : 'inherit'
                                }}>
                                    {property.status.replace('_', ' ')}
                                </strong>
                            </div>
                        )}
                        {property.bedrooms && (
                            <div>
                                <span className="text--xs" style={{ display: 'block', color: 'var(--color-text-muted)' }}>Bedrooms</span>
                                <strong>{property.bedrooms}</strong>
                            </div>
                        )}
                        {property.bathrooms && (
                            <div>
                                <span className="text--xs" style={{ display: 'block', color: 'var(--color-text-muted)' }}>Bathrooms</span>
                                <strong>{property.bathrooms}</strong>
                            </div>
                        )}
                        {property.floor_area_sqm && (
                            <div>
                                <span className="text--xs" style={{ display: 'block', color: 'var(--color-text-muted)' }}>Floor Area</span>
                                <strong>{property.floor_area_sqm} m²</strong>
                            </div>
                        )}
                        {property.land_area_sqm && (
                            <div>
                                <span className="text--xs" style={{ display: 'block', color: 'var(--color-text-muted)' }}>Land Area</span>
                                <strong>{property.land_area_sqm} m²</strong>
                            </div>
                        )}
                    </div>

                    {/* Description Section */}
                    <div className="u-mb-12">
                        <h3 className="u-mb-4">Overview</h3>
                        <div
                            className="section__content"
                            style={{ color: 'var(--color-text-primary)', lineHeight: '1.8' }}
                            dangerouslySetInnerHTML={{ __html: property.description || '' }}
                        />
                    </div>

                    {/* Amenities Section */}
                    {(() => {
                        let amenities: string[] | undefined = property.amenities;
                        if (typeof amenities === 'string') {
                            try {
                                amenities = JSON.parse(amenities) as string[];
                            } catch (e) {
                                amenities = undefined;
                            }
                        }

                        if (amenities && Array.isArray(amenities) && amenities.length > 0) {
                            return (
                                <div className="u-mb-16">
                                    <h3 className="u-mb-6">Amenities</h3>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                        {amenities.map((amenity, index) => (
                                            <span
                                                key={index}
                                                style={{
                                                    background: 'var(--color-bg-alt)',
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '2rem',
                                                    fontSize: 'var(--text-xs)',
                                                    border: '1px solid var(--color-border)'
                                                }}
                                            >
                                                {amenity}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}

                    {/* Area Notes Section */}
                    {property.area_notes && (
                        <div className="u-mb-16">
                            <h3 className="u-mb-4">Area & Access</h3>
                            <p style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
                                {property.area_notes}
                            </p>
                        </div>
                    )}

                    {/* Location Section */}
                    {property.map_url && (
                        <div className="u-mb-12">
                            <h3 className="u-mb-4">Location</h3>
                            <p className="u-mb-6" style={{ color: 'var(--color-text-muted)' }}>{property.location}</p>
                            <a
                                href={property.map_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="button button--primary"
                            >
                                View on Google Maps
                            </a>
                        </div>
                    )}

                    {/* Gallery Section */}
                    {property.gallery && property.gallery.length > 0 && (
                        <div className="u-mt-12">
                            <h3 className="u-mb-6">Gallery</h3>
                            <PropertyGallery
                                gallery={property.gallery}
                                featuredImageId={property.featured_image}
                                title={property.title}
                                slug={slug}
                            />
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}


