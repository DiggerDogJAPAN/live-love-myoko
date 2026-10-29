import AuthForm from '@/components/auth/AuthForm';
import styles from '@/components/auth/auth.module.css';
export const metadata = { title: 'Choose a new password | Love Live Myoko', robots: { index: false, follow: false } };
export default function Page() {
    return <div className={styles.page}><div className="layout__container"><header className={styles.intro}><p className={styles.eyebrow}>Love Live Myoko · Property Finder</p><h1>Choose a new password</h1><p>Set a new password using the link sent to your email address.</p></header><AuthForm mode="reset" /></div></div>;
}
