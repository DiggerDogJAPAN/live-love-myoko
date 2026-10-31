'use client';

import Link from 'next/link';

export default function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="footer">
            <div className="layout__container footer__content">
                <div className="footer__grid">
                    {/* Company Section */}
                    <div className="footer__section footer__section--company">
                        <h4 className="footer__heading">Company</h4>
                        <h3 className="footer__brand">Love Live Myoko</h3>
                        <p className="footer__description">
                            Property management, maintenance, and purchasing support for homes in Japan.
                        </p>
                        <a href="mailto:info@love-live-myoko.com" className="footer__link footer__link--email">
                            info@love-live-myoko.com
                        </a>
                    </div>

                    {/* Navigation Links */}
                    <div className="footer__section footer__section--nav">
                        <h4 className="footer__heading" id="footer-navigation">Navigation</h4>
                        <nav className="footer__nav" aria-labelledby="footer-navigation">
                            <Link href="/accommodation" className="footer__link">Accommodation</Link>
                            <Link href="/properties" className="footer__link">Properties</Link>
                            <Link href="/property-finder" className="footer__link">Property Finder</Link>
                            <Link href="/management" className="footer__link">Property Management</Link>
                            <Link href="/purchase-property" className="footer__link">Purchase Property</Link>
                        </nav>
                    </div>

                    {/* Additional Information */}
                    <div className="footer__section footer__section--info">
                        <h4 className="footer__heading" id="footer-information">Additional Information</h4>
                        <nav className="footer__nav" aria-labelledby="footer-information">
                            <Link href="/about" className="footer__link">About</Link>
                            <Link href="/why-myoko" className="footer__link">Why Myoko?</Link>
                            <Link href="/buying-property-japan" className="footer__link">Buying Property in Japan</Link>
                            <Link href="/property-ownership-costs" className="footer__link">Cost of Owning Property</Link>
                        </nav>
                    </div>

                    {/* Account Links */}
                    <div className="footer__section footer__section--account">
                        <h4 className="footer__heading" id="footer-account">Account</h4>
                        <nav className="footer__nav" aria-labelledby="footer-account">
                            <Link href="/membership" className="footer__link">Finder Memberships</Link>
                            <Link href="/account" className="footer__link">Your Account</Link>
                            <Link href="/terms-of-service" className="footer__link">Terms of Service</Link>
                            <Link href="/privacy-policy" className="footer__link">Privacy Policy</Link>
                            <Link href="/commercial-disclosure" className="footer__link">Commercial Disclosure</Link>
                        </nav>
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
                        © {currentYear} Love Live Myoko. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
}
