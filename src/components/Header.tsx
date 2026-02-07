import Link from 'next/link';

export default function Header() {
    return (
        <header className="header">
            <div className="layout__container header__content">
                <div className="header__logo">
                    <Link href="/">
                        LiveLove
                    </Link>
                </div>
                <nav className="header__nav u-md-flex u-hidden">
                    <Link href="/properties" className="header__link">
                        Properties
                    </Link>
                    <Link href="/management" className="header__link">
                        Management
                    </Link>
                    <Link href="/maintenance" className="header__link">
                        Maintenance
                    </Link>
                    <Link href="/purchase-property" className="header__link">
                        Purchase Property
                    </Link>
                </nav>
            </div>
        </header>
    );
}
