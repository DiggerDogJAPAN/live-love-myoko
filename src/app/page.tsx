import Link from 'next/link';
import Image from 'next/image';
import PropertyFinderFeature from '@/components/property-finder/PropertyFinderFeature';
import styles from './home.module.css';

export default function Home() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroPhoto}>
          <Image src="/images/akakura-onsen-hero.jpg" alt="" fill sizes="100vw" unoptimized preload />
        </div>
        <div className={`layout__container ${styles.heroInner}`}>
          <div className={styles.heroCopy}>
            <h1 id="home-title">Love Live Myoko —{' '}<em>Property, Lodges &amp; Management in Myoko</em></h1>
            <p className={styles.heroLead}>
              Whether you already own a home or lodge in Myoko, or are looking to purchase a holiday property, we’re here to guide you every step of the way.
            </p>
            <div className={styles.actions}>
              <Link href="/properties" className="button button--primary">View Properties</Link>
              <Link href="mailto:info@love-live-myoko.com" className="button button--secondary">Get in Touch</Link>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.services}`} aria-labelledby="services-title">
        <div className="layout__container">
          <div className={styles.sectionIntro}>
            <h2 id="services-title">Our <em>Services</em></h2>
            <p>
              Managing everything can indeed prove daunting. We endeavor to ease your burden by providing property management services while you are away or by aiding you in discovering your idyllic home within the village.
            </p>
          </div>
          <div className={styles.servicesGrid}>
            <Link href="/management" className={styles.serviceCard}>
              <div className={styles.servicePhoto}>
                <Image src="/images/services/property management.jpg" alt="Property Management" fill sizes="(max-width: 760px) 100vw, 50vw" unoptimized />
              </div>
              <div className={styles.serviceContent}>
                <h3>Property Management</h3>
                <p>Licensed rental and lodge management, with year-round property care, inspections, and seasonal maintenance in Myoko.</p>
                <span className={styles.serviceLink}>Learn More<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 16 16 4M4 4h12v12" stroke="currentColor" strokeWidth="1.5" /></svg></span>
              </div>
            </Link>
            <Link href="/purchase-property" className={styles.serviceCard}>
              <div className={styles.servicePhoto}>
                <Image src="/images/services/property purchase.jpg" alt="Property Purchase" fill sizes="(max-width: 760px) 100vw, 50vw" unoptimized />
              </div>
              <div className={styles.serviceContent}>
                <h3>Property Purchase</h3>
                <p>Expert guidance through your property search with 25 years of local knowledge in the Myoko region.</p>
                <span className={styles.serviceLink}>Learn More<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 16 16 4M4 4h12v12" stroke="currentColor" strokeWidth="1.5" /></svg></span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <div className={styles.finderBand}><PropertyFinderFeature /></div>

      <section className={`${styles.section} ${styles.about}`} aria-labelledby="expertise-title">
        <div className={`layout__container ${styles.aboutGrid}`}>
          <div className={styles.aboutPhoto}>
            <Image src="/images/akakura-onsen.jpg" alt="Akakura Onsen scenic view" fill sizes="(max-width: 760px) 100vw, 50vw" unoptimized />
          </div>
          <div className={styles.aboutCopy}>
            <h2 id="expertise-title">Local expertise{' '}<em>to rely on</em></h2>
            <p>
              Love Live Myoko is based in the Myoko region, working closely with property
              owners, buyers, and guests to provide thoughtful property support year-round.
            </p>
            <p>
              From managing holiday homes and lodges to assisting with property purchases,
              we combine practical local knowledge with a clear understanding of overseas
              ownership needs.
            </p>
            <p className={styles.statement}>
              Our focus is simple: reliable care, clear communication, and long-term value
              for every property we manage.
            </p>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.trust}`} aria-labelledby="trust-title">
        <div className="layout__container">
          <div className={styles.sectionIntro}>
            <h2 id="trust-title">Why Owners Trust{' '}<em>Love Live Myoko</em></h2>
            <p>
              Local expertise, hands-on management, and clear communication — everything you need to feel confident your property is in good hands.
            </p>
          </div>
          <div className={styles.trustGrid}>
            <article className={styles.trustItem}>
              <h3>Local, On-the-Ground Team</h3>
              <p>
                We live and work in Myoko. Our local presence means faster response times, better relationships with contractors, and real insight into the seasonal needs of mountain properties.
              </p>
            </article>
            <article className={styles.trustItem}>
              <h3>Property &amp; Lodge Specialists</h3>
              <p>
                From small lodges to Airbnb rentals, we manage properties of all sizes and work with you to meet your needs and those of your guests.
              </p>
            </article>
            <article className={styles.trustItem}>
              <h3>Transparent &amp; Owner-Focused</h3>
              <p>
                No guesswork, no surprises. Owners receive clear reporting, proactive communication, and honest advice — always acting in your property’s best interest.
              </p>
            </article>
            <article className={styles.trustItem}>
              <h3>End-to-End Management</h3>
              <p>
                Maintenance, guest coordination, cleaning, inspections, and seasonal preparation — we handle the details so you can enjoy ownership without the stress.
              </p>
            </article>
          </div>
          <p className={styles.reinforcement}>
            Whether you’re nearby or overseas, Love Live Myoko provides dependable, professional management you can trust year-round.
          </p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="home-contact-title">
        <div className={`layout__container ${styles.contactGrid}`}>
          <div className={styles.contactCopy}>
            <h2 id="home-contact-title">Find Your{' '}<em>Place in Myoko</em></h2>
            <p>
              Whether you’re looking to purchase a mountain home, invest in a lodge, or explore managed properties in the region, Love Live Myoko is here to guide you every step of the way.
            </p>
            <div className={styles.actions}>
              <Link href="/properties" className="button button--primary">View Available Properties</Link>
            </div>
          </div>
          <div className={styles.contactPhoto}>
            <Image src="/images/myoko-village.jpg" alt="Myoko Kogen village area" fill sizes="(max-width: 760px) 100vw, 45vw" unoptimized />
          </div>
        </div>
      </section>
    </div>
  );
}
