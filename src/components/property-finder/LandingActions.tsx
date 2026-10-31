'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchAccount } from '@/lib/auth/client';
import styles from './finder.module.css';

export function LandingActionLinks({ signedIn = false }: { signedIn?: boolean }) {
    return <div className={styles.heroActions}>
        {signedIn ? <><Link href="/property-finder/search/" className="button button--primary">Browse Properties</Link><Link href="/account/" className="button button--secondary">My Account</Link></>
            : <><Link href="/membership/" className="button button--primary">View Membership Plans</Link><Link href="/login/?next=%2Fproperty-finder%2Fsearch%2F" className="button button--secondary">Log In</Link><Link href="/property-finder/search/" className={styles.textLink}>Explore Properties <span aria-hidden="true">↗</span></Link></>}
    </div>;
}
export default function LandingActions() {
    const [signedIn, setSignedIn] = useState(false);
    const generation = useRef(0);
    const load = useCallback(async () => {
        const current = ++generation.current;
        try {
            const account = await fetchAccount();
            if (current === generation.current) setSignedIn(account.user.verified && account.sessionExpiresAt > Date.now());
        } catch { if (current === generation.current) setSignedIn(false); }
    }, []);
    useEffect(() => {
        const initial = window.setTimeout(() => { void load(); }, 0);
        const clear = () => { generation.current++; setSignedIn(false); };
        const visible = () => { if (document.visibilityState === 'visible') void load(); };
        const pageShow = (event: PageTransitionEvent) => { if (event.persisted) { clear(); void load(); } };
        const channel = 'BroadcastChannel' in window ? new BroadcastChannel('llm-auth') : null;
        if (channel) channel.onmessage = event => { if (event.data === 'signed-out') clear(); };
        window.addEventListener('llm-signout', clear); window.addEventListener('pageshow', pageShow); document.addEventListener('visibilitychange', visible);
        return () => { clear(); window.clearTimeout(initial); channel?.close(); window.removeEventListener('llm-signout', clear); window.removeEventListener('pageshow', pageShow); document.removeEventListener('visibilitychange', visible); };
    }, [load]);
    return <LandingActionLinks signedIn={signedIn} />;
}
