import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './privacy-policy.module.css';

const canonical = 'https://love-live-myoko.com/privacy-policy/';
const description = 'How Love Live Myoko, operated by MYOKO WORKS LLC in Japan, handles account information, Property Finder preferences, enquiries and privacy requests.';

export const metadata: Metadata = {
    title: 'Privacy Policy | Love Live Myoko',
    description,
    alternates: { canonical },
    openGraph: { title: 'Privacy Policy | Love Live Myoko', description, url: canonical, type: 'website' },
};

export default function PrivacyPolicyPage() {
    return (
        <div className={styles.page}>
            <div className="layout__container">
                <article className={styles.policy} aria-labelledby="privacy-policy-heading">
                    <header className={styles.header}>
                        <h1 id="privacy-policy-heading">Privacy Policy</h1>
                        <p className={styles.updated}>Last updated: <time dateTime="2026-10-31">31 October 2026</time></p>
                    </header>

                    <p>Love Live Myoko (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is operated by MYOKO WORKS LLC (<span lang="ja">合同会社 MYOKO WORKS</span>), a company based in Japan.</p>
                    <p>We respect your privacy and are committed to handling personal information responsibly. This Privacy Policy explains what information we collect, how we use it, which third-party services we work with, and the choices and rights available to you.</p>

                    <section aria-labelledby="information-we-collect">
                        <h2 id="information-we-collect">1. Information We Collect</h2>
                        <p>Depending on how you use our website and services, we may collect the following information.</p>
                        <h3>Account information</h3>
                        <p>When you create an account, we collect information such as your name, email address, account identifiers and information necessary for authentication and account recovery.</p>
                        <h3>Membership information</h3>
                        <p>We may store your membership level (Basic or Premium), membership status, access permissions, subscription dates and related account information.</p>
                        <h3>Property Finder information</h3>
                        <p>When you use Property Finder features, we may store saved properties, Property Alerts preferences, and information required to provide requested notifications, including delivery records.</p>
                        <h3>Enquiry information</h3>
                        <p>When you contact us about properties, accommodation or our services, we may receive your name, contact details, property interests and other information you voluntarily provide. Enquiry links on our website open your email application.</p>
                        <h3>Technical and usage information</h3>
                        <p>When you access our website, technical information such as IP addresses, browser information, device details, security events and website performance information may be processed by us or our service providers.</p>
                        <h3>Payment and subscription information</h3>
                        <p>Payments for Basic and Premium Property Finder memberships are processed securely through Stripe. We receive and retain Stripe customer and subscription identifiers, membership status, payment status, billing dates and relevant billing and transaction records necessary to administer paid memberships.</p>
                        <p>Stripe processes payment card information through its hosted payment infrastructure. Love Live Myoko does not store complete payment card details in its own database.</p>
                        <p>Please avoid sending sensitive personal information unless it is necessary for your enquiry and an appropriate method of submission has been provided.</p>
                    </section>

                    <section aria-labelledby="how-we-use-your-information">
                        <h2 id="how-we-use-your-information">2. How We Use Your Information</h2>
                        <p>We use personal information to:</p>
                        <ul>
                            <li>Create, verify and manage user accounts.</li>
                            <li>Authenticate users and maintain account security.</li>
                            <li>Provide Property Finder services and membership features.</li>
                            <li>Manage Basic and Premium membership access.</li>
                            <li>Save properties and manage user preferences.</li>
                            <li>Send Property Alerts requested by users.</li>
                            <li>Respond to property and accommodation enquiries.</li>
                            <li>Provide customer service and technical support.</li>
                            <li>Process and manage paid memberships, recurring subscriptions, renewals, cancellations and relevant payment records through Stripe.</li>
                            <li>Maintain website functionality, performance and security.</li>
                            <li>Prevent fraud, misuse and unauthorised access.</li>
                            <li>Comply with applicable legal, accounting and regulatory obligations.</li>
                        </ul>
                        <p>Property Alerts are provided as a requested service and do not automatically enrol users in unrelated marketing communications.</p>
                    </section>

                    <section aria-labelledby="property-finder-memberships">
                        <h2 id="property-finder-memberships">3. Property Finder Memberships</h2>
                        <p>Love Live Myoko provides account-based Property Finder services. When you register, we process information necessary to create and operate your account.</p>
                        <p>Creating an account does not itself provide Property Finder access. Basic membership includes the Property Finder directory, aggregated Japanese property listings, search filters and sorting, and direct links to original Japanese property websites. Premium includes everything in Basic, saved properties and Property Alerts.</p>
                        <p>Supabase provides account authentication and database services. Membership access is managed through secure authentication and server-side authorisation.</p>
                        <p>You can manage available Property Alerts preferences through your account. Requested alerts contain newly discovered properties matching your selected areas, with at most one daily email when there are new matches. They do not guarantee an email every day.</p>
                        <p>Disabling Property Alerts prevents future eligible notifications but does not automatically delete historical delivery records.</p>
                        <p>Basic and Premium memberships are billed monthly in Japanese yen through Stripe. Subscriptions renew automatically unless cancelled. Members can manage and cancel their subscriptions through their account. We process subscription and billing information to administer payments, membership access and cancellation requests.</p>
                        <p>Cancellation stops future recurring subscription charges. Unless otherwise stated at checkout or required by applicable law, cancellation takes effect at the end of the current paid billing period, and membership benefits remain available until that date.</p>
                        <p>Billing, cancellation and refund conditions are described in our <Link href="/terms-of-service">Terms of Service</Link> and <Link href="/commercial-disclosure">Commercial Disclosure</Link>.</p>
                    </section>

                    <section aria-labelledby="cookies-and-similar-technologies">
                        <h2 id="cookies-and-similar-technologies">4. Cookies and Similar Technologies</h2>
                        <p>Our website uses necessary cookies to support account authentication, login sessions, account verification and password recovery. These cookies help us provide and secure the services you request.</p>
                        <p>We also use website performance analytics and third-party resources, including maps, fonts and property listing images. These external services may receive technical information when your browser connects to them. Some resources load automatically when you view the relevant pages.</p>
                        <p>We aim to minimise unnecessary tracking and do not use authentication cookies for advertising purposes.</p>
                        <p>You can manage cookies through your browser settings. Disabling necessary cookies may prevent some account features from functioning correctly. Browser cookie settings may not prevent every external resource request.</p>
                    </section>

                    <section aria-labelledby="third-party-service-providers">
                        <h2 id="third-party-service-providers">5. Third-Party Service Providers</h2>
                        <p>We use third-party services to operate, secure and maintain Love Live Myoko. These include:</p>
                        <h3>Supabase</h3>
                        <p>Provides user authentication, database infrastructure, membership-related information and account functionality.</p>
                        <h3>Cloudflare</h3>
                        <p>Provides website hosting, content delivery, security and website performance analytics.</p>
                        <h3>Resend</h3>
                        <p>Provides email delivery services for requested Property Alerts.</p>
                        <h3>Stripe</h3>
                        <p>Stripe processes payments and related billing information for Basic and Premium Property Finder subscriptions, including recurring payments, renewals and subscription management. We share the account and billing information necessary to provide these services and receive relevant subscription and transaction records.</p>
                        <p>Stripe processes payment card information through its hosted payment infrastructure. Love Live Myoko does not store complete payment card details in its own database. Stripe also processes information for its own legal, security and payment-compliance purposes as described in <a href="https://stripe.com/privacy">Stripe&apos;s Privacy Policy</a>.</p>
                        <h3>Google</h3>
                        <p>Certain website features use Google services, including fonts and map functionality.</p>
                        <h3>External Property Listing Websites</h3>
                        <p>Some property information, photographs and links originate from third-party property listing websites. Your browser may connect to those services when loading externally hosted images or visiting their websites.</p>
                        <h3>Email Service Providers</h3>
                        <p>We use email services to handle account-related messages, enquiries and other necessary communications.</p>
                        <p>We do not sell your personal information to advertisers.</p>
                    </section>

                    <section aria-labelledby="international-data-processing">
                        <h2 id="international-data-processing">6. International Data Processing</h2>
                        <p>Love Live Myoko is operated from Japan. Some of our technology providers operate internationally, and personal information may be processed, stored or accessed outside Japan.</p>
                        <p>International transfers and third-party processing are subject to applicable legal requirements, including any required safeguards. The applicable arrangements depend on the service provider and the laws that apply.</p>
                        <p>We do not represent that all personal information is stored exclusively in Japan.</p>
                    </section>

                    <section aria-labelledby="data-retention">
                        <h2 id="data-retention">7. Data Retention</h2>
                        <p>We retain personal information for as long as reasonably necessary to provide our services, fulfil the purposes described in this policy and comply with applicable legal obligations. Retention depends on the type of information and its purpose.</p>
                        <h3>Account information</h3>
                        <p>Account information is generally retained while your account remains active and for an appropriate period afterwards where necessary.</p>
                        <h3>Saved properties and preferences</h3>
                        <p>Saved properties and Property Alerts preferences are retained as necessary to provide the relevant services.</p>
                        <h3>Email delivery information</h3>
                        <p>Resolved Property Alerts delivery history, including recipient addresses and listing payloads, is normally removed after 90 days. Unresolved deliveries, open privacy requests and records subject to investigation or legal holds may be retained while necessary.</p>
                        <p>Minimal records are retained as needed to prevent duplicate notifications and honour existing unsubscribe links. These records do not retain the historical email address or listing payload.</p>
                        <h3>Privacy requests</h3>
                        <p>We keep minimal request records, such as request type, dates, status and necessary outcome notes, for up to three years after closure where needed for accountability, legal obligations or disputes. Explanatory details are removed on reviewed closure unless a retention hold applies.</p>
                        <h3>Enquiry correspondence</h3>
                        <p>Correspondence may be retained for customer service, transaction management and legitimate business recordkeeping.</p>
                        <h3>Payment and subscription records</h3>
                        <p>We retain relevant Stripe subscription and transaction records for subscription administration, accounting, tax, legal compliance and payment disputes where necessary.</p>
                        <p>Certain records may need to be retained even after an account is closed, where permitted or required by law.</p>
                        <h3>Technical and security records</h3>
                        <p>Technical logs and security-related information may be retained for appropriate operational and security purposes.</p>
                        <p>Information may also remain temporarily in backups or third-party systems under applicable retention arrangements. We aim not to keep personal information longer than necessary.</p>
                    </section>

                    <section aria-labelledby="information-security">
                        <h2 id="information-security">8. Information Security</h2>
                        <p>We use technical and organisational measures intended to protect personal information from unauthorised access, disclosure, alteration, misuse or loss. These measures include:</p>
                        <ul>
                            <li>Secure account authentication.</li>
                            <li>Restricted database access.</li>
                            <li>Server-side membership authorisation.</li>
                            <li>Secure session handling.</li>
                            <li>Access controls for private account information.</li>
                            <li>Limited operational diagnostics for reliability and security.</li>
                        </ul>
                        <p>Although we take reasonable steps to protect information, no internet-based service can guarantee absolute security.</p>
                    </section>

                    <section aria-labelledby="your-privacy-rights">
                        <h2 id="your-privacy-rights">9. Your Privacy Rights</h2>
                        <p>Depending on the laws applicable to your personal information, you may have rights to:</p>
                        <ul>
                            <li>Request access to personal information we hold about you.</li>
                            <li>Request correction of inaccurate or outdated information.</li>
                            <li>Request deletion of personal information where applicable.</li>
                            <li>Request information about how personal information is used or disclosed.</li>
                            <li>Withdraw optional consent where relevant.</li>
                            <li>Unsubscribe from optional communications.</li>
                            <li>Request a copy of certain personal information.</li>
                        </ul>
                        <p>You can submit access, correction, deletion or information requests in the Privacy &amp; Data Requests section of <Link href="/account">your account</Link> and view their status there. You can also contact us using the details below, including if you cannot sign in or do not have an account. We may need to verify your identity before processing a request.</p>
                        <p>Some requests may be subject to applicable legal exceptions, security requirements or mandatory record-retention obligations. We will respond to privacy requests in accordance with applicable law.</p>
                    </section>

                    <section aria-labelledby="account-deletion">
                        <h2 id="account-deletion">10. Account Deletion</h2>
                        <p>To request closure of your Love Live Myoko account, use Request Account Deletion in <Link href="/account">your account</Link> and confirm the request, or contact us using the details below. Submitting a request does not immediately delete your account.</p>
                        <p>An administrator reviews the request, verifies identity, checks relevant billing and retention obligations, and handles the associated records before completing deletion. We may need to resolve outstanding deliveries or other records first. A minimal case record may remain after processing.</p>
                        <p>We may need to verify your identity and confirm the status of any active services or subscriptions.</p>
                        <p>Where applicable, we will close your account and delete or anonymise personal information that is no longer required. Certain information may be retained where necessary for legal compliance, accounting, disputes, security or other lawful purposes.</p>
                        <p>Account deletion does not automatically cancel an active subscription unless the account deletion process expressly confirms that the subscription has also been cancelled. You can manage and cancel your subscription through your account, as described in our <Link href="/terms-of-service">Terms of Service</Link>.</p>
                    </section>

                    <section aria-labelledby="external-websites">
                        <h2 id="external-websites">11. External Websites</h2>
                        <p>Our website may contain links to external property listings, accommodation providers, maps and other independently operated websites.</p>
                        <p>These websites may have their own privacy policies and data-handling practices. We are not responsible for the privacy practices of independently operated third-party websites.</p>
                        <p>We recommend reviewing their policies when using their services.</p>
                    </section>

                    <section aria-labelledby="changes-to-this-privacy-policy">
                        <h2 id="changes-to-this-privacy-policy">12. Changes to This Privacy Policy</h2>
                        <p>We may update this Privacy Policy to reflect changes in our services, technology, business operations or applicable legal requirements.</p>
                        <p>The current version will be published on this page with its latest revision date. Where required by applicable law, we will provide additional notice of material changes.</p>
                    </section>

                    <section aria-labelledby="contact-information">
                        <h2 id="contact-information">13. Contact Information</h2>
                        <p><strong>MYOKO WORKS LLC</strong><br /><span lang="ja">合同会社 MYOKO WORKS</span></p>
                        <p><strong>Representative:</strong> David Bolwell</p>
                        <p><strong>Address:</strong><br /><span lang="ja">〒942-0041<br />新潟県上越市安江6-21</span><br />Japan</p>
                        <p><strong>Telephone:</strong> <a href="tel:+81255420049">0255-42-0049</a></p>
                        <p><strong>Website:</strong> <a href="https://love-live-myoko.com">love-live-myoko.com</a></p>
                        <p>For privacy-related enquiries, access or correction requests, or account deletion requests, please contact us at <a href="mailto:info@love-live-myoko.com">info@love-live-myoko.com</a>.</p>
                    </section>
                </article>
            </div>
        </div>
    );
}
