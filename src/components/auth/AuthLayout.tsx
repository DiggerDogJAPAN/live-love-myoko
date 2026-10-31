import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './auth-layout.module.css';

export default function AuthLayout({ title, description, children, embedded = false }: {
    title: string; description: string; children: ReactNode; embedded?: boolean;
}) {
    return <div className={embedded ? styles.embedded : styles.page}><div className={styles.container}>
        <header className={styles.intro}>
            <p className={styles.eyebrow}>LOVE LIVE MYOKO · PROPERTY FINDER</p>
            <h1>{title}</h1>
            <p className={styles.description}>{description}</p>
            <nav className={styles.navigation} aria-label="Sign-in help">
                <Link href="/forgot-password/">Reset password<span aria-hidden="true">→</span></Link>
                <Link href="/verify-email/">Verify email<span aria-hidden="true">→</span></Link>
                <Link href="/membership/">Membership options<span aria-hidden="true">→</span></Link>
            </nav>
        </header>
        <div className={styles.formColumn}>{children}</div>
    </div></div>;
}
