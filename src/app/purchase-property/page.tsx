import Link from 'next/link';

export const metadata = {
    title: 'Purchase Property | Live Love Myoko',
    description: 'Expert guidance for purchasing property in Myoko. Local insight and professional support for international buyers.',
};

export default function PurchasePropertyPage() {
    return (
        <>
            {/* Hero Section */}
            <section className="hero" style={{
                backgroundImage: `linear-gradient(to right, rgba(249, 250, 248, 0.9) 0%, rgba(249, 250, 248, 0.7) 50%, rgba(249, 250, 248, 0) 100%), url('/images/purchase-hero.jpg')`
            }}>
                <div className="hero__content">
                    <div className="hero__text">
                        <h1 className="hero__headline">
                            Expert guidance for purchasing property in Myoko
                        </h1>
                        <p className="hero__subheadline">
                            We combine local insight with 25 years of experience to help you find your ideal mountain home or investment property.
                        </p>
                        <div className="hero__actions">
                            <Link href="/properties" className="button button--primary">
                                View Available Properties
                            </Link>
                            <Link href="mailto:info@love-live-myoko.com" className="button button--secondary">
                                Get in Touch
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Intro Context */}
            <section className="section">
                <div className="layout__container">
                    <div className="stack stack--lg">
                        <div className="u-text-center">
                            <h2>Navigating the Myoko Market</h2>
                            <p className="text--lead" style={{ maxWidth: '800px', margin: '0 auto' }}>
                                Purchasing property in Japan can be complex, especially with language barriers and unique local regulations.
                                We bridge that gap—offering the local knowledge, translation support, and professional coordination you need to buy with confidence.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* How We Help (Process) */}
            <section className="section section--muted">
                <div className="layout__container">
                    <div className="u-text-center u-mb-12">
                        <h2>How We Support You</h2>
                        <p className="text--lead">A clear, step-by-step approach to finding your property.</p>
                    </div>

                    <div className="grid grid--3-cols">
                        <div className="card">
                            <div className="card__content">
                                <div className="card__header">
                                    <span className="text--heading" style={{ fontSize: '3rem', color: 'var(--color-accent-primary)', opacity: 0.3, lineHeight: 1 }}>01</span>
                                    <h3>Consultation & Search</h3>
                                </div>
                                <div className="card__body">
                                    <p>We start by understanding your needs. We search for properties, consult with owners and city services, and provide detailed reports with photos and video.</p>
                                </div>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card__content">
                                <div className="card__header">
                                    <span className="text--heading" style={{ fontSize: '3rem', color: 'var(--color-accent-primary)', opacity: 0.3, lineHeight: 1 }}>02</span>
                                    <h3>Due Diligence</h3>
                                </div>
                                <div className="card__body">
                                    <p>We inspect properties on your behalf, explaining year-round maintenance needs and ensuring you understand the realities of Myoko ownership.</p>
                                </div>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card__content">
                                <div className="card__header">
                                    <span className="text--heading" style={{ fontSize: '3rem', color: 'var(--color-accent-primary)', opacity: 0.3, lineHeight: 1 }}>03</span>
                                    <h3>Purchase Support</h3>
                                </div>
                                <div className="card__body">
                                    <p>We serve as your intermediary with real estate agents and judicial scriveners to ensure a smooth, successful transaction.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Who This Is For & Costs */}
            <section className="section">
                <div className="layout__container">
                    <div className="grid grid--2-cols" style={{ gap: '4rem', alignItems: 'start' }}>
                        {/* Who For */}
                        <div>
                            <h2 className="u-mb-8">Who We Help</h2>
                            <div className="stack stack--md">
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                    <span style={{ color: 'var(--color-accent-primary)', fontSize: '1.25rem' }}>✓</span>
                                    <div>
                                        <h4 style={{ marginBottom: '0.25rem' }}>Overseas Buyers</h4>
                                        <p className="text--small">Navigating distance and culture to find the perfect holiday home.</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                    <span style={{ color: 'var(--color-accent-primary)', fontSize: '1.25rem' }}>✓</span>
                                    <div>
                                        <h4 style={{ marginBottom: '0.25rem' }}>First-Time Investors</h4>
                                        <p className="text--small">Locating high-potential lodges and rental properties.</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                    <span style={{ color: 'var(--color-accent-primary)', fontSize: '1.25rem' }}>✓</span>
                                    <div>
                                        <h4 style={{ marginBottom: '0.25rem' }}>Lifestyle Buyers</h4>
                                        <p className="text--small">Those seeking a quiet mountain retreat for personal use.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Costs */}
                        <div style={{ background: 'var(--color-bg-muted)', padding: '2rem', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                            <h3 className="u-mb-6">Our Fees</h3>

                            <div className="u-mb-6">
                                <h4 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Consultation & Advice</h4>
                                <p className="text--lead" style={{ fontWeight: 'bold', color: 'var(--color-accent-primary)', marginBottom: '0.5rem' }}>
                                    5,000 - 7,000 JPY / hour
                                </p>
                                <p className="text--small">General advice, translation, and assistance. (20,000 JPY minimum upfront charge).</p>
                            </div>

                            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
                                <h4 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Property Finding Service</h4>
                                <p className="text--lead" style={{ fontWeight: 'bold', color: 'var(--color-accent-primary)', marginBottom: '0.5rem' }}>
                                    500,000 JPY
                                </p>
                                <p className="text--small">
                                    Full service introduction fee. Covers searching, inspections, reporting, and purchase coordination. Due prior to contract signing.
                                </p>
                            </div>

                            <div className="u-mt-6">
                                <p className="text--small" style={{ fontStyle: 'italic', opacity: 0.8 }}>
                                    * We act as your finder and intermediary consultant, not as a licensed real estate agent. We work alongside licensed agents to complete the legal transaction.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Trust Highlights Reuse */}
            <section className="section section--muted trust-highlights">
                <div className="layout__container">
                    <div className="u-text-center u-mb-8">
                        <h2>Why Choose Live Love Myoko?</h2>
                        <p className="text--lead">
                            Reliable local partners for your property journey.
                        </p>
                    </div>

                    <div className="trust-highlights__grid">
                        <div className="trust-item">
                            <h3>Local Presence</h3>
                            <p>We live and work here. We know the neighborhoods, the snow loads, and the community.</p>
                        </div>
                        <div className="trust-item">
                            <h3>Community Bridge</h3>
                            <p>We help build relationships with neighbors, ensuring a respectful and welcome entry to the area.</p>
                        </div>
                        <div className="trust-item">
                            <h3>Transparent Fees</h3>
                            <p>Clear pricing structures with no hidden costs or surprise commissions.</p>
                        </div>
                        <div className="trust-item">
                            <h3>Long-Term Care</h3>
                            <p>From purchase to renovation and management, we can support your property for years to come.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="section final-cta">
                <div className="layout__container">
                    <div className="u-text-center">
                        <div className="stack stack--lg">
                            <h2>Ready to find your place in Myoko?</h2>
                            <p className="text--lead" style={{ maxWidth: '700px', margin: '0 auto' }}>
                                Whether you're just starting to look or ready to make a move, we're here to help guide you.
                            </p>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
                                <Link href="/properties" className="button button--primary">
                                    Browse Properties
                                </Link>
                                <Link href="mailto:info@love-live-myoko.com" className="button button--secondary">
                                    Contact Us
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
