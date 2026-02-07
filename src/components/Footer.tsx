export default function Footer() {
    return (
        <footer className="footer section--muted">
            <div className="layout__container footer__content">
                <p>
                    &copy; {new Date().getFullYear()} LiveLove. All rights reserved.
                </p>
            </div>
        </footer>
    );
}
