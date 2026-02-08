import Link from 'next/link';

export const metadata = {
    title: 'Property Maintenance | Live Love Myoko',
    description: 'Reliable, year-round property maintenance in Myoko. Snow clearing, inspections, and repairs for homes and lodges.',
};

export default function MaintenancePage() {
    return (
        <>
            {/* Hero Section */}
            <section className="hero" style={{
                backgroundImage: `linear-gradient(to right, rgba(249, 250, 248, 0.9) 0%, rgba(249, 250, 248, 0.7) 50%, rgba(249, 250, 248, 0) 100%), url('/images/maintenance-hero.jpg')`
            }}>
                <div className="hero__content">
                    <div className="hero__text">
                        <h1 className="hero__headline">
                            Reliable property maintenance in Myoko
                        </h1>
                        <p className="hero__subheadline">
                            Year-round care for homes, lodges, and holiday rentals, ensuring your property remains pristine in every season.
                        </p>
                        <div className="hero__actions">
                            <Link href="mailto:info@love-live-myoko.com" className="button button--primary">
                                Enquire Now
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
                            <h2>Protecting Your Investment</h2>
                            <p className="text--lead" style={{ maxWidth: '800px', margin: '0 auto' }}>
                                Myoko's environment poses unique challenges. From the heavy snow loads of winter to the rapid green growth and humidity of summer, an empty home can quickly deteriorate without care.
                                We provide the regular eyes and hands-on work needed to keep your property safe, dry, and welcoming.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Services Overview */}
            <section className="section section--muted">
                <div className="layout__container">
                    <div className="u-text-center u-mb-12">
                        <h2>Comprehensive Care</h2>
                        <p className="text--lead">Everything you need to manage your property from afar.</p>
                    </div>

                    <div className="grid grid--2-cols" style={{ gap: '2rem' }}>
                        {/* General Maintenance Card */}
                        <div className="card">
                            <div className="card__content">
                                <div className="card__header">
                                    <h3>General Assistance</h3>
                                    <span style={{ display: 'block', fontSize: '1.25rem', color: 'var(--color-accent-primary)', fontWeight: 'bold', marginTop: '0.5rem' }}>from 5,000 JPY / month</span>
                                </div>
                                <div className="card__body">
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <li style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                            <span style={{ color: 'var(--color-accent-primary)' }}>✓</span>
                                            <span>Monthly building inspections (internal & external)</span>
                                        </li>
                                        <li style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                            <span style={{ color: 'var(--color-accent-primary)' }}>✓</span>
                                            <span>Air-out service to prevent mold & humidity damage</span>
                                        </li>
                                        <li style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                            <span style={{ color: 'var(--color-accent-primary)' }}>✓</span>
                                            <span>Bill payment & administrative support</span>
                                        </li>
                                        <li style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                            <span style={{ color: 'var(--color-accent-primary)' }}>✓</span>
                                            <span>Vehicle care turnover & battery checks</span>
                                        </li>
                                        <li style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                            <span style={{ color: 'var(--color-accent-primary)' }}>✓</span>
                                            <span>Neighbor & city liaison</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Additional Services Card */}
                        <div className="card" style={{ border: 'none', background: 'transparent', padding: 0, boxShadow: 'none' }}>
                            <div className="u-mb-8">
                                <h3 className="u-mb-4">Specialized Services</h3>
                                <p className="text--small u-mb-6">Available on request or as part of a custom package.</p>

                                <div className="stack stack--md">
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <div style={{ flexShrink: 0, width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden' }}>
                                            <img src="/images/maintenance-snow.jpg" alt="Snow clearing" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                        <div>
                                            <h4>Snow Management</h4>
                                            <p className="text--small">Roof snow clearing and driveway plowing during heavy snowfall months.</p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <div style={{ flexShrink: 0, width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden' }}>
                                            <img src="/images/maintenance-pest.jpg" alt="Pest control" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                        <div>
                                            <h4>Pest & Grounds</h4>
                                            <p className="text--small">Bush cutting, tree trimming, and removal of pests like hornets or ants.</p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <div style={{ flexShrink: 0, width: '60px', height: '60px', borderRadius: '8px', background: 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span style={{ fontSize: '1.5rem' }}>🔧</span>
                                        </div>
                                        <div>
                                            <h4>Repairs & Systems</h4>
                                            <p className="text--small">Coordination of plumbing, electrical, HVAC, and roofing repairs with trusted local contractors.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Airbnb & Lodge Specific */}
            <section className="section">
                <div className="layout__container">
                    <div className="u-text-center u-mb-12">
                        <h2>Short-Term Rental Support</h2>
                        <p className="text--lead" style={{ maxWidth: '700px', margin: '0 auto' }}>
                            For Airbnb hosts and lodge operators, uptime is revenue. We provide rapid response maintenance to keep your guests happy and your reviews high.
                        </p>
                    </div>

                    <div className="grid grid--3-cols">
                        <div style={{ textAlign: 'center' }}>
                            <h4 className="u-mb-2">Pre-Arrival Checks</h4>
                            <p className="text--small">Ensuring heating is on, paths are clear, and systems are go before guests arrive.</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h4 className="u-mb-2">Emergency Response</h4>
                            <p className="text--small">Local support for boiler failures, leaks, or lock-outs during guest stays.</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h4 className="u-mb-2">Waste Management</h4>
                            <p className="text--small">Proper disposal of guest trash and recycling according to strict local rules.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Trust Highlights Reuse */}
            <section className="section section--muted trust-highlights">
                <div className="layout__container">
                    <div className="u-text-center u-mb-8">
                        <h2>Why Owners Trust Us</h2>
                        <p className="text--lead">
                            Local Myoko expertise you can rely on.
                        </p>
                    </div>

                    <div className="trust-highlights__grid">
                        <div className="trust-item">
                            <h3>Year-Round Presence</h3>
                            <p>We are here in Green Season and Winter. We catch problems early before they become expensive repairs.</p>
                        </div>
                        <div className="trust-item">
                            <h3>Trusted Contractors</h3>
                            <p>We have established relationships with the best local tradespeople, ensuring quality work at fair prices.</p>
                        </div>
                        <div className="trust-item">
                            <h3>Clear Reporting</h3>
                            <p>Receive regular photo updates and transparent billing, so you always know the status of your home.</p>
                        </div>
                        <div className="trust-item">
                            <h3>Proactive Care</h3>
                            <p>We don't just wait for things to break. We suggest preventative maintenance to protect your asset's value.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="section final-cta">
                <div className="layout__container">
                    <div className="u-text-center">
                        <div className="stack stack--lg">
                            <h2>Peace of mind for your Myoko property</h2>
                            <p className="text--lead" style={{ maxWidth: '700px', margin: '0 auto' }}>
                                Let us handle the hard work so you can simply enjoy your home.
                            </p>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
                                <Link href="mailto:info@love-live-myoko.com" className="button button--primary">
                                    Contact Us
                                </Link>
                                <Link href="/management" className="button button--secondary">
                                    View Management Services
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
