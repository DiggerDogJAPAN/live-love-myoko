import Link from 'next/link';
import MembershipPlans from '@/components/membership/MembershipPlans';
import styles from './membership.module.css';

export const metadata = {
    title: 'Property Finder memberships | Love Live Myoko',
    description: 'Compare upcoming Basic and Premium Property Finder memberships. Subscriptions are not available to purchase yet.',
};

export default function MembershipPage() {
    return <div className={styles.page}>
        <div className={styles.container}>
            <header className={styles.intro}>
                <div><p className={styles.eyebrow}>LOVE LIVE MYOKO · PROPERTY FINDER</p><h1>A membership for your property search.</h1></div>
                <p className={styles.description}>Compare our upcoming monthly membership plans. Subscriptions are not available to purchase yet.</p>
            </header>
            <MembershipPlans />
            <section className={styles.information} aria-label="Membership information">
                <p>Registration is free and does not provide access to Property Finder listings. No payment is taken and no subscription starts when you register.</p>
                <p>Saved Properties is implemented; paid member access will open when subscriptions launch. Interactive map viewing is planned for a future release. The eligible membership-fee refund is an intended Premium benefit, not an active online refund service. Any refund would be subject to verification and would not be automatic.</p>
                <nav className={styles.links} aria-label="Membership navigation">
                    <Link href="/login">Already registered? Sign in</Link>
                    <Link href="/account">Your account</Link>
                    <Link href="/property-finder">About Property Finder</Link>
                </nav>
            </section>
        </div>
    </div>;
}
