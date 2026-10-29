import Link from 'next/link';
import styles from '@/components/auth/auth.module.css';
export const metadata = { title: 'Property Finder memberships | Love Live Myoko', description: 'Explore planned Basic and Premium Property Finder memberships.' };
export default function MembershipPage() {
    return <div className={styles.page}><div className="layout__container"><header className={styles.intro}><p className={styles.eyebrow}>Love Live Myoko · Property Finder</p><h1>A membership for your property search.</h1><p>Compare our planned monthly memberships. Subscriptions are not available to purchase yet.</p></header>
        <div className={styles.plans}>
            <section className={styles.plan} aria-labelledby="basic-plan"><h2 id="basic-plan">Basic</h2><p className={styles.price}>¥2,000 <span>/ month</span></p><ul><li>Access to all Property Finder listings</li><li>Standard search, location and price filters</li></ul><Link href="/register" className="button button--secondary">Create an account</Link></section>
            <section className={styles.plan} aria-labelledby="premium-plan"><h2 id="premium-plan">Premium</h2><p className={styles.price}>¥4,000 <span>/ month</span></p><ul><li>Everything in Basic</li><li>Planned: saved properties and saved searches</li><li>Planned: interactive map viewing</li><li>Planned: an eligible refund of up to three months of Premium fees following a completed property purchase through our agency</li></ul><Link href="/register" className="button button--primary">Create an account</Link></section>
        </div>
        <aside className={styles.notice}><p>Registration is free and does not provide access to Property Finder listings. No payment is taken and no subscription starts when you register.</p><p>Saved properties, saved searches, interactive maps and membership-fee refunds are planned for later phases. Refunds will require verified eligibility; they are not automatic.</p><div className={styles.links}><Link href="/login">Already registered? Sign in</Link><Link href="/account">Your account</Link><Link href="/property-finder">About Property Finder</Link></div></aside>
    </div></div>;
}
