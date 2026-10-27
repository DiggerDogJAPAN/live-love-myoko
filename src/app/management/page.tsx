import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import styles from './management.module.css';

export const metadata: Metadata = {
    title: 'Property Management in Myoko | Love Live Myoko',
    description: 'Personal property management in Myoko for overseas owners. Year-round oversight, regular inspections, owner support, rental operations and maintenance coordination.',
    alternates: { canonical: 'https://love-live-myoko.com/management/' },
};

const oversight = [
    { title: 'Your property, checked regularly', description: 'Monthly internal and external inspections, with ventilation to help prevent mould and humidity damage. We look for small issues before they become larger problems.' },
    { title: 'A clear picture, wherever you are', description: 'Regular updates and photographs keep you informed about your home’s condition. Rental owners also receive transparent monthly performance statements.' },
    { title: 'Local help with the practical details', description: 'Key holding, bill payment and administrative support, plus liaison with neighbours and local authorities when you need someone on the ground.' },
];

const rentalServices = [
    { title: 'Guests & arrivals', description: 'Booking enquiries, guest communication, in-person check-ins and 24/7 guest support. Pre-arrival checks cover heating, systems and clear access.' },
    { title: 'Cleaning & turnover', description: 'Professional cleaning, linen rental and restocking between stays, with guest rubbish and recycling handled according to local rules.' },
    { title: 'Compliance & reporting', description: 'Support with guest registries and fire safety standards, alongside transparent monthly owner statements and licensed Minpaku management.' },
    { title: 'Readiness & local response', description: 'Winterising systems, arranging snow clearing and preparing for the green season. Local assistance for boiler failures, leaks and lock-outs during guest stays.' },
];

export default function ManagementPage() {
    return (
        <div className={styles.page}>
            <section className={styles.hero} aria-labelledby="management-title">
                <div className={styles.heroCopy}>
                    <p className={styles.eyebrow}>Property Management in Myoko</p>
                    <h1 id="management-title">Your Myoko property.<em>In local hands.</em></h1>
                    <p className={styles.heroLead}>We look after your property in Myoko, so you can feel at home with owning it from overseas.</p>
                    <p>Complete property management for homes, lodges and holiday rentals. From regular oversight to owner support and rental operations, we take care of the details here in Japan.</p>
                    <div className={styles.actions}>
                        <Link href="mailto:info@love-live-myoko.com" className="button button--primary">Discuss Your Property</Link>
                        <a href="#property-management" className={styles.textLink}>Explore our approach <span aria-hidden="true">↘</span></a>
                    </div>
                </div>
                <figure className={styles.heroPhoto}>
                    <Image src="/images/management-hero.jpg" alt="A Myoko bedroom overlooking the snowy village and Mount Myoko" fill sizes="(max-width: 760px) 100vw, 52vw" unoptimized preload className={styles.cover} />
                    <figcaption><span>Close to your property.</span><strong>Even when you’re far from home.</strong></figcaption>
                </figure>
            </section>

            <div className={styles.introBar}>
                <div className={`layout__container ${styles.introInner}`}>
                    <p>Personal attention.<br /><em>Throughout the year.</em></p>
                    <ul aria-label="Our management approach">
                        <li>Based in Myoko</li>
                        <li>Small, carefully managed portfolio</li>
                        <li>Licensed Minpaku management</li>
                    </ul>
                </div>
            </div>

            <section id="property-management" className={styles.section}>
                <div className={`layout__container ${styles.oversight}`}>
                    <div className={styles.overview}>
                        <p className={styles.eyebrow}>A local partner for overseas owners</p>
                        <h2>Ownership from a distance.<br /><em>Care that stays close.</em></h2>
                        <p>You should be able to enjoy your Myoko property without managing every detail from another country. We provide the ongoing presence, practical support and clear communication that make that possible.</p>
                        <figure className={styles.scenery}>
                            <Image src="/images/myoko-village.jpg" alt="Homes and lodges beneath snow-covered Mount Myoko" width={1000} height={562} sizes="(max-width: 760px) 100vw, 45vw" unoptimized />
                            <figcaption>Local knowledge. Year-round presence.</figcaption>
                        </figure>
                    </div>
                    <div className={styles.oversightList}>
                        {oversight.map((service, index) => (
                            <article className={styles.oversightItem} key={service.title}>
                                <span className={styles.number} aria-hidden="true">0{index + 1}</span>
                                <div><h3>{service.title}</h3><p>{service.description}</p></div>
                            </article>
                        ))}
                        <aside className={styles.repairNote}>
                            <p className={styles.eyebrow}>Maintenance within management</p>
                            <h3>The right people for the work.</h3>
                            <p>When repairs are needed, we coordinate trusted local contractors for plumbing, electrical, heating and roofing work. Preventative maintenance advice supports the wider care of your property.</p>
                        </aside>
                    </div>
                </div>
            </section>

            <section className={styles.rentals} aria-labelledby="rental-title">
                <div className="layout__container">
                    <div className={styles.rentalHeader}>
                        <div><p className={styles.eyebrow}>For holiday rentals & lodges</p><h2 id="rental-title">Your property.<br /><em>Your guests. Our attention.</em></h2></div>
                        <p>For owners welcoming paying guests, our management brings daily rental operations together with the ongoing oversight of your home.</p>
                    </div>
                    <div className={styles.rentalGrid}>
                        {rentalServices.map((service, index) => (
                            <article className={styles.rentalItem} key={service.title}>
                                <span className={styles.number} aria-hidden="true">0{index + 1}</span>
                                <h3>{service.title}</h3><p>{service.description}</p>
                            </article>
                        ))}
                    </div>
                    <div className={styles.licence}>
                        <span>Minpaku Management Licence</span>
                        <strong lang="ja">国士交通大臣（01）第F05136号</strong>
                        <span>Operating within Japanese law</span>
                    </div>
                </div>
            </section>

            <section className={`${styles.section} ${styles.assistance}`}>
                <div className={`layout__container ${styles.assistanceGrid}`}>
                    <div>
                        <p className={styles.eyebrow}>Support for your private home</p>
                        <h2>A home here.<br /><em>A helping hand nearby.</em></h2>
                        <p>Not every property is a holiday rental. General Assistance provides regular home checks and practical support while you are away.</p>
                        <ul className={styles.checkList}>
                            <li>Monthly internal and external inspections and ventilation</li>
                            <li>Bill payment, administration and key holding</li>
                            <li>Local assistance and liaison with neighbours and authorities</li>
                            <li>Vehicle turnover and battery checks where applicable</li>
                        </ul>
                    </div>
                    <aside className={styles.pricePanel}>
                        <p className={styles.eyebrow}>General Assistance</p>
                        <p className={styles.price}><span>From</span> ¥5,000<small>/ month</small></p>
                        <p>This starting price applies to General Assistance. It is separate from full property management fees.</p>
                        <p>We’ll discuss the scope and fees for your property with you.</p>
                        <Link href="mailto:info@love-live-myoko.com" className={styles.textLink}>Talk to us about your home <span aria-hidden="true">↗</span></Link>
                    </aside>
                </div>
            </section>

            <section className={styles.section}>
                <div className={`layout__container ${styles.personal}`}>
                    <figure className={styles.propertyPhoto}>
                        <Image src="/images/accommodations/mountain_base_myoko/featured.jpg" alt="Mountain Base Myoko holiday property with its red roof and mountain backdrop" fill sizes="(max-width: 760px) 100vw, 45vw" unoptimized className={styles.cover} />
                        <figcaption>Myoko is our home, too.</figcaption>
                    </figure>
                    <div>
                        <p className={styles.eyebrow}>Why Love Live Myoko</p>
                        <h2>Management with<br /><em>a personal touch.</em></h2>
                        <p className={styles.statement}>A smaller portfolio.<br />More attention to your home.</p>
                        <p>We intentionally keep our portfolio small. It gives us time to understand each property, stay in touch with its owners and notice the details that matter.</p>
                        <p>For overseas owners, lodge operators and investors, that means an established local partner who treats your property as a long-term responsibility.</p>
                        <Link href="/about" className={styles.textLink}>Get to know Love Live Myoko <span aria-hidden="true">↗</span></Link>
                    </div>
                </div>
            </section>

            <section className={styles.contact}>
                <div className="layout__container">
                    <p className={styles.eyebrow}>Your property. Looked after.</p>
                    <h2>A little closer to Myoko,<br /><em>wherever you call home.</em></h2>
                    <p>Tell us about your property and how you use it. Let’s discuss the right management support for you.</p>
                    <Link href="mailto:info@love-live-myoko.com" className="button button--primary">Let’s Talk About Your Property</Link>
                </div>
            </section>
        </div>
    );
}
