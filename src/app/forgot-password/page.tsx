import AuthForm from '@/components/auth/AuthForm';
import styles from '@/components/auth/auth.module.css';
export const metadata = { title: 'Reset your password | Love Live Myoko', robots: { index: false, follow: false } };
export default function Page() {
    return <div className={styles.page}><div className="layout__container"><header className={styles.intro}><p className={styles.eyebrow}>Love Live Myoko · Property Finder</p><h1>Reset your password</h1><p>Enter your email address and we’ll send a secure password reset link.</p></header><AuthForm mode="forgot" /></div></div>;
}
