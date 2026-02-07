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
    </>
  );
}
