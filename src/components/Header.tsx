'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Header() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <header className="header">
            <div className="layout__container header__inner">
                <div className="header__logo">
                    <Link href="/">LiveLoveMyoko</Link>
                </div>

                <nav className="header__nav">
                    <Link href="/management" className="header__link">
                        Management
                    </Link>
                    <Link href="/maintenance" className="header__link">
                        Maintenance
                    </Link>
                    <Link href="/purchase-property" className="header__link">
                        Purchase Property
                    </Link>
                    <Link href="/properties" className="header__link">
                        Properties
                    </Link>
                </nav>

                <div className="header__actions">
                    <a href="mailto:info@love-live-myoko.com" className="header__cta">
                        Contact
                    </a>

                    <button
                        className="header__hamburger"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        aria-label="Open menu"
                        aria-expanded={mobileMenuOpen}
                    >
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            <div className={`header__mobile-menu ${mobileMenuOpen ? 'header__mobile-menu--open' : ''}`}>
                <button
                    className="header__mobile-close"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Close menu"
                >
                    <span></span>
                    <span></span>
                </button>

                <nav className="header__mobile-nav">
                    <Link
                        href="/management"
                        className="header__mobile-link"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        Management
                    </Link>
                    <Link
                        href="/maintenance"
                        className="header__mobile-link"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        Maintenance
                    </Link>
                    <Link
                        href="/purchase-property"
                        className="header__mobile-link"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        Purchase Property
                    </Link>
                    <Link
                        href="/properties"
                        className="header__mobile-link"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        Properties
                    </Link>
                </nav>

                <div className="header__mobile-cta">
                    <a href="mailto:info@love-live-myoko.com" className="header__cta header__cta--mobile">
                        Contact
                    </a>
                </div>
            </div>
        </header>
    );
}
