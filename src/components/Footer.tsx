'use client';

import Link from 'next/link';

export default function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="footer">
            <div className="layout__container footer__content">
                <div className="footer__grid">
                    {/* Brand Section */}
                    <div className="footer__section footer__section--brand">
                        <h3 className="footer__brand">LiveLoveMyoko</h3>
                        <p className="footer__description">
                            Property management, maintenance, and purchasing support for homes in Japan.
                        </p>
                    </div>

                    {/* Navigation Links */}
                    <div className="footer__section footer__section--nav">
                        <h4 className="footer__heading">Navigation</h4>
                        <nav className="footer__nav">
                            <Link href="/properties" className="footer__link">Properties</Link>
                            <Link href="/management" className="footer__link">Management</Link>
                            <Link href="/maintenance" className="footer__link">Maintenance</Link>
                            <Link href="/purchase-property" className="footer__link">Purchase Property</Link>
                        </nav>
                    </div>

                    {/* Contact Section */}
                    <div className="footer__section footer__section--contact">
                        <h4 className="footer__heading">Contact</h4>
                        <a href="mailto:info@love-live-myoko.com" className="footer__link footer__link--email">
                            info@love-live-myoko.com
                        </a>
                    </div>
                </div>
            </div>

            {/* Bottom Copyright Bar */}
            <div className="footer__bottom">
                <div className="layout__container">
                    <p className="footer__license">
                        Minpaku Management Licence: 国士交通大臣（01）第F05136号
                    </p>
                    <p className="footer__copyright">
                        © {currentYear} LiveLoveMyoko. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
}
