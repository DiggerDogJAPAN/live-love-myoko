import styles from '@/styles/editorial.module.css';
import { getProperties, getProperty } from '@/lib/directus';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PropertyGallery from '@/components/PropertyGallery';
import { Metadata } from 'next';
import { generatePropertySchema } from '@/lib/schema';
import { directusPropertyStatus } from '@/lib/property-status';

function getCleanMapUrl(url: string) {
    if (!url) return '';
    if (url.includes('<iframe')) {
        const match = url.match(/src=["']([^"'\s>]+)/i);
        if (match && match[1]) {
            url = match[1];
        }
    }
    return url;
}

// Generate dynamic metadata for SEO
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
    const { slug } = await params;
    const property = await getProperty(slug);

    if (!property) return { title: 'Property Not Found' };

    return {
        title: property.seo_title || `${property.title} | Love Live Myoko`,
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

    const jsonLd = generatePropertySchema(property, slug);
    const status = directusPropertyStatus(property);
    const sold = status === 'sold';

    return (
        <main className={styles.page}>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            )}
            {/* Hero Image Section */}
            {featuredImageUrl && (
                <div className={styles.coverFrame}>
                    <div className={`${styles.cover}${sold ? ' property-photo--sold' : ''}`} style={{ backgroundImage: `url(${featuredImageUrl})` }} />
                    {sold && <span className="property-sold-badge">SOLD</span>}
                </div>
            )}

            <div className="layout__container section">
                <div className={styles.wideProse}>
                    <Link href="/properties" className="button button--secondary u-mb-8">&larr; Back to Listings</Link>

                    <div className="u-mb-8">
                        <span className={`text--xs u-mb-2 ${styles.eyebrow}`}>
                            {property.property_type} • {property.location}
                        </span>
                        <h1 className="u-mb-2">{property.title}</h1>
                        {property.price_display && (
                            <p className={`text--lead ${styles.detailPrice}`}>
                                &yen; {property.price_display}
                            </p>
                        )}
                    </div>

                    {/* Summary Section */}
                    {property.summary && (
                        <p className={`text--lead u-mb-8 ${styles.summary}`}>
                            {property.summary}
                        </p>
                    )}

                    {/* Specs Grid */}
                    <div className={`u-mb-8 ${styles.facts}`}>
                        {status && (
                            <div>
                                <span className={`text--xs ${styles.factLabel}`}>Status</span>
                                <strong style={{
                                    textTransform: 'capitalize',
                                    color: status === 'for_sale' ? 'var(--color-accent-primary)' :
                                        sold ? 'var(--color-error)' : 'inherit'
                                }}>
                                    {status.replace('_', ' ')}
                                </strong>
                            </div>
                        )}
                        {property.bedrooms && (
                            <div>
                                <span className={`text--xs ${styles.factLabel}`}>Bedrooms</span>
                                <strong>{property.bedrooms}</strong>
                            </div>
                        )}
                        {property.bathrooms && (
                            <div>
                                <span className={`text--xs ${styles.factLabel}`}>Toilets</span>
                                <strong>{property.bathrooms}</strong>
                            </div>
                        )}
                        {property.floor_area_sqm && (
                            <div>
                                <span className={`text--xs ${styles.factLabel}`}>Floor Area</span>
                                <strong>{property.floor_area_sqm} m²</strong>
                            </div>
                        )}
                        {property.land_area_sqm && (
                            <div>
                                <span className={`text--xs ${styles.factLabel}`}>Land Area</span>
                                <strong>{property.land_area_sqm} m²</strong>
                            </div>
                        )}
                    </div>

                    {/* Description Section */}
                    <div className="u-mb-12">
                        <h3 className="u-mb-4">Overview</h3>
                        <div
                            className={`section__content ${styles.proseText}${sold ? ' property-description--sold' : ''}`}

                            dangerouslySetInnerHTML={{ __html: property.description || '' }}
                        />
                    </div>

                    {/* Amenities Section */}
                    {(() => {
                        let amenities: string[] | undefined;
                        if (typeof property.amenities === 'string') {
                            try {
                                amenities = JSON.parse(property.amenities) as string[];
                            } catch {
                                amenities = undefined;
                            }
                        } else if (Array.isArray(property.amenities)) {
                            amenities = property.amenities;
                        }

                        if (amenities && Array.isArray(amenities) && amenities.length > 0) {
                            return (
                                <div className="u-mb-16">
                                    <h3 className="u-mb-6">Amenities</h3>
                                    <div className={styles.buttons}>
                                        {amenities.map((amenity, index) => (
                                            <span
                                                key={index}
                                                className={styles.tag}
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
                            <p className={styles.proseText}>
                                {property.area_notes}
                            </p>
                        </div>
                    )}

                    {/* Location Section */}
                    {property.map_url && (
                        <div className="u-mb-12">
                            <h3 className="u-mb-4">Location</h3>
                            <p className={`u-mb-6 ${styles.text}`}>{property.location}</p>
                            <a
                                href={getCleanMapUrl(property.map_url)}
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
                                sold={sold}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Contact CTA */}
            <section className={`section section--muted ${styles.divider}`}>
                <div className="layout__container">
                    <div className="u-text-center">
                        <div className="stack stack--lg">
                            <h2>Interested in this property?</h2>
                            <p className={`text--lead ${styles.ctaCopy}`}>
                                We&apos;d love to show you around. Contact us for more details or to schedule a viewing.
                            </p>
                            <div className={styles.actions}>
                                <a
                                    href={`mailto:info@love-live-myoko.com?subject=Enquiry: ${property.title}`}
                                    className="button button--primary"
                                >
                                    Enquire About This Property
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}


