import Link from 'next/link';
import MembershipPlans from '@/components/membership/MembershipPlans';
import styles from './membership.module.css';

export const metadata = {
    title: 'Property Finder memberships | Love Live Myoko',
    description: 'Compare upcoming Basic and Premium Property Finder memberships, including Premium Saved Properties and Property Alerts. Subscriptions are not available to purchase yet.',
};

export default function MembershipPage() {
    return <div className={styles.page}>
        <div className={styles.container}>
            <header className={styles.intro}>
                <div><p className={styles.eyebrow}>LOVE LIVE MYOKO · PROPERTY FINDER</p><h1>A membership for your property search.</h1></div>
                <p className={styles.description}>Compare our upcoming monthly membership plans. Subscriptions are not available to purchase yet.</p>
            </header>
            <MembershipPlans />
            <section id="property-alerts" className={styles.alertDetails} aria-labelledby="property-alerts-title">
                <div>
                    <p className={styles.eyebrow}>PREMIUM EXCLUSIVE</p>
                    <h2 id="property-alerts-title">Property Alerts for the areas you love.</h2>
                    <p>New discoveries, delivered when they match your preferred areas. Property Alerts is included exclusively with Premium membership.</p>
                </div>
                <ol className={styles.alertSteps}>
                    <li><strong>Select your areas.</strong> Choose Myoko, Joetsu, Shinano Town / Kurohime and Iizuna, in any combination.</li>
                    <li><strong>Hear about new matches.</strong> Receive one daily email containing newly discovered properties that match your areas, only when there are new matching listings.</li>
                    <li><strong>Go straight to the source.</strong> Follow direct links from the email to the original Japanese property websites.</li>
                    <li><strong>Stay in control.</strong> Manage your preferred areas or disable notifications from your account page.</li>
                </ol>
            </section>
            <section className={styles.information} aria-label="Membership information">
                <p>Registration is free and does not provide access to Property Finder listings. No payment is taken and no subscription starts when you register.</p>
                <p>Saved Properties and Property Alerts are implemented; paid member access will open when subscriptions launch. Interactive map viewing is planned for a future release. The eligible membership-fee refund is an intended Premium benefit, not an active online refund service. Any refund would be subject to verification and would not be automatic.</p>
                <nav className={styles.links} aria-label="Membership navigation">
                    <Link href="/login">Already registered? Sign in</Link>
                    <Link href="/account">Your account</Link>
                    <Link href="/property-finder">About Property Finder</Link>
                </nav>
                <nav className={styles.links} aria-label="Membership terms">
                    <Link href="/terms-of-service">Terms of Service</Link>
                    <Link href="/privacy-policy">Privacy Policy</Link>
                    <Link href="/commercial-disclosure">Commercial Disclosure</Link>
                </nav>
            </section>
        </div>
    </div>;
}
