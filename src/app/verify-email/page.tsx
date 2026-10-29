import AuthForm from '@/components/auth/AuthForm';
import styles from '@/components/auth/auth.module.css';
export const metadata = { title: 'Verify your email | Love Live Myoko', robots: { index: false, follow: false } };
export default function Page() {
    return <div className={styles.page}><div className="layout__container"><header className={styles.intro}><p className={styles.eyebrow}>Love Live Myoko · Property Finder</p><h1>Verify your email</h1><p>Open the confirmation link in your email, or enter its verification code below.</p></header><AuthForm mode="verify" /></div></div>;
}
