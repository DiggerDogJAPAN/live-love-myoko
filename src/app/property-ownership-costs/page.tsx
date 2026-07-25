import Link from 'next/link';

export const metadata = {
  title: 'Cost of Owning Property in Japan | Holiday Home & Investment Property Guide',
  description:
    'Learn about the ongoing costs of owning property in Japan, including taxes, utilities, insurance, maintenance, snow management and holiday home ownership.',
};

const faqs = [
  {
    q: 'How much does it cost to own a holiday home in Japan?',
    a: 'Annual ownership costs vary depending on property size, age, location, and frequency of use. Typically, ongoing expenses for a detached holiday home in Myoko include annual property taxes, standing utility charges, winter snow clearing contracts, building insurance, and property management fees. Owners generally budget between ¥300,000 and ¥800,000+ per year for basic operational expenses.',
  },
  {
    q: 'What taxes will I pay each year as a property owner?',
    a: 'Property owners in Japan pay Fixed Asset Tax (Kotei-shisan-zei), which is set at a standard rate of 1.4% of the government-assessed property value. Properties located within designated municipal urban planning zones may also be subject to City Planning Tax (Toshi-keikaku-zei) at 0.3%. Taxes are invoiced annually by the municipal government and can be paid in full or in four quarterly installments.',
  },
  {
    q: 'Do I need specialized insurance for a mountain property in Japan?',
    a: 'Yes, comprehensive building and fire insurance is strongly recommended for mountain properties in Japan. Standard policies should be customized to include specialized coverage for snow accumulation damage, pipe freeze damage, storm impact, and earthquake coverage (Jishin Hoken).',
  },
  {
    q: 'What happens if I live overseas and cannot visit regularly?',
    a: 'For overseas owners, appointing a local property management company is essential. A local manager conducts monthly interior and exterior inspections, handles mail and bill payments, coordinates winter snow clearing, and responds immediately to storm or freeze emergencies.',
  },
  {
    q: 'Who clears the snow from the roof and driveway in Myoko?',
    a: 'Myoko receives extraordinary winter snowfall (13 to 15+ meters annually). Driveways are cleared using contracted heavy machinery operator services (wheel loaders/snowblowers), while roof snow clearing is performed by specialized local snow clearing teams when snow depths exceed safety limits.',
  },
  {
    q: 'Can someone check my property while I am away?',
    a: 'Yes, Love Live Myoko provides regular property inspection services for vacant holiday homes. Our team checks for pipe leaks, roof integrity, ventilation, storm damage, and unauthorized entry, providing photo updates after each visit.',
  },
  {
    q: 'What routine maintenance should I expect for a timber home?',
    a: 'Traditional Japanese timber homes require regular exterior wood staining/painting (every 5-7 years), periodic roof inspections, gutter clearing, plumbing heat-trace tape checks, and deck sealing to prevent moisture rot and winter frost damage.',
  },
  {
    q: 'Can I hire a local property manager in Myoko?',
    a: 'Yes, Love Live Myoko offers complete property management services tailored for non-resident and international owners, including key holding, winterizing, emergency response, and guest check-in support.',
  },
  {
    q: 'What happens if there is an emergency or heavy storm while I am away?',
    a: 'When an emergency, severe typhoon, or heavy snowstorm occurs, a local property manager inspects the site immediately, coordinates emergency repairs with trusted local contractors, and mitigates further damage.',
  },
  {
    q: 'Can I rent the property to short-term guests when I am not using it?',
    a: 'Yes, property owners can operate short-term holiday rentals under Japan’s Minpaku (Private Lodging Business) law or the Hotel Business Act to offset annual ownership costs. Love Live Myoko is a licensed Minpaku Management operator.',
  },
];

export default function PropertyOwnershipCostsPage() {
  const articleNode = {
    '@type': 'Article',
    '@id': 'https://love-live-myoko.com/property-ownership-costs/#article',
    headline: 'Cost of Owning Property in Japan | Holiday Home & Investment Property Guide',
    description:
      'Learn about the ongoing costs of owning property in Japan, including taxes, utilities, insurance, maintenance, snow management and holiday home ownership.',
    publisher: {
      '@id': 'https://love-live-myoko.com/#organization',
    },
    "mainEntityOfPage": {
      '@id': 'https://love-live-myoko.com/property-ownership-costs/#webpage',
    },
  };

  const faqNode = {
    '@type': 'FAQPage',
    '@id': 'https://love-live-myoko.com/property-ownership-costs/#faq',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };

  const webpageNode = {
    '@type': 'WebPage',
    '@id': 'https://love-live-myoko.com/property-ownership-costs/#webpage',
    url: 'https://love-live-myoko.com/property-ownership-costs/',
    name: 'Cost of Owning Property in Japan | Holiday Home & Investment Property Guide',
    description:
      'Learn about the ongoing costs of owning property in Japan, including taxes, utilities, insurance, maintenance, snow management and holiday home ownership.',
    isPartOf: {
      '@id': 'https://love-live-myoko.com/#website',
    },
  };

  const breadcrumbNode = {
    '@type': 'BreadcrumbList',
    '@id': 'https://love-live-myoko.com/property-ownership-costs/#breadcrumb',
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
        name: 'Cost of Owning Property in Japan',
        item: 'https://love-live-myoko.com/property-ownership-costs/',
      },
    ],
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [articleNode, faqNode, webpageNode, breadcrumbNode],
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
          backgroundImage: `linear-gradient(to right, rgba(249, 250, 248, 0.92) 0%, rgba(249, 250, 248, 0.8) 50%, rgba(249, 250, 248, 0.3) 100%), url('/images/management-hero.jpg')`,
        }}
      >
        <div className="hero__content">
          <div className="hero__text">
            <h1 className="hero__headline">Cost of Owning Property in Japan</h1>
            <p className="hero__subheadline">
              Understand the ongoing costs of owning a home or holiday property in Japan, including annual taxes, utilities, insurance, snow removal, preventative maintenance, and seasonal responsibilities.
            </p>
            <div className="hero__actions">
              <Link href="/management" className="button button--primary">
                Explore Property Management
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Introduction */}
      <section className="section">
        <div className="layout__container">
          <div className="stack stack--lg" style={{ maxWidth: '850px', margin: '0 auto' }}>
            <h2 className="u-text-center">Responsible Real Estate Ownership in Japan</h2>
            <p className="text--lead" style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
              Purchasing real estate is only the first step in property ownership. Responsible, stress-free homeownership requires a clear understanding of ongoing taxes, utility management, seasonal maintenance, and specialized winter preparations.
            </p>
            <p style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
              Ongoing ownership costs in Japan vary based on property size, age, construction type, location, and whether the home is used as a year-round residence or a holiday home. If you are currently evaluating a purchase, read our <Link href="/buying-property-japan">step-by-step guide to buying property in Japan</Link> or view available <Link href="/properties">real estate listings in Myoko</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* Annual Ownership Costs Cards */}
      <section className="section section--muted">
        <div className="layout__container">
          <div className="u-text-center u-mb-12">
            <h2>Annual Ownership Costs Breakdown</h2>
            <p className="text--lead">Key recurring expenses associated with owning Japanese property.</p>
          </div>

          <div className="grid grid--3-cols" style={{ gap: '1.5rem' }}>
            {/* Card 1 */}
            <div className="card" style={{ padding: '1.75rem' }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🏛️</span>
              <h3 className="u-mb-2" style={{ fontSize: '1.25rem' }}>Fixed Asset Tax</h3>
              <p className="text--small" style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                <em>Kotei-shisan-zei</em> is an annual municipal property tax levied at a standard rate of 1.4% on the government-assessed value of land and buildings. Taxes are billed annually in spring.
              </p>
            </div>

            {/* Card 2 */}
            <div className="card" style={{ padding: '1.75rem' }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🗺️</span>
              <h3 className="u-mb-2" style={{ fontSize: '1.25rem' }}>City Planning Tax</h3>
              <p className="text--small" style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                <em>Toshi-keikaku-zei</em> is a secondary municipal tax (capped at 0.3%) applicable only to properties located within designated urban planning zones. Many rural mountain properties are exempt.
              </p>
            </div>

            {/* Card 3 */}
            <div className="card" style={{ padding: '1.75rem' }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🛡️</span>
              <h3 className="u-mb-2" style={{ fontSize: '1.25rem' }}>Property Insurance</h3>
              <p className="text--small" style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                Comprehensive building insurance covers fire, storm, and snow accumulation damage. Optional Earthquake Insurance (<em>Jishin Hoken</em>) provides government-backed structural protection.
              </p>
            </div>

            {/* Card 4 */}
            <div className="card" style={{ padding: '1.75rem' }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>💡</span>
              <h3 className="u-mb-2" style={{ fontSize: '1.25rem' }}>Utilities</h3>
              <p className="text--small" style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                Electricity, water/sewerage, LP gas (or kerosene), and fiber internet. Standing monthly basic fees apply even when vacant, with winter heating increasing seasonal usage.
              </p>
            </div>

            {/* Card 5 */}
            <div className="card" style={{ padding: '1.75rem' }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🚜</span>
              <h3 className="u-mb-2" style={{ fontSize: '1.25rem' }}>Snow Clearing</h3>
              <p className="text--small" style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                In snow country like Myoko, driveway clearing by heavy machinery contractors and periodic manual roof snow removal are essential winter operating expenses.
              </p>
            </div>

            {/* Card 6 */}
            <div className="card" style={{ padding: '1.75rem' }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🛠️</span>
              <h3 className="u-mb-2" style={{ fontSize: '1.25rem' }}>Routine Maintenance</h3>
              <p className="text--small" style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                Preventative building maintenance including roof paint touch-ups, plumbing checks, gutter clearing, heating system servicing, and deck sealing. See our <Link href="/maintenance">maintenance services</Link>.
              </p>
            </div>

            {/* Card 7 */}
            <div className="card" style={{ padding: '1.75rem', gridColumn: 'span 1' }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🏡</span>
              <h3 className="u-mb-2" style={{ fontSize: '1.25rem' }}>Property Management</h3>
              <p className="text--small" style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                Boutique management services for non-resident owners covering monthly inspections, bill payments, winterizing, key holding, and guest hosting. Explore our <Link href="/management">management plans</Link>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Seasonal Responsibilities Breakdown */}
      <section className="section">
        <div className="layout__container">
          <div className="u-text-center u-mb-12">
            <h2>Four-Season Property Responsibilities</h2>
            <p className="text--lead">Understanding year-round care in Myoko’s alpine climate.</p>
          </div>

          <div className="grid grid--2-cols" style={{ gap: '2rem' }}>
            {/* Winter */}
            <div className="card" style={{ padding: '2rem', borderTop: '4px solid #3b82f6' }}>
              <h3 className="u-mb-2">❄️ Winter (Dec – Mar)</h3>
              <p className="text--lead u-mb-4" style={{ fontSize: '1rem', color: 'var(--color-accent-primary)' }}>Heavy Snow & Freeze Prevention</p>
              <ul style={{ paddingLeft: '1.2rem', lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
                <li>Contracting heavy machinery driveway snow clearing.</li>
                <li>Monitoring roof snow load and clearing overhangs.</li>
                <li>Maintaining continuous background heating to prevent pipe freezes.</li>
                <li>Ensuring clear winter access pathways and parking areas.</li>
              </ul>
            </div>

            {/* Spring */}
            <div className="card" style={{ padding: '2rem', borderTop: '4px solid #10b981' }}>
              <h3 className="u-mb-2">🌸 Spring (Apr – May)</h3>
              <p className="text--lead u-mb-4" style={{ fontSize: '1rem', color: 'var(--color-accent-primary)' }}>Post-Winter Inspection & Cleaning</p>
              <ul style={{ paddingLeft: '1.2rem', lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
                <li>Inspecting exterior walls, foundation, and roof for snow damage.</li>
                <li>Deep interior cleaning and airing out after winter shutdown.</li>
                <li>Clearing winter debris from gutters, drains, and garden beds.</li>
                <li>Deactivating heat-trace tapes and adjusting thermostats.</li>
              </ul>
            </div>

            {/* Summer */}
            <div className="card" style={{ padding: '2rem', borderTop: '4px solid #f59e0b' }}>
              <h3 className="u-mb-2">🌿 Summer (Jun – Aug)</h3>
              <p className="text--lead u-mb-4" style={{ fontSize: '1rem', color: 'var(--color-accent-primary)' }}>Exterior Upkeep & Ventilation</p>
              <ul style={{ paddingLeft: '1.2rem', lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
                <li>Exterior timber staining, painting, and deck maintenance.</li>
                <li>Mowing lawns, trimming foliage, and garden upkeep.</li>
                <li>Promoting humidity control and cross-ventilation.</li>
                <li>Inspecting septic tanks and outdoor drainage systems.</li>
              </ul>
            </div>

            {/* Autumn */}
            <div className="card" style={{ padding: '2rem', borderTop: '4px solid #ef4444' }}>
              <h3 className="u-mb-2">🍁 Autumn (Sep – Nov)</h3>
              <p className="text--lead u-mb-4" style={{ fontSize: '1rem', color: 'var(--color-accent-primary)' }}>Winterizing & Preparation</p>
              <ul style={{ paddingLeft: '1.2rem', lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
                <li>Servicing Kerosene and gas heating units before cold sets in.</li>
                <li>Clearing fallen leaves from gutters and drainage channels.</li>
                <li>Installing snow poles, protective timber shutters, and pipe insulation.</li>
                <li>Stockpiling Kerosene fuel tanks and testing snowblower equipment.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="section section--muted">
        <div className="layout__container">
          <div className="u-text-center u-mb-16">
            <h2>Frequently Asked Questions About Property Costs</h2>
            <p className="text--lead" style={{ maxWidth: '800px', margin: '0 auto' }}>
              Practical answers based on real experience managing mountain real estate in Myoko.
            </p>
          </div>

          <div className="stack stack--xl" style={{ maxWidth: '900px', margin: '0 auto' }}>
            {faqs.map((faq, index) => (
              <div
                key={index}
                style={{
                  borderBottom: index < faqs.length - 1 ? '1px solid var(--color-border)' : 'none',
                  paddingBottom: index < faqs.length - 1 ? '2.5rem' : '1rem',
                }}
              >
                <h2 className="u-mb-4" style={{ fontSize: '1.5rem', color: 'var(--color-text-primary)' }}>
                  {faq.q}
                </h2>
                <p style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cost Planning & Maintenance Tips */}
      <section className="section">
        <div className="layout__container">
          <div className="stack stack--lg" style={{ maxWidth: '850px', margin: '0 auto' }}>
            <h2 className="u-text-center">Practical Cost Planning Tips</h2>
            <p className="text--lead" style={{ lineHeight: '1.8' }}>
              Smart planning ensures your Japanese property remains a rewarding asset rather than a financial burden.
            </p>

            <div className="stack stack--md" style={{ marginTop: '1.5rem' }}>
              <div style={{ padding: '1.5rem', background: 'var(--color-bg-muted)', borderRadius: '8px' }}>
                <h4 className="u-mb-2">1. Establish an Annual Maintenance Reserve Fund</h4>
                <p className="text--small">Set aside 1% to 2% of the property value annually to cover periodic paint touch-ups, roof maintenance, and boiler replacements.</p>
              </div>

              <div style={{ padding: '1.5rem', background: 'var(--color-bg-muted)', borderRadius: '8px' }}>
                <h4 className="u-mb-2">2. Never Skimp on Winterization</h4>
                <p className="text--small">Thorough autumn winterization prevents catastrophic pipe bursts and structural water damage during freezing winter months.</p>
              </div>

              <div style={{ padding: '1.5rem', background: 'var(--color-bg-muted)', borderRadius: '8px' }}>
                <h4 className="u-mb-2">3. Maintain Comprehensive Snow Insurance</h4>
                <p className="text--small">Ensure your insurance policy explicitly covers snow load structural pressure, ice dam damage, and falling snow impact.</p>
              </div>

              <div style={{ padding: '1.5rem', background: 'var(--color-bg-muted)', borderRadius: '8px' }}>
                <h4 className="u-mb-2">4. Partner With a Trusted Local Representative</h4>
                <p className="text--small">Having an on-the-ground manager in Myoko ensures minor issues are resolved before they turn into costly repairs. Learn about <Link href="/about">our local background and philosophy</Link>.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Local Support Matters */}
      <section className="section section--muted">
        <div className="layout__container">
          <div className="stack stack--lg" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
            <h2>Why Local Support Matters</h2>
            <p className="text--lead" style={{ lineHeight: '1.8' }}>
              Managing a property from afar can be challenging, especially during winter.
            </p>
            <p style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
              Love Live Myoko brings ~25 years of local living, strong relationships with municipal offices and local contractors, and deep experience with heavy snow country management. We provide peace of mind for non-resident owners through regular inspections, transparent communication, and reliable emergency care. Explore our <Link href="/management">property management plans</Link> or <Link href="/maintenance">maintenance capabilities</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="section final-cta" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div className="layout__container">
          <div className="u-text-center">
            <div className="stack stack--lg">
              <h2>Need local support for your Myoko property?</h2>
              <p className="text--lead" style={{ maxWidth: '700px', margin: '0 auto' }}>
                Whether you own a holiday home, plan to purchase, or need reliable maintenance and winter care, reach out to our team today.
              </p>
              <div style={{ marginTop: '2rem' }}>
                <a href="mailto:info@love-live-myoko.com" className="button button--primary">
                  Contact Our Team
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
