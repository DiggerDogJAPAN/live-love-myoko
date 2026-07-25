import Link from 'next/link';

export const metadata = {
  title: 'About Love Live Myoko | Property Experts in Myoko, Japan',
  description:
    'Learn about Love Live Myoko, a locally operated company providing property purchasing, management, accommodation management and local support services in Myoko, Japan.',
};

export default function AboutPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': 'https://love-live-myoko.com/about/#webpage',
        url: 'https://love-live-myoko.com/about/',
        name: 'About Love Live Myoko | Property Experts in Myoko, Japan',
        description:
          'Learn about Love Live Myoko, a locally operated company providing property purchasing, management, accommodation management and local support services in Myoko, Japan.',
        mainEntity: {
          '@id': 'https://love-live-myoko.com/#organization',
        },
        isPartOf: {
          '@id': 'https://love-live-myoko.com/#website',
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': 'https://love-live-myoko.com/about/#breadcrumb',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://love-live-myoko.com/',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'About',
            item: 'https://love-live-myoko.com/about/',
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Section */}
      <section
        className="hero"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(249, 250, 248, 0.9) 0%, rgba(249, 250, 248, 0.75) 50%, rgba(249, 250, 248, 0.3) 100%), url('/images/management-hero.jpg')`,
        }}
      >
        <div className="hero__content">
          <div className="hero__text">
            <h1 className="hero__headline">About Love Live Myoko</h1>
            <p className="hero__subheadline">
              Love Live Myoko is a locally owned company dedicated to helping people buy, manage and enjoy property in Myoko, Japan. We combine local knowledge with practical experience to provide trusted support for homeowners, investors and visitors.
            </p>
            <div className="hero__actions">
              <a href="mailto:info@love-live-myoko.com" className="button button--primary">
                Get in Touch
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="section">
        <div className="layout__container">
          <div className="stack stack--lg" style={{ maxWidth: '850px', margin: '0 auto' }}>
            <h2 className="u-text-center">Our Story</h2>
            <p className="text--lead" style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
              Love Live Myoko was created to help overseas buyers navigate property ownership in Japan with clarity and confidence. Buying a property in a foreign country can feel complex, but having a knowledgeable, on-the-ground partner makes all the difference.
            </p>
            <p style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
              Our focus is on building genuine, long-term relationships rather than simply completing transactions. We understand that acquiring a mountain home or lodge is just the first step. Every client receives practical, hands-on support before, during, and long after their purchase, ensuring their property is well-cared for in every season.
            </p>
          </div>
        </div>
      </section>

      {/* Local Experience */}
      <section className="section section--muted">
        <div className="layout__container">
          <div className="grid grid--2-cols" style={{ gap: '4rem', alignItems: 'center' }}>
            <div>
              <h2 className="u-mb-6">Local Experience & Expertise</h2>
              <p className="text--lead u-mb-4" style={{ color: 'var(--color-text-primary)' }}>
                Deep roots in the community and decades of practical experience living in Japan.
              </p>
              <div className="stack stack--md">
                <p>
                  Founder David Bolwell has lived in Japan for approximately 25 years, with extensive experience living and working directly in Myoko and neighboring Joetsu.
                </p>
                <p>
                  Over the years, this has built a thorough, practical understanding of local government procedures, municipal regulations, building contractors, and essential regional services required for snow country property maintenance.
                </p>
                <p>
                  Our ongoing involvement in the Myoko community ensures that our clients benefit from genuine, authentic local insights backed by daily real-world presence.
                </p>
              </div>
            </div>

            <div
              style={{
                background: 'var(--color-bg-alt)',
                padding: '2.5rem',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
              }}
            >
              <h3 className="u-mb-4" style={{ color: 'var(--color-text-primary)' }}>
                Key Local Highlights
              </h3>
              <ul style={{ listStyleType: 'disc', paddingLeft: '1.25rem', lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
                <li style={{ marginBottom: '0.75rem' }}>~25 years living and working in Japan</li>
                <li style={{ marginBottom: '0.75rem' }}>Extensive local experience in Myoko & Joetsu</li>
                <li style={{ marginBottom: '0.75rem' }}>Direct understanding of municipal procedures & contractors</li>
                <li style={{ marginBottom: '0.75rem' }}>Active, ongoing presence in the Myoko community</li>
                <li>Fully licensed Minpaku Management operator (国士交通大臣（01）第F05136号)</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* What We Do */}
      <section className="section">
        <div className="layout__container">
          <div className="u-text-center u-mb-12">
            <h2>What We Do</h2>
            <p className="text--lead">
              Comprehensive property and accommodation services tailored specifically for the Myoko region.
            </p>
          </div>

          <div className="grid grid--2-cols" style={{ gap: '2rem' }}>
            <div className="card">
              <div className="card__content">
                <h3 className="u-mb-4">Property Purchasing</h3>
                <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                  Helping buyers understand the Japanese purchasing process, coordinating with local real estate professionals, and providing practical support throughout every stage of the transaction.
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card__content">
                <h3 className="u-mb-4">Property Management</h3>
                <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                  Professional management services for holiday homes and investment properties, giving owners peace of mind and complete confidence while they are overseas or away.
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card__content">
                <h3 className="u-mb-4">Accommodation Management</h3>
                <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                  Helping owners prepare, manage, and operate holiday accommodation compliant with Japanese regulations while maintaining exceptional standards for visiting guests.
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card__content">
                <h3 className="u-mb-4">Maintenance & Local Support</h3>
                <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                  Regular property inspections, maintenance coordination, seasonal care, heavy snow management, and trusted local assistance when unexpected issues arise.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Work With Love Live Myoko */}
      <section className="section section--muted">
        <div className="layout__container">
          <div className="u-text-center u-mb-12">
            <h2>Why Work With Love Live Myoko?</h2>
            <p className="text--lead">Practical advantages of partnering with a dedicated local representative.</p>
          </div>

          <div className="grid grid--3-cols" style={{ gap: '2rem' }}>
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <h4 className="u-mb-2">Local Knowledge</h4>
              <p className="text--small">First-hand understanding of Myoko's microclimates, neighborhoods, and seasonal demands.</p>
            </div>
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <h4 className="u-mb-2">Bilingual Communication</h4>
              <p className="text--small">Seamless English and Japanese communication to bridge language and cultural gaps.</p>
            </div>
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <h4 className="u-mb-2">Overseas Buyer Expertise</h4>
              <p className="text--small">Specialized experience guiding international clients through Japanese real estate processes.</p>
            </div>
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <h4 className="u-mb-2">Personal Service</h4>
              <p className="text--small">Direct, attentive communication without corporate layers or impersonal call centers.</p>
            </div>
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <h4 className="u-mb-2">Trusted Local Network</h4>
              <p className="text--small">Established relationships with local tradespeople, municipal offices, and service providers.</p>
            </div>
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <h4 className="u-mb-2">Ongoing Support</h4>
              <p className="text--small">Continued local presence and dedicated assistance long after property purchase completion.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Approach */}
      <section className="section">
        <div className="layout__container">
          <div className="stack stack--lg" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
            <h2>Our Approach</h2>
            <p className="text--lead" style={{ lineHeight: '1.8' }}>
              We believe in honest advice, long-term relationships, and quality over quantity.
            </p>
            <p style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
              Rather than managing an unlimited portfolio, we limit our operational capacity so that every property and owner receives prompt, detailed attention. We provide calm, practical solutions tailored to real-world mountain living, backed by local knowledge built over decades.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section section--muted final-cta" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div className="layout__container">
          <div className="u-text-center">
            <div className="stack stack--lg">
              <h2>Thinking about buying or managing property in Myoko?</h2>
              <p className="text--lead" style={{ maxWidth: '700px', margin: '0 auto' }}>
                We would love to discuss your plans and see how we can assist you.
              </p>
              <div style={{ marginTop: '2rem' }}>
                <a href="mailto:info@love-live-myoko.com" className="button button--primary">
                  Contact Us
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
