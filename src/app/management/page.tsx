import Link from 'next/link';

export const metadata = {
    title: 'Property Management | Live Love Myoko',
    description: 'Boutique property management in Myoko. We limit our portfolio to ensure quality, compliance, and personal care for your home.',
};

export default function ManagementPage() {
    return (
        <>
            {/* Hero Section */}
            <section className="hero" style={{
                backgroundImage: `linear-gradient(to right, rgba(249, 250, 248, 0.9) 0%, rgba(249, 250, 248, 0.7) 50%, rgba(249, 250, 248, 0) 100%), url('/images/management-hero.jpg')`
            }}>
                <div className="hero__content">
                    <div className="hero__text">
                        <h1 className="hero__headline">
                            Management with a personal touch
                        </h1>
                        <p className="hero__subheadline">
                            We limit our portfolio to ensure your property receives the dedicated attention it deserves.
                        </p>
                        <div className="hero__actions">
                            <Link href="mailto:info@love-live-myoko.com" className="button button--primary">
                                Enquire for Management
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Philosophy / Intro */}
            <section className="section">
                <div className="layout__container">
                    <div className="stack stack--lg">
                        <div className="u-text-center">
                            <h2>Quality Over Quantity</h2>
                            <p className="text--lead" style={{ maxWidth: '800px', margin: '0 auto' }}>
                                We believe that great property management requires time, presence, and attention to detail.
                                Unlike large-scale operators, we intentionally keep our portfolio small. This ensures that every home we manage is treated as a long-term asset, not just a transaction.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Services Inclusions */}
            <section className="section section--muted">
                <div className="layout__container">
                    <div className="u-text-center u-mb-12">
                        <h2>Full Service Management</h2>
                        <p className="text--lead">Everything required for a compliant, successful rental property.</p>
                    </div>

                    <div className="grid grid--3-cols">
                        <div className="card">
                            <div className="card__content">
                                <h3 className="u-mb-4">Guest Experience</h3>
                                <p>From booking inquiries to in-person check-ins and 24/7 support, we ensure your guests have a seamless, memorable stay.</p>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card__content">
                                <h3 className="u-mb-4">Operations & Turnover</h3>
                                <p>Coordination of professional cleaning, linen rental, and restocking between every stay to maintain 5-star standards.</p>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card__content">
                                <h3 className="u-mb-4">Owner Reporting</h3>
                                <p>Transparent monthly statements and regular updates so you always know how your property is performing.</p>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card__content">
                                <h3 className="u-mb-4">Maintenance Oversight</h3>
                                <p>Proactive checks and coordination of repairs. We act as best-friends to your house, catching issues early.</p>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card__content">
                                <h3 className="u-mb-4">Seasonal Readiness</h3>
                                <p>Winterizing systems, setting up snow clearing, and preparing the property for the Green Season slump.</p>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card__content">
                                <h3 className="u-mb-4">Compliance</h3>
                                <p>Handling trash separation rules, guest registry requirements, and fire safety standards to keep you legal.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Key Differentiator & Compliance */}
            <section className="section">
                <div className="layout__container">
                    <div className="grid grid--2-cols" style={{ gap: '4rem', alignItems: 'center' }}>

                        <div>
                            <h2 className="u-mb-6">The "Small Portfolio" Advantage</h2>
                            <div className="stack stack--md">
                                <p className="text--lead">
                                    When a manager has too many keys, things get missed.
                                </p>
                                <p>
                                    By capping our management numbers, we guarantee responsiveness. We answer the phone when guests call. We notice when a roof needs clearing before it leaks. We build relationships with neighbors that protect your standing in the community.
                                </p>
                            </div>
                        </div>

                        <div style={{ background: 'var(--color-bg-muted)', padding: '2.5rem', borderRadius: '12px', border: '1px solid var(--color-accent-primary)' }}>
                            <div className="u-mb-6 u-text-center">
                                <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>📜</span>
                                <h3 className="u-mb-2">Fully Licensed</h3>
                                <p className="text--small">We operate strictly within Japanese Law.</p>
                            </div>

                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Minpaku Management Licence</p>
                                <p className="text--lead" style={{ fontFamily: 'monospace', color: 'var(--color-accent-primary)' }}>
                                    国士交通大臣（01）第F05136号
                                </p>
                            </div>
                        </div>

                    </div>
                </div>
            </section>

            {/* Who This Is For */}
            <section className="section section--muted">
                <div className="layout__container">
                    <h2 className="u-text-center u-mb-8">Who We Partner With</h2>
                    <div className="grid grid--3-cols">
                        <div style={{ textAlign: 'center' }}>
                            <h4>Overseas Owners</h4>
                            <p className="text--small">Requiring a trusted local representative to bridge the distance.</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h4>Lodge Owners</h4>
                            <p className="text--small">Needing operational support for larger or complex properties.</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h4>Investors</h4>
                            <p className="text--small">Seeking a hands-off, compliant approach to generating returns.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="section final-cta">
                <div className="layout__container">
                    <div className="u-text-center">
                        <div className="stack stack--lg">
                            <h2>Looking for a dedicated management partner?</h2>
                            <p className="text--lead" style={{ maxWidth: '700px', margin: '0 auto' }}>
                                We'd love to discuss if your property is a good fit for our portfolio.
                            </p>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
                                <Link href="mailto:info@love-live-myoko.com" className="button button--primary">
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
