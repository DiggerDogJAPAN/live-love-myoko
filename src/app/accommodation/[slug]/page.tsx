import { getAccommodations, getAccommodation } from '@/lib/directus';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import AirbnbGallery from '@/components/AirbnbGallery';
import { Metadata } from 'next';

function getEmbedUrl(url: string, fallbackTitle: string) {
    if (!url) return '';

    // If the user pasted a full iframe code, extract the src URL
    // Handles case where the iframe code might be truncated
    if (url.includes('<iframe')) {
        const match = url.match(/src=["']([^"'\s>]+)/i);
        if (match && match[1]) {
            url = match[1];
        }
    }

    if (url.includes('output=embed') || url.includes('/maps/embed') || url.includes('/maps/d/embed')) {
        // Adjust zoom level for Google Maps pb-based embed URLs
        if (url.includes('pb=')) {
            // !1d followed by a number is the camera scale (height of map in meters).
            // Larger number = zoomed out further. Setting it to 4000 (4km span) provides a good view of the village context.
            url = url.replace(/!1d([0-9\.]+)/, '!1d4000');
        }
        return url;
    }

    try {
        const urlObj = new URL(url);
        const placeMatch = url.match(/\/place\/([^\/\?]+)/);
        if (placeMatch && placeMatch[1]) {
            return `https://www.google.com/maps?q=${placeMatch[1]}&z=14&output=embed`;
        }
        if (urlObj.searchParams.has('q')) {
            return `https://www.google.com/maps?q=${urlObj.searchParams.get('q')}&z=14&output=embed`;
        }
    } catch (e) {
        // Invalid URL or unparseable, fallback below
    }

    // Fallback: Use the accommodation title + region as the query to be precise, with zoom level z=14 (moderate zoom-out)
    return `https://www.google.com/maps?q=${encodeURIComponent(`${fallbackTitle}, Myoko Kogen, Japan`)}&z=14&output=embed`;
}

// Generate dynamic metadata for SEO
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
    const { slug } = await params;
    const accommodation = await getAccommodation(slug);

    if (!accommodation) return { title: 'Accommodation Not Found' };

    return {
        title: `${accommodation.title} | LiveLove Myoko`,
        description: accommodation.summary || `View details for ${accommodation.title}.`,
    };
}

// Generate static params for all accommodations at build time
export async function generateStaticParams() {
    const accommodations = await getAccommodations();
    return accommodations.map((acc) => ({
        slug: acc.slug,
    }));
}

export default async function AccommodationPage({ params }: { params: { slug: string } }) {
    const { slug } = await params;
    const accommodation = await getAccommodation(slug);

    if (!accommodation) {
        notFound();
    }

    const isProd = process.env.NODE_ENV === 'production';
    const featuredImageUrl = accommodation.featured_image
        ? (isProd
            ? `/images/accommodations/${slug}/featured.jpg`
            : `${process.env.NEXT_PUBLIC_DIRECTUS_URL}/assets/${accommodation.featured_image}`)
        : null;

    return (
        <main>
            <div className="layout__container section">
                <div className="container" style={{ maxWidth: "1200px", padding: 0 }}>
                    <Link href="/accommodation" className="button button--secondary u-mb-8">&larr; Back to Accommodations</Link>

                    {/* Header Section */}
                    <div className="u-mb-8">
                        <h1 className="u-mb-2">{accommodation.title}</h1>
                        {accommodation.price_display && (
                            <p className="text--lead" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                &yen; {accommodation.price_display}
                            </p>
                        )}
                    </div>

                    {/* Gallery Section */}
                    <AirbnbGallery
                        gallery={accommodation.gallery || []}
                        featuredImageId={accommodation.featured_image}
                        title={accommodation.title}
                        slug={slug}
                        collection="accommodations"
                    />

                    {/* Summary Section */}
                    {accommodation.summary && (
                        <p className="text--lead u-mb-8" style={{ color: 'var(--color-text-primary)', fontStyle: 'italic' }}>
                            {accommodation.summary}
                        </p>
                    )}

                    {/* Specs Row */}
                    <div className="specs-row u-mb-12">
                        {accommodation.rooms && (
                            <div className="specs-row__item">
                                <span className="specs-row__label">Rooms</span>
                                <span className="specs-row__value">{accommodation.rooms}</span>
                            </div>
                        )}
                        {accommodation.beds && (
                            <div className="specs-row__item">
                                <span className="specs-row__label">Beds</span>
                                <span className="specs-row__value">{accommodation.beds}</span>
                            </div>
                        )}
                        {accommodation.baths && (
                            <div className="specs-row__item">
                                <span className="specs-row__label">Baths</span>
                                <span className="specs-row__value">{accommodation.baths}</span>
                            </div>
                        )}
                        {accommodation.max_guests && (
                            <div className="specs-row__item">
                                <span className="specs-row__label">Max Guests</span>
                                <span className="specs-row__value">{accommodation.max_guests}</span>
                            </div>
                        )}
                        {accommodation.parking && (
                            <div className="specs-row__item">
                                <span className="specs-row__label">Parking Spaces</span>
                                <span className="specs-row__value">{accommodation.parking}</span>
                            </div>
                        )}
                    </div>

                    {/* About Section */}
                    {accommodation.about && (
                        <div className="u-mb-12">
                            <h3 className="u-mb-4">About this accommodation</h3>
                            <div
                                className="section__content"
                                style={{ color: 'var(--color-text-primary)', lineHeight: '1.8' }}
                                dangerouslySetInnerHTML={{ __html: accommodation.about }}
                            />
                        </div>
                    )}

                    {/* Booking Section */}
                    <div className="u-mb-12" style={{ padding: '2rem', background: 'var(--color-bg-muted)', borderRadius: '8px' }}>
                        <h3 className="u-mb-4">Book this accommodation</h3>
                        <p className="u-mb-6">Ready to secure your stay at {accommodation.title}? Click below to proceed with your booking.</p>
                        <div className="u-flex u-gap-4" style={{ flexWrap: 'wrap' }}>
                            {accommodation.website_url && (
                                <a
                                    href={accommodation.website_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="button button--primary"
                                >
                                    Visit the website
                                </a>
                            )}
                            <a
                                href={`mailto:info@live-love-myoko.com?subject=Book ${encodeURIComponent(accommodation.title)}&body=${encodeURIComponent(`We wish to enquire for a stay at ${accommodation.title}\n\nCheck in:\nCheck out:\nNo. of guests:\nNo. of cars:\n`)}`}
                                className={accommodation.website_url ? "button button--secondary" : "button button--primary"}
                            >
                                Book Now
                            </a>
                        </div>
                    </div>

                    {/* Map Section */}
                    {accommodation.map_url && (() => {
                        const embedUrl = getEmbedUrl(accommodation.map_url, accommodation.title);
                        return (
                            <div className="u-mb-12">
                                <h3 className="u-mb-4">Location</h3>
                                <div className="embed-map u-mb-4">
                                    <iframe
                                        src={embedUrl}
                                        allowFullScreen
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                        title={`Map showing location of ${accommodation.title}`}
                                    ></iframe>
                                </div>
                                <a 
                                    href={embedUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="embed-map__link"
                                >
                                    View on Google Maps &rarr;
                                </a>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Final CTA */}
            <section className="section section--muted" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="layout__container">
                    <div className="u-text-center">
                        <div className="stack stack--lg">
                            <h2>Have questions?</h2>
                            <p className="text--lead" style={{ maxWidth: "700px", margin: "0 auto" }}>
                                We're here to help you plan the perfect trip. Reach out to us for more information.
                            </p>
                            <div className="u-mt-8">
                                <a
                                    href={`mailto:info@live-love-myoko.com?subject=Enquiry: ${accommodation.title}`}
                                    className="button button--primary"
                                >
                                    Contact Us
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
