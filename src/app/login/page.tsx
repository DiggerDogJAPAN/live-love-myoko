import AuthForm from '@/components/auth/AuthForm';
import styles from '@/components/auth/auth.module.css';
export const metadata = { title: 'Sign in | Love Live Myoko', robots: { index: false, follow: false } };
export default function Page() {
    return <div className={styles.page}><div className="layout__container"><header className={styles.intro}><p className={styles.eyebrow}>Love Live Myoko · Property Finder</p><h1>Sign in</h1><p>Welcome back. Sign in to manage your Property Finder account.</p></header><AuthForm mode="login" /></div></div>;
}
