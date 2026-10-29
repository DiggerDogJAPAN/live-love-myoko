import AccountDashboard from '@/components/auth/AccountDashboard';
import styles from '@/components/auth/auth.module.css';
export const metadata = { title: 'Your account | Love Live Myoko', robots: { index: false, follow: false } };
export default function AccountPage() {
    return <div className={styles.page}><div className="layout__container"><header className={styles.intro}><p className={styles.eyebrow}>Love Live Myoko · Property Finder</p><h1>Your account</h1><p>Manage your details and view your membership status.</p></header><AccountDashboard /></div></div>;
}
