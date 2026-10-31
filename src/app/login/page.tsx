import Link from 'next/link';
import AuthForm from '@/components/auth/AuthForm';
import styles from './login.module.css';
export const metadata = { title: 'Sign in | Love Live Myoko', robots: { index: false, follow: false } };
export default function Page() {
    return <div className={styles.page}><div className={styles.container}>
        <header className={styles.intro}>
            <p className={styles.eyebrow}>LOVE LIVE MYOKO · PROPERTY FINDER</p>
            <h1>Sign in</h1>
            <p className={styles.description}>Welcome back. Sign in to manage your Property Finder account.</p>
            <nav className={styles.navigation} aria-label="Sign-in help">
                <Link href="/forgot-password/">Reset password<span aria-hidden="true">→</span></Link>
                <Link href="/verify-email/">Verify email<span aria-hidden="true">→</span></Link>
                <Link href="/membership/">Membership options<span aria-hidden="true">→</span></Link>
            </nav>
        </header>
        <div className={styles.formColumn}><AuthForm mode="login" /></div>
    </div></div>;
}
