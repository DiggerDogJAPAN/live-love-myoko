import Image from 'next/image';
import Link from 'next/link';
import styles from './finder.module.css';

export default function PropertyFinderFeature() {
    return (
        <section className={styles.homeFeature}>
            <div className={`layout__container ${styles.homeFeatureInner}`}>
                <div className={styles.featurePhoto}>
                    <Image src="/images/myoko-village.jpg" alt="The Myoko landscape and village beneath the mountains" fill sizes="(max-width: 760px) 100vw, 45vw" unoptimized />
                    <span>Property Finder</span>
                </div>
                <div className={styles.featureCopy}>
                    <p className={styles.eyebrow}>A new way to explore · In development</p>
                    <h2>Find Your Next Property in Myoko</h2>
                    <p>Discover properties collected from Japanese real estate sources in one searchable, English-language directory.</p>
                    <p>Property Finder is being built for Myoko, Joetsu, Shinano Town/Kurohime and Iizuna, with additional sources being added. Paid membership is coming soon.</p>
                    <p>Premium membership includes Saved Properties and exclusive Property Alerts: choose your preferred areas and receive an email only when new matching properties are discovered.</p>
                    <Link href="/property-finder" className="button button--primary">Discover Property Finder <span aria-hidden="true">↗</span></Link>
                </div>
            </div>
        </section>
    );
}
