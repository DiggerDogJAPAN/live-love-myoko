import Link from 'next/link';
import Image from 'next/image';
import styles from './purchase.module.css';

export const metadata = {
    title: 'Purchase Property | Love Live Myoko',
    description: 'Expert guidance for purchasing property in Myoko. Local insight and professional support for international buyers.',
};

export default function PurchasePropertyPage() {
    return (
        <div className={styles.page}>
            <section className={styles.hero} aria-labelledby="purchase-title">
                <div className={styles.heroCopy}>
                    <h1 id="purchase-title">Expert guidance for{' '}<em>purchasing property in Myoko</em></h1>
                    <p className={styles.heroLead}>
                        We combine local insight with 25 years of experience to help you find your ideal mountain home or investment property.
                    </p>
                    <div className={styles.actions}>
                        <Link href="/properties" className="button button--primary">View Available Properties</Link>
                        <Link href="mailto:info@love-live-myoko.com" className="button button--secondary">Get in Touch</Link>
                    </div>
                </div>
                <div className={styles.heroPhoto}>
                    <Image src="/images/purchase-hero.jpg" alt="" fill sizes="(max-width: 760px) 100vw, 50vw" unoptimized preload />
                </div>
            </section>

            <section className={`${styles.section} ${styles.intro}`} aria-labelledby="market-title">
                <div className={`layout__container ${styles.introGrid}`}>
                    <h2 id="market-title">Navigating the{' '}<em>Myoko Market</em></h2>
                    <p className={styles.introLead}>
                        Purchasing property in Japan can be complex, especially with language barriers and unique local regulations.
                        We bridge that gap—offering the local knowledge, translation support, and professional coordination you need to buy with confidence.
                    </p>
                </div>
            </section>

            <section className={`${styles.section} ${styles.process}`} aria-labelledby="process-title">
                <div className={`layout__container ${styles.processGrid}`}>
                    <div className={styles.sectionIntro}>
                        <h2 id="process-title">How We{' '}<em>Support You</em></h2>
                        <p>A clear, step-by-step approach to finding your property.</p>
                    </div>
                    <ol className={styles.processList}>
                        <li className={styles.processItem}>
                            <span className={styles.number} aria-hidden="true">01</span>
                            <div>
                                <h3>Consultation & Search</h3>
                                <p>We start by understanding your needs. We search for properties, consult with owners and city services, and provide detailed reports with photos and video.</p>
                            </div>
                        </li>
                        <li className={styles.processItem}>
                            <span className={styles.number} aria-hidden="true">02</span>
                            <div>
                                <h3>Due Diligence</h3>
                                <p>We inspect properties on your behalf, explaining year-round maintenance needs and ensuring you understand the realities of Myoko ownership.</p>
                            </div>
                        </li>
                        <li className={styles.processItem}>
                            <span className={styles.number} aria-hidden="true">03</span>
                            <div>
                                <h3>Purchase Support</h3>
                                <p>We serve as your intermediary with real estate agents and judicial scriveners to ensure a smooth, successful transaction.</p>
                            </div>
                        </li>
                    </ol>
                </div>
            </section>

            <section className={styles.section} aria-labelledby="buyers-title">
                <div className={`layout__container ${styles.buyersGrid}`}>
                    <div>
                        <h2 id="buyers-title">Who We Help</h2>
                        <div className={styles.buyerList}>
                            <div className={styles.buyerItem}>
                                <span aria-hidden="true">✓</span>
                                <div><h4>Overseas Buyers</h4><p>Navigating distance and culture to find the perfect holiday home.</p></div>
                            </div>
                            <div className={styles.buyerItem}>
                                <span aria-hidden="true">✓</span>
                                <div><h4>First-Time Investors</h4><p>Locating high-potential lodges and rental properties.</p></div>
                            </div>
                            <div className={styles.buyerItem}>
                                <span aria-hidden="true">✓</span>
                                <div><h4>Lifestyle Buyers</h4><p>Those seeking a quiet mountain retreat for personal use.</p></div>
                            </div>
                        </div>
                    </div>
                    <aside className={styles.fees} aria-labelledby="fees-title">
                        <h3 id="fees-title">Our Fees</h3>
                        <div className={styles.feeItem}>
                            <h4>Consultation & Advice</h4>
                            <p className={styles.feeAmount}>5,000 - 7,000 JPY / hour</p>
                            <p>General advice, translation, and assistance. (20,000 JPY minimum upfront charge).</p>
                        </div>
                        <div className={styles.feeItem}>
                            <h4>Property Finding Service</h4>
                            <p className={styles.feeAmount}>500,000 JPY</p>
                            <p>Full service introduction fee. Covers searching, inspections, reporting, and purchase coordination. Due prior to contract signing.</p>
                        </div>
                        <p className={styles.feeNotice}>
                            * We act as your finder and intermediary consultant, not as a licensed real estate agent. We work alongside licensed agents to complete the legal transaction.
                        </p>
                    </aside>
                </div>
            </section>

            <section className={`${styles.section} ${styles.trust}`} aria-labelledby="trust-title">
                <div className="layout__container">
                    <div className={styles.trustHeader}>
                        <h2 id="trust-title">Why Choose{' '}<em>Love Live Myoko?</em></h2>
                        <p>Reliable local partners for your property journey.</p>
                    </div>
                    <div className={styles.trustGrid}>
                        <article className={styles.trustItem}>
                            <h3>Local Presence</h3>
                            <p>We live and work here. We know the neighborhoods, the snow loads, and the community.</p>
                        </article>
                        <article className={styles.trustItem}>
                            <h3>Community Bridge</h3>
                            <p>We help build relationships with neighbors, ensuring a respectful and welcome entry to the area.</p>
                        </article>
                        <article className={styles.trustItem}>
                            <h3>Transparent Fees</h3>
                            <p>Clear pricing structures with no hidden costs or surprise commissions.</p>
                        </article>
                        <article className={styles.trustItem}>
                            <h3>Long-Term Care</h3>
                            <p>From purchase to renovation and management, we can support your property for years to come.</p>
                        </article>
                    </div>
                </div>
            </section>

            <section className={`${styles.section} ${styles.contact}`} aria-labelledby="contact-title">
                <div className={`layout__container ${styles.contactInner}`}>
                    <h2 id="contact-title">Ready to find your{' '}<em>place in Myoko?</em></h2>
                    <p>Whether you&apos;re just starting to look or ready to make a move, we&apos;re here to help guide you.</p>
                    <div className={styles.actions}>
                        <Link href="/properties" className="button button--primary">Browse Properties</Link>
                        <Link href="mailto:info@love-live-myoko.com" className="button button--secondary">Contact Us</Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
