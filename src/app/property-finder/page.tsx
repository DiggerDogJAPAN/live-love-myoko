import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import LandingActions from '@/components/property-finder/LandingActions';
import styles from '@/components/property-finder/finder.module.css';

export const metadata: Metadata = {
    title: 'Property Finder — Myoko & Beyond | Love Live Myoko',
    description: 'Discover a new English-language property search for Myoko, Joetsu, Shinano Town/Kurohime and Iizuna. Japanese listing sources in one place. Membership coming soon.',
    alternates: { canonical: 'https://love-live-myoko.com/property-finder/' },
};

const benefits = [
    { title: 'More sources. One search.', text: 'Discover properties collected from Japanese real estate sources in one English-language directory.' },
    { title: 'Find what fits your plans.', text: 'Explore homes, land and investment opportunities. Narrow your search by location, price and available property types.' },
    { title: 'Go straight to the source.', text: 'Access the original Japanese listing for the details published by the source. Listings remain attributed to their providers.' },
    { title: 'A local team when you need one.', text: 'Ask Love Live Myoko for help with a property that catches your eye, and discuss purchase assistance with people based here.' },
];

export default function PropertyFinderPage() {
    return (
        <div className={styles.landing}>
            <section className={styles.hero}>
                <div className="layout__container">
                    <div className={styles.heroCopy}>
                        <p className={styles.eyebrow}>Love Live Myoko · Property Finder</p>
                        <h1>Discover Property Across <em>Myoko and Beyond</em></h1>
                        <p>A clearer way to discover Japanese property. Multiple sources, an English-language interface, and local help when you’re ready for the next step.</p>
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
                        <div><p className={styles.eyebrow}>A wider view of the market</p><h2>Your search.<br /><em>A little simpler.</em></h2></div>
                        <p>Japanese property information can be spread across different sites. Property Finder is being built to bring those discoveries together, making it easier to see what may suit you.</p>
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
                    <div><p className={styles.eyebrow}>Our intended coverage</p><h2>Mountain towns.<br /><em>Room for possibility.</em></h2><p>We’re building coverage across these areas. Additional sources are being added; availability will depend on the sources connected to the directory.</p></div>
                    <ul><li><span>Niigata</span>Myoko</li><li><span>Niigata</span>Joetsu</li><li><span>Nagano</span>Shinano Town / Kurohime</li><li><span>Nagano</span>Iizuna</li></ul>
                </div>
            </section>

            <section id="membership" className={styles.membership}>
                <div className={`layout__container ${styles.membershipInner}`}>
                    <div><p className={styles.eyebrow}>The next chapter</p><h2>A directory for members.<br /><em>Local knowledge for your next move.</em></h2><p>Basic: ¥2,000/month — Property Finder access. Premium: ¥4,000/month — Property Finder plus Saved Properties.</p><p>Subscriptions are not yet available. Administrators retain access without a subscription.</p><Link href="/membership/" className="button button--primary">View Membership Plans</Link></div>
                    <aside className={styles.directProperties}><p className={styles.eyebrow}>Looking to buy now?</p><h3>Our own property listings remain open.</h3><p>Our Properties section features listings handled directly by Love Live Myoko. Property Finder is a separate directory of properties from other Japanese sources.</p><Link href="/properties" className={styles.textLink}>View Our Properties <span aria-hidden="true">↗</span></Link></aside>
                </div>
            </section>
        </div>
    );
}
