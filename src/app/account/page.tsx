import AccountDashboard from '@/components/auth/AccountDashboard';
import styles from '@/components/auth/account.module.css';
export const metadata = { title: 'Your account | Love Live Myoko', robots: { index: false, follow: false } };
export default function AccountPage() {
    return <div className={styles.page}><div className={styles.container}><AccountDashboard /></div></div>;
}
