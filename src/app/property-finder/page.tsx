import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import LandingActions from '@/components/property-finder/LandingActions';
import { generatePropertyFinderSchema } from '@/lib/schema';
import styles from '@/components/property-finder/finder.module.css';

const title = 'Myoko Property Finder | Houses & Land for Sale | Love Live Myoko';
const description = 'Search properties for sale in Myoko, Joetsu, Kurohime and nearby areas. Discover local Japanese real estate listings in English with Love Live Myoko Property Finder.';
const canonical = 'https://love-live-myoko.com/property-finder/';
const sharingImage = 'https://love-live-myoko.com/images/akakura-onsen-hero.jpg';

export const metadata: Metadata = {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
        type: 'website', url: canonical, title, description, siteName: 'Love Live Myoko', locale: 'en_US',
        images: [{ url: sharingImage, width: 1000, height: 563, alt: 'Mount Myoko and the snow-covered villages below' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [{ url: sharingImage, alt: 'Mount Myoko and the snow-covered villages below' }] },
};

const benefits = [
    { title: 'More local listings. One search.', text: 'Explore properties from multiple sources across Myoko and nearby towns, without searching each Japanese website individually.' },
    { title: "Find the property that's right for you.", text: 'Search houses, land and other available properties. Narrow your results by area, price and property type.' },
    { title: 'Discover the original listing.', text: 'Go directly to the Japanese website advertising each property to view the original information and contact details.' },
    { title: 'Local knowledge. Real support.', text: "We're based in Myoko and understand the local property market. If something catches your eye, we're here to help you take the next step." },
];

export default function PropertyFinderPage() {
    return (
        <div className={styles.landing}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generatePropertyFinderSchema(title, description)).replace(/</g, '\\u003c') }} />
            <section className={styles.hero}>
                <div className="layout__container">
                    <div className={styles.heroCopy}>
                        <p className={styles.eyebrow}>Love Live Myoko · Property Finder</p>
                        <h1><span>Find Your Place</span>{' '}<em>in Myoko and Beyond</em></h1>
                        <p>Discover properties for sale across Myoko and the surrounding areas, all in one convenient search. Explore listings from multiple local Japanese property sources through an easy-to-use English interface, with local support when you need it.</p>
                        <LandingActions />
                    </div>
                </div>
                <div className={styles.heroImage}>
                    <Image src="/images/akakura-onsen-hero.jpg" alt="Mount Myoko and the snow-covered villages below" fill sizes="(max-width: 760px) 100vw, 55vw" unoptimized preload />
                    <p>New possibilities.<br /><em>A place of your own.</em></p>
                </div>
            </section>

            <section className={styles.benefits}>
                <div className="layout__container">
                    <div className={styles.sectionIntro}>
                        <div><p className={styles.eyebrow}>Explore the local property market</p><h2>Your local property search.<br /><em>Made simpler.</em></h2></div>
                        <p>Finding property in Myoko isn&apos;t always straightforward. Listings are spread across local estate agents, property websites and municipal vacant-home banks. Property Finder brings these sources together, making it easier to discover homes, land and opportunities throughout the region.</p>
                    </div>
                    <div className={styles.benefitGrid}>
                        {benefits.map((benefit, index) => (
                            <article key={benefit.title} className={styles.benefit}>
                                <span aria-hidden="true">0{index + 1}</span><h3>{benefit.title}</h3><p>{benefit.text}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className={styles.coverage}>
                <div className={`layout__container ${styles.coverageInner}`}>
                    <div>
                        <p className={styles.eyebrow}>Myoko &amp; surrounding areas</p>
                        <h2>Rooted in Myoko.<br /><em>Exploring beyond.</em></h2>
                        <p>Our main focus is Myoko City, from the mountain resort areas to the surrounding towns and countryside. We also include nearby areas such as Joetsu, Shinano Town, Kurohime and Iizuna, giving you a broader view of the local property market. We&apos;re continually adding new sources to improve coverage throughout the region.</p>
                        <p>Explore <Link href="/why-myoko/" className={styles.textLink}>life in Myoko</Link> or read our <Link href="/buying-property-japan/" className={styles.textLink}>guide to buying property in Japan</Link>.</p>
                    </div>
                    <ul><li><span>Niigata</span>Myoko</li><li><span>Niigata</span>Joetsu</li><li><span>Nagano</span>Shinano Town / Kurohime</li><li><span>Nagano</span>Iizuna</li></ul>
                </div>
            </section>

            <section id="membership" className={styles.membership}>
                <div className={`layout__container ${styles.membershipInner}`}>
                    <div>
                        <p className={styles.eyebrow}>Your local property search</p>
                        <h2>Discover more properties.<br /><em>Stay one step ahead.</em></h2>
                        <p>Property Finder makes it easier to explore the Myoko property market from wherever you are.</p>
                        <p>With Basic membership, search listings from multiple local sources and explore the original Japanese property advertisements.</p>
                        <p>With Premium, save properties you&apos;re interested in and receive email alerts when new listings appear in your preferred areas. Saved Properties and Property Alerts are included, with one daily email only when there are new matching listings.</p>
                        <p>Basic: ¥2,000/month · Premium: ¥4,000/month.</p>
                        <p>Subscriptions are coming soon. Existing administrator access remains available during testing.</p>
                        <Link href="/membership/" className="button button--primary">View Membership Plans</Link>
                    </div>
                    <aside className={styles.directProperties}><p className={styles.eyebrow}>Looking to buy now?</p><h3>Explore properties listed directly with us.</h3><p>Alongside Property Finder, Love Live Myoko offers a selection of properties for sale through our <Link href="/purchase-property/">local real estate services</Link>. Browse our own listings or get in touch if you&apos;d like help finding a property in the Myoko area.</p><Link href="/properties" className={styles.textLink}>View Our Properties <span aria-hidden="true">↗</span></Link></aside>
                </div>
            </section>
        </div>
    );
}
