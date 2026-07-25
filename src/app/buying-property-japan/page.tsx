import Link from 'next/link';

export const metadata = {
  title: 'Buying Property in Japan | Complete Guide for Overseas Buyers',
  description:
    'Learn how to buy property in Japan, understand the buying process, costs, taxes and ownership requirements, with practical guidance from Love Live Myoko.',
};

const faqs = [
  {
    q: 'Can foreigners own property in Japan?',
    a: 'Yes, foreigners can own freehold land and property in Japan with 100% ownership rights. There are no restrictions based on citizenship or residency status, and foreign buyers have the exact same property ownership rights as Japanese citizens.',
  },
  {
    q: 'Do I need a visa to buy property in Japan?',
    a: 'No, you do not need a visa, permanent residency, or citizenship to buy real estate in Japan. Overseas buyers can purchase property while visiting on a tourist visa or without entering the country. However, owning property does not automatically grant a residence visa.',
  },
  {
    q: 'Can I get a mortgage in Japan as a foreigner?',
    a: 'Mortgages from Japanese banks are generally only available to foreign nationals who hold Permanent Residency (PR) or long-term employment visas with income taxed in Japan. Non-resident foreign buyers typically purchase real estate using self-funding or equity release from their home country.',
  },
  {
    q: 'What taxes do I pay when buying property?',
    a: 'When purchasing property in Japan, key acquisition taxes and fees include Registration Tax (License Tax), Real Estate Acquisition Tax (invoiced a few months after settlement), Revenue Stamp Duty on contracts, and annual Fixed Asset & City Planning Taxes (prorated at closing).',
  },
  {
    q: 'How long does the settlement process take?',
    a: 'A typical real estate transaction in Japan takes between 30 and 60 days from initial offer acceptance to final closing and title transfer. Remote purchases involving international wire transfers may take slightly longer to coordinate bank settlement.',
  },
  {
    q: 'Can I complete the entire purchase remotely from overseas?',
    a: 'Yes, it is possible to execute a property purchase entirely from overseas. By appointing a representative or executing a Power of Attorney (POA) and completing notarized Affidavit/Signature Certificates, your chosen representative or judicial scrivener can sign contracts and register title transfer on your behalf.',
  },
  {
    q: 'What is the role of a judicial scrivener (Shihō-shoshi)?',
    a: 'A Judicial Scrivener (Shihō-shoshi) is a licensed legal professional in Japan responsible for verifying land registry documents, confirming buyer and seller identities, ensuring funds transfer, and officially registering title ownership at the Japanese Legal Affairs Bureau (Hōmukyoku).',
  },
  {
    q: 'What happens immediately after settlement?',
    a: 'Immediately after settlement and key handover, utility services (electricity, water, gas, internet) are transferred to the new owner, building insurance policies are activated, and seasonal snow management or property management protocols are established.',
  },
  {
    q: 'Can I rent my property to short-term guests?',
    a: 'Yes, property owners can operate holiday rentals under Japan’s Minpaku (Private Lodging Business) law or the Hotel Business Act. Operating legally requires municipal registration, fire safety compliance, and appointment of a licensed Minpaku manager. Love Live Myoko is a licensed Minpaku Management operator.',
  },
  {
    q: 'Do I need professional property management in Myoko?',
    a: 'Professional property management is strongly recommended for overseas or non-resident owners in Myoko. Heavy winter snowfall (13-15+ meters) requires regular roof and driveway snow removal, pipe freeze prevention, and prompt maintenance that can only be handled on the ground.',
  },
  {
    q: 'What annual costs should I expect as a property owner?',
    a: 'Annual ownership costs include Fixed Asset Tax (typically 1.4% of assessed government value), City Planning Tax (0.3% where applicable), utility standing charges, winter snow clearing contracts, building insurance, and monthly property management fees.',
  },
  {
    q: 'Is buying real estate in Japan safe and secure?',
    a: 'Yes, Japan offers one of the most secure, transparent, and legally protected real estate registration systems in the world. Title deeds (*Kenshō*) are centrally recorded at government Legal Affairs Bureaus, guaranteeing indisputable proof of ownership.',
  },
];

export default function BuyingPropertyJapanPage() {
  const articleNode = {
    '@type': 'Article',
    '@id': 'https://love-live-myoko.com/buying-property-japan/#article',
    headline: 'Buying Property in Japan | Complete Guide for Overseas Buyers',
    description:
      'Learn how to buy property in Japan, understand the buying process, costs, taxes and ownership requirements, with practical guidance from Love Live Myoko.',
    publisher: {
      '@id': 'https://love-live-myoko.com/#organization',
    },
    "mainEntityOfPage": {
      '@id': 'https://love-live-myoko.com/buying-property-japan/#webpage',
    },
  };

  const faqNode = {
    '@type': 'FAQPage',
    '@id': 'https://love-live-myoko.com/buying-property-japan/#faq',
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
    '@id': 'https://love-live-myoko.com/buying-property-japan/#webpage',
    url: 'https://love-live-myoko.com/buying-property-japan/',
    name: 'Buying Property in Japan | Complete Guide for Overseas Buyers',
    description:
      'Learn how to buy property in Japan, understand the buying process, costs, taxes and ownership requirements, with practical guidance from Love Live Myoko.',
    isPartOf: {
      '@id': 'https://love-live-myoko.com/#website',
    },
  };

  const breadcrumbNode = {
    '@type': 'BreadcrumbList',
    '@id': 'https://love-live-myoko.com/buying-property-japan/#breadcrumb',
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
        name: 'Buying Property in Japan',
        item: 'https://love-live-myoko.com/buying-property-japan/',
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
            <h1 className="hero__headline">Buying Property in Japan</h1>
            <p className="hero__subheadline">
              Everything you need to know about purchasing property in Japan as a domestic or overseas buyer, including the step-by-step buying process, costs, taxes, and practical local considerations.
            </p>
            <div className="hero__actions">
              <Link href="/purchase-property" className="button button--primary">
                Consultation Services
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Introduction */}
      <section className="section">
        <div className="layout__container">
          <div className="stack stack--lg" style={{ maxWidth: '850px', margin: '0 auto' }}>
            <h2 className="u-text-center">Foreign Real Estate Ownership in Japan</h2>
            <p className="text--lead" style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
              Japan welcomes overseas property buyers. Unlike many other nations, Japan imposes no legal restrictions on foreign nationals purchasing land or real estate. Foreign buyers enjoy 100% freehold land ownership rights, identical to Japanese citizens.
            </p>
            <p style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
              It is important to note that purchasing real estate in Japan does not automatically confer residency rights or a visa. However, whether you are seeking a winter holiday home, a commercial lodge investment, or a year-round residence in Myoko, having local guidance ensures a smooth and compliant transaction. Learn more about <Link href="/why-myoko">why Myoko is a top destination</Link> or browse our <Link href="/properties">available properties for sale</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* Step-by-Step Buying Process */}
      <section className="section section--muted">
        <div className="layout__container">
          <div className="u-text-center u-mb-12">
            <h2>The Step-by-Step Buying Process</h2>
            <p className="text--lead">An overview of the typical transaction steps when buying Japanese property.</p>
          </div>

          <div className="stack stack--xl" style={{ maxWidth: '900px', margin: '0 auto' }}>
            {/* Step 1 */}
            <div className="card" style={{ padding: '2rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent-primary)', display: 'block', marginBottom: '0.5rem' }}>Step 1</span>
              <h3 className="u-mb-4">Finding the Right Property</h3>
              <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                Research available listings online and establish your criteria (location, access to ski lifts, snow clearing capabilities, property type, and budget). Review our <Link href="/properties">property listings</Link> or contact Love Live Myoko to discuss offline opportunities.
              </p>
            </div>

            {/* Step 2 */}
            <div className="card" style={{ padding: '2rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent-primary)', display: 'block', marginBottom: '0.5rem' }}>Step 2</span>
              <h3 className="u-mb-4">Viewing Properties</h3>
              <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                Inspect target properties in person or via detailed video walkthroughs. For snow country properties, evaluating roof condition, foundation integrity, driveway snow access, and heating systems is critical.
              </p>
            </div>

            {/* Step 3 */}
            <div className="card" style={{ padding: '2rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent-primary)', display: 'block', marginBottom: '0.5rem' }}>Step 3</span>
              <h3 className="u-mb-4">Making an Offer (Letter of Intent)</h3>
              <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                Submit a formal written Letter of Intent (<em>Kaitatsu-shō</em>) to the seller outlining your offered price, target closing date, payment terms, and any contingencies.
              </p>
            </div>

            {/* Step 4 */}
            <div className="card" style={{ padding: '2rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent-primary)', display: 'block', marginBottom: '0.5rem' }}>Step 4</span>
              <h3 className="u-mb-4">Purchase Agreement & Explanation of Important Matters</h3>
              <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                A licensed real estate agent reviews the official Explanation of Important Matters (<em>Jūyō-jikō-setsumei</em>), detailing title boundaries, zone restrictions, and public utilities. Upon approval, both parties sign the Sale & Purchase Contract (<em>Baibai-keiyakusho</em>), and the buyer pays a deposit (typically 5% to 10%).
              </p>
            </div>

            {/* Step 5 */}
            <div className="card" style={{ padding: '2rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent-primary)', display: 'block', marginBottom: '0.5rem' }}>Step 5</span>
              <h3 className="u-mb-4">Payment & Settlement</h3>
              <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                Arrange final funds transfer via international bank wire. On settlement day, the remaining balance, agent commission, judicial scrivener fees, and prorated property taxes are settled.
              </p>
            </div>

            {/* Step 6 */}
            <div className="card" style={{ padding: '2rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent-primary)', display: 'block', marginBottom: '0.5rem' }}>Step 6</span>
              <h3 className="u-mb-4">Registration (Judicial Scrivener)</h3>
              <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                A licensed Judicial Scrivener (<em>Shihō-shoshi</em>) confirms full payment receipt and submits title registration documents directly to the Japanese Legal Affairs Bureau (<em>Hōmukyoku</em>) to transfer official ownership.
              </p>
            </div>

            {/* Step 7 */}
            <div className="card" style={{ padding: '2rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent-primary)', display: 'block', marginBottom: '0.5rem' }}>Step 7</span>
              <h3 className="u-mb-4">Receiving the Keys</h3>
              <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                Once registration documents are executed, physical keys and property documents are handed over to the buyer or their appointed representative.
              </p>
            </div>

            {/* Step 8 */}
            <div className="card" style={{ padding: '2rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent-primary)', display: 'block', marginBottom: '0.5rem' }}>Step 8</span>
              <h3 className="u-mb-4">After Purchase Support</h3>
              <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                Transfer utility accounts (electricity, water, gas, internet), secure building insurance, and establish seasonal maintenance or <Link href="/management">property management services</Link>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Purchasing Costs Breakdown */}
      <section className="section">
        <div className="layout__container">
          <div className="stack stack--lg" style={{ maxWidth: '850px', margin: '0 auto' }}>
            <h2 className="u-text-center">Understanding Purchasing Costs & Taxes</h2>
            <p className="text--lead" style={{ lineHeight: '1.8' }}>
              Purchasing real estate in Japan incurs transactional fees and government taxes in addition to the property purchase price. Total closing costs typically range between 6% and 8% of the property value.
            </p>

            <div className="grid grid--2-cols" style={{ gap: '1.5rem', marginTop: '1.5rem' }}>
              <div style={{ padding: '1.5rem', background: 'var(--color-bg-muted)', borderRadius: '8px' }}>
                <h4 className="u-mb-2">Judicial Scrivener Fees</h4>
                <p className="text--small">Fee paid to the legal professional for handling title verification and government registry submission.</p>
              </div>

              <div style={{ padding: '1.5rem', background: 'var(--color-bg-muted)', borderRadius: '8px' }}>
                <h4 className="u-mb-2">Registration & License Tax</h4>
                <p className="text--small">Government tax levied on registering the transfer of land and building ownership at closing.</p>
              </div>

              <div style={{ padding: '1.5rem', background: 'var(--color-bg-muted)', borderRadius: '8px' }}>
                <h4 className="u-mb-2">Real Estate Acquisition Tax</h4>
                <p className="text--small">One-time prefectural tax calculated on government assessed land/building values, invoiced several months post-closing.</p>
              </div>

              <div style={{ padding: '1.5rem', background: 'var(--color-bg-muted)', borderRadius: '8px' }}>
                <h4 className="u-mb-2">Revenue Stamp Duty</h4>
                <p className="text--small">Government tax stamp affixed to the official Sale & Purchase Contract based on contract value.</p>
              </div>

              <div style={{ padding: '1.5rem', background: 'var(--color-bg-muted)', borderRadius: '8px' }}>
                <h4 className="u-mb-2">Real Estate Agency Fee</h4>
                <p className="text--small">Standard licensed brokerage commission (up to 3% + ¥60,000 + consumption tax) where applicable.</p>
              </div>

              <div style={{ padding: '1.5rem', background: 'var(--color-bg-muted)', borderRadius: '8px' }}>
                <h4 className="u-mb-2">Annual Property Taxes & Insurance</h4>
                <p className="text--small">Prorated Annual Fixed Asset Tax, City Planning Tax, and fire/earthquake building insurance premiums.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Overseas & Foreign Buyers Guide */}
      <section className="section section--muted">
        <div className="layout__container">
          <div className="u-text-center u-mb-12">
            <h2>Guidance for Overseas & Non-Resident Buyers</h2>
            <p className="text--lead">Key considerations for international buyers purchasing from abroad.</p>
          </div>

          <div className="grid grid--2-cols" style={{ gap: '2rem' }}>
            <div className="card">
              <div className="card__content">
                <h3 className="u-mb-4">Do I Need Residency or a Local Visa?</h3>
                <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                  No. Foreigners do not require Japanese residency, a long-term visa, or citizenship to buy real estate in Japan. Overseas buyers can purchase property freely while living anywhere in the world.
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card__content">
                <h3 className="u-mb-4">Can I Buy Remotely From Overseas?</h3>
                <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                  Yes. By granting a Power of Attorney (POA) to a trusted local representative or Judicial Scrivener, contracts can be executed and title registered without traveling to Japan.
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card__content">
                <h3 className="u-mb-4">Do I Need a Japanese Bank Account?</h3>
                <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                  No. International wire transfers directly to the seller or judicial scrivener trust accounts are standard for non-resident transactions. For ongoing utility and tax payments, property management services handle local disbursements.
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card__content">
                <h3 className="u-mb-4">Identity Verification Requirements</h3>
                <p style={{ lineHeight: '1.7', color: 'var(--color-text-primary)' }}>
                  Overseas individual buyers submit a notarized Affidavit or Signature Certificate from their home country along with a passport copy to satisfy Japanese legal registration requirements.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="section">
        <div className="layout__container">
          <div className="u-text-center u-mb-16">
            <h2>Frequently Asked Questions About Buying Property</h2>
            <p className="text--lead" style={{ maxWidth: '800px', margin: '0 auto' }}>
              Clear, practical answers based on real transaction experience in Japan.
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

      {/* Helpful Tips Section */}
      <section className="section section--muted">
        <div className="layout__container">
          <div className="u-text-center u-mb-12">
            <h2>Helpful Tips for Property Buyers in Myoko</h2>
            <p className="text--lead">Practical advice for evaluating mountain real estate.</p>
          </div>

          <div className="grid grid--3-cols" style={{ gap: '2rem' }}>
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <h4 className="u-mb-2">Visit Across Different Seasons</h4>
              <p className="text--small">Experience Myoko during both deep winter powder and green summer months to understand seasonal variations.</p>
            </div>

            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <h4 className="u-mb-2">Understand Snow Management</h4>
              <p className="text--small">Evaluate roof snow-shedding design, snow blowing access, and local road snow clearing schedules.</p>
            </div>

            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <h4 className="u-mb-2">Budget for Ongoing Maintenance</h4>
              <p className="text--small">Factor in winterizing, heating system maintenance, and regular building upkeep. See our <Link href="/maintenance">maintenance guide</Link>.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Work With Love Live Myoko? */}
      <section className="section">
        <div className="layout__container">
          <div className="stack stack--lg" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
            <h2>Why Work With Love Live Myoko?</h2>
            <p className="text--lead" style={{ lineHeight: '1.8' }}>
              We provide practical, on-the-ground representation for international and domestic property buyers.
            </p>
            <p style={{ lineHeight: '1.8', color: 'var(--color-text-primary)' }}>
              Founder David Bolwell brings ~25 years of living in Japan and extensive local experience across Myoko and Joetsu. We coordinate seamlessly with local real estate agents, judicial scriveners, municipal offices, and contractors, ensuring your property journey is transparent and stress-free. Read more <Link href="/about">about our story</Link> or explore our <Link href="/purchase-property">buyer consultation services</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="section section--muted final-cta" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div className="layout__container">
          <div className="u-text-center">
            <div className="stack stack--lg">
              <h2>Ready to discuss buying property in Myoko?</h2>
              <p className="text--lead" style={{ maxWidth: '700px', margin: '0 auto' }}>
                Reach out to our team to discuss your goals, property criteria, or questions about the buying process.
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
