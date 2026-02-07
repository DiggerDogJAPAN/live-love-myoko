import Link from "next/link";

export default function Home() {
  return (
    <>
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__content">
          <div className="hero__text">
            <h1 className="hero__headline">
              Live Love Myoko — Property, Lodges & Management in Myoko
            </h1>
            <p className="hero__subheadline">
              Whether you already own a home or lodge in Myoko, or are looking to purchase a holiday property, we’re here to guide you every step of the way.
            </p>
            <div className="hero__actions">
              <Link href="/properties" className="button button--primary">
                View Properties
              </Link>
              <Link href="mailto:info@love-live-myoko.com" className="button button--secondary">
                Get in Touch
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Services Overview */}
      <section className="section">
        <div className="container">
          <div className="stack stack--lg">
            <div className="u-text-center">
              <h2>Our Services</h2>
              <p className="text--lead">
                Managing everything can indeed prove daunting. We endeavor to ease your burden by providing property management services while you are away or by aiding you in discovering your idyllic home within the village.
              </p>
            </div>

            <div className="grid grid--3-cols">
              <Link href="/management" className="card">
                <div className="card__image-container">
                  <img src="/images/services/property management.jpg" alt="Property Management" className="card__image" />
                </div>
                <div className="card__content">
                  <div className="card__header">
                    <h3>Property Management</h3>
                  </div>
                  <div className="card__body">
                    <p>Professional short-term rental and lodge management for Myoko property owners from a fully licensed company.</p>
                  </div>
                  <div className="card__footer">
                    <span className="card__cta">Learn More</span>
                  </div>
                </div>
              </Link>

              <Link href="/purchase-property" className="card">
                <div className="card__image-container">
                  <img src="/images/services/property purchase.jpg" alt="Property Purchase" className="card__image" />
                </div>
                <div className="card__content">
                  <div className="card__header">
                    <h3>Property Purchase</h3>
                  </div>
                  <div className="card__body">
                    <p>Expert guidance through your property search with 25 years of local knowledge in the Myoko region.</p>
                  </div>
                  <div className="card__footer">
                    <span className="card__cta">Learn More</span>
                  </div>
                </div>
              </Link>

              <Link href="/maintenance" className="card">
                <div className="card__image-container">
                  <img src="/images/services/property maintenance.jpg" alt="Maintenance Services" className="card__image" />
                </div>
                <div className="card__content">
                  <div className="card__header">
                    <h3>Maintenance Services</h3>
                  </div>
                  <div className="card__body">
                    <p>Comprehensive property maintenance services to keep your Myoko home in pristine condition year-round.</p>
                  </div>
                  <div className="card__footer">
                    <span className="card__cta">Learn More</span>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>
      {/* About Section */}
      <section className="section about">
        <div className="container">
          <div className="about__grid">
            <div className="about__image-wrapper">
              <img
                src="/images/akakura-onsen.jpg"
                alt="Akakura Onsen scenic view"
                className="about__image"
              />
            </div>
            <div className="about__content">
              <div className="stack">
                <h2>Local expertise to rely on</h2>
                <p>
                  Live Love Myoko is based in the Myoko region, working closely with property
                  owners, buyers, and guests to provide thoughtful property support year-round.
                </p>
                <p>
                  From managing holiday homes and lodges to assisting with property purchases,
                  we combine practical local knowledge with a clear understanding of overseas
                  ownership needs.
                </p>
                <p>
                  Our focus is simple: reliable care, clear communication, and long-term value
                  for every property we manage.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Trust Highlights Section */}
      <section className="section section--muted trust-highlights">
        <div className="container">
          <div className="u-text-center u-mb-8">
            <h2>Why Owners Trust Live Love Myoko</h2>
            <p className="text--lead">
              Local expertise, hands-on management, and clear communication — everything you need to feel confident your property is in good hands.
            </p>
          </div>

          <div className="trust-highlights__grid">
            <div className="trust-item">
              <h3>Local, On-the-Ground Team</h3>
              <p>
                We live and work in Myoko. Our local presence means faster response times, better relationships with contractors, and real insight into the seasonal needs of mountain properties.
              </p>
            </div>

            <div className="trust-item">
              <h3>Property & Lodge Specialists</h3>
              <p>
                From small lodges to Airbnb rentals, we manage properties of all sizes and work with you to meet your needs and those of your guests.
              </p>
            </div>

            <div className="trust-item">
              <h3>Transparent & Owner-Focused</h3>
              <p>
                No guesswork, no surprises. Owners receive clear reporting, proactive communication, and honest advice — always acting in your property’s best interest.
              </p>
            </div>

            <div className="trust-item">
              <h3>End-to-End Management</h3>
              <p>
                Maintenance, guest coordination, cleaning, inspections, and seasonal preparation — we handle the details so you can enjoy ownership without the stress.
              </p>
            </div>
          </div>

          <div className="u-text-center u-mt-8">
            <p className="trust-highlights__reinforcement">
              Whether you’re nearby or overseas, Live Love Myoko provides dependable, professional management you can trust year-round.
            </p>
          </div>
        </div>
      </section>
      {/* Final CTA Section */}
      <section className="section final-cta">
        <div className="container">
          <div className="final-cta__grid">
            <div className="final-cta__content">
              <div className="stack stack--lg">
                <h2>Find Your Place in Myoko</h2>
                <p className="text--lead">
                  Whether you’re looking to purchase a mountain home, invest in a lodge, or explore managed properties in the region, Live Love Myoko is here to guide you every step of the way.
                </p>
                <div className="final-cta__actions">
                  <Link href="/properties" className="button button--primary">
                    View Available Properties
                  </Link>
                </div>
              </div>
            </div>
            <div className="final-cta__image-wrapper">
              <img
                src="/images/myoko-village.jpg"
                alt="Myoko Kogen village area"
                className="final-cta__image"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
