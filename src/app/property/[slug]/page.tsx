import { getProperties, getProperty } from '@/lib/directus';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PropertyGallery from '@/components/PropertyGallery';

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

    const featuredImageUrl = property.featured_image
        ? `${process.env.NEXT_PUBLIC_DIRECTUS_URL}/assets/${property.featured_image}`
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

                    <div className="u-mb-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '1.5rem 0' }}>
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
                        {property.status && (
                            <div>
                                <span className="text--xs" style={{ display: 'block', color: 'var(--color-text-muted)' }}>Status</span>
                                <strong style={{ textTransform: 'capitalize' }}>{property.status.replace('_', ' ')}</strong>
                            </div>
                        )}
                    </div>

                    <div className="u-mb-12">
                        <h3 className="u-mb-4">Overview</h3>
                        <div
                            className="section__content"
                            style={{ color: 'var(--color-text-primary)', lineHeight: '1.8' }}
                            dangerouslySetInnerHTML={{ __html: property.description || '' }}
                        />
                    </div>

                    {/* Gallery Section */}
                    {property.gallery && property.gallery.length > 0 && (
                        <div className="u-mt-12">
                            <h3 className="u-mb-6">Gallery</h3>
                            <PropertyGallery gallery={property.gallery} title={property.title} />
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}

