import AuthForm from '@/components/auth/AuthForm';
import styles from '@/components/auth/auth.module.css';
export const metadata = { title: 'Create your account | Love Live Myoko', robots: { index: false, follow: false } };
export default function Page() {
    return <div className={styles.page}><div className="layout__container"><header className={styles.intro}><p className={styles.eyebrow}>Love Live Myoko · Property Finder</p><h1>Create your account</h1><p>Begin with an account. Membership purchasing will follow in a later phase.</p></header><AuthForm mode="register" /></div></div>;
}
