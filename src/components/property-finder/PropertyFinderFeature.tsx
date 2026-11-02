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
                    <p className={styles.eyebrow}>EXPLORE MYOKO PROPERTY</p>
                    <h2>Find Your Next Property in Myoko</h2>
                    <p>Discover properties collected from Japanese real estate sources in one searchable, English-language directory.</p>
                    <p>Explore property listings across Myoko, Joetsu, Shinano Town, Kurohime and Iizuna, with new properties and sources added regularly.</p>
                    <p>Choose a Basic or Premium membership to unlock Property Finder and discover more opportunities across the region.</p>
                    <p>Premium membership includes Saved Properties and Property Alerts, helping you keep track of interesting listings and discover new matches.</p>
                    <Link href="/property-finder" className="button button--primary">Discover Property Finder <span aria-hidden="true">↗</span></Link>
                </div>
            </div>
        </section>
    );
}
