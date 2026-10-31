import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../privacy-policy/privacy-policy.module.css';

const canonical = 'https://love-live-myoko.com/terms-of-service/';
const description = 'Terms for using the Love Live Myoko website, registered accounts and Basic and Premium Property Finder memberships, operated by MYOKO WORKS LLC in Japan.';

export const metadata: Metadata = {
    title: 'Terms of Service | Love Live Myoko',
    description,
    alternates: { canonical },
    openGraph: { title: 'Terms of Service | Love Live Myoko', description, url: canonical, type: 'website' },
};

export default function TermsOfServicePage() {
    return (
        <div className={styles.page}>
            <div className="layout__container">
                <article className={styles.policy} aria-labelledby="terms-of-service-heading">
                    <header className={styles.header}>
                        <h1 id="terms-of-service-heading">Terms of Service</h1>
                        <p className={styles.updated}>Last updated: <time dateTime="2026-10-31">31 October 2026</time></p>
                    </header>

                    <p>Welcome to Love Live Myoko.</p>
                    <p>These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Love Live Myoko website, Property Finder, membership services and related features.</p>
                    <p>Love Live Myoko is operated by <strong>MYOKO WORKS LLC (<span lang="ja">合同会社 MYOKO WORKS</span>)</strong>, a company based in Japan.</p>
                    <p>By creating an account, purchasing a membership or using our services, you agree to these Terms.</p>
                    <p>If you do not agree, please do not use the services.</p>

                    <section aria-labelledby="our-services">
                        <h2 id="our-services">1. Our Services</h2>
                        <p>Love Live Myoko provides information about properties, accommodation and living in the Myoko region and surrounding areas of Japan.</p>
                        <p>Our Property Finder service helps users discover and research property listings collected from various sources.</p>
                        <p>Some features are available publicly, while others require a registered account or paid membership.</p>
                        <p>We may add, modify or discontinue features as our services develop, subject to applicable law and any commitments made to paying members.</p>
                    </section>

                    <section aria-labelledby="eligibility-and-accounts">
                        <h2 id="eligibility-and-accounts">2. Eligibility and Accounts</h2>
                        <p>You must be at least 18 years old to purchase a paid membership.</p>
                        <p>You agree to provide accurate information when registering and to keep your account details reasonably up to date.</p>
                        <p>You are responsible for maintaining the confidentiality of your login credentials and for activity occurring through your account, except where responsibility arises from our own acts or omissions.</p>
                        <p>You must not share your account with others or allow unauthorised access.</p>
                        <p>Please notify us promptly if you believe your account has been compromised.</p>
                        <p>We may suspend or restrict accounts where reasonably necessary to address security risks, misuse, fraudulent activity or violations of these Terms.</p>
                    </section>

                    <section aria-labelledby="property-finder-memberships">
                        <h2 id="property-finder-memberships">3. Property Finder Memberships</h2>
                        <p>Love Live Myoko offers two paid membership levels:</p>
                        <h3>Basic Membership</h3>
                        <p>Basic membership costs ¥2,000/month and includes the Property Finder directory, aggregated Japanese property listings, search filters and sorting, and direct links to original Japanese property websites, as described on the <Link href="/membership">Finder Memberships page</Link>.</p>
                        <h3>Premium Membership</h3>
                        <p>Premium membership costs ¥4,000/month and includes everything in Basic, saved properties and Property Alerts, as described on the <Link href="/membership">Finder Memberships page</Link>. Any property-purchase-related membership-fee refund is subject to the conditions described below.</p>
                        <p>Prices are displayed in Japanese yen (JPY). The specific features, limitations, monthly billing interval, applicable tax treatment and total amount payable are displayed before purchase.</p>
                        <p>Memberships are personal, non-transferable and intended for individual use unless we expressly agree otherwise.</p>
                        <p>Membership access does not guarantee the availability of any particular property.</p>
                    </section>

                    <section aria-labelledby="subscription-payments">
                        <h2 id="subscription-payments">4. Subscription Payments</h2>
                        <p>Paid memberships are billed through <strong>Stripe</strong>, our payment processing provider.</p>
                        <p>By purchasing a membership, you authorise the applicable subscription charges according to the price and monthly billing interval shown at checkout.</p>
                        <p>The initial payment is charged when you complete your purchase.</p>
                        <p>Recurring payments are charged automatically each month on the scheduled renewal date unless your subscription is cancelled or otherwise terminated.</p>
                        <p>The checkout process displays the applicable price, monthly billing interval, relevant tax information and total amount payable before you confirm payment. Accepted credit and debit card options are displayed in Stripe Checkout. Availability depends on Stripe and your card issuer.</p>
                        <p>Stripe processes payment card information through its hosted payment infrastructure. Love Live Myoko does not store complete payment card details in its own database.</p>
                        <p>Payment processing is subject to Stripe&apos;s applicable terms and privacy practices.</p>
                        <p>Stripe&apos;s website: <a href="https://stripe.com">stripe.com</a></p>
                    </section>

                    <section aria-labelledby="automatic-renewal">
                        <h2 id="automatic-renewal">5. Automatic Renewal</h2>
                        <p>Basic and Premium memberships renew automatically each month unless cancelled.</p>
                        <p>Your subscription continues until cancelled or otherwise terminated.</p>
                        <p>You are responsible for reviewing the renewal details provided before purchasing.</p>
                        <p>We will not apply a changed subscription price to an existing subscription without providing any notice or obtaining any agreement required by applicable law.</p>
                    </section>

                    <section aria-labelledby="subscription-cancellation">
                        <h2 id="subscription-cancellation">6. Subscription Cancellation</h2>
                        <p>Members can manage and cancel their subscriptions through their account.</p>
                        <p>Cancellation stops future recurring subscription charges. Unless otherwise stated at checkout or required by applicable law, cancellation takes effect at the end of the current paid billing period, and membership benefits remain available until that date.</p>
                        <p>To avoid a renewal charge, cancellation must be completed before the next scheduled payment is processed.</p>
                        <p>If you experience difficulty cancelling, please contact us using the contact details on our website.</p>
                        <p>Account deletion does not automatically cancel an active subscription unless the account deletion process expressly confirms that the subscription has also been cancelled.</p>
                    </section>

                    <section aria-labelledby="refunds">
                        <h2 id="refunds">7. Refunds</h2>
                        <p>Because Property Finder memberships provide access to digital services, subscription payments are generally non-refundable once access has been activated, except where required by applicable law or expressly stated in an applicable offer.</p>
                        <p>Cancelling a subscription does not ordinarily result in a refund for the remaining portion of the current billing period.</p>
                        <p>If we discontinue a paid service during an active subscription period or fail to provide a service as contracted, we address any refund or other remedy required by applicable law.</p>
                        <p>Premium members may qualify for a refund of up to three months of Premium membership fees following a qualifying property purchase through our agency. Eligibility is subject to the separately published conditions of the offer and verification; the refund is not automatic.</p>
                        <p>Other membership refunds, credits or promotions apply only where expressly advertised and are subject to the separately published conditions of the offer.</p>
                        <p>For refund enquiries, please contact us through the website.</p>
                    </section>

                    <section aria-labelledby="property-listings-and-information">
                        <h2 id="property-listings-and-information">8. Property Listings and Information</h2>
                        <p>Property Finder collects, organises and displays information from third-party sources, including property agencies, property portals, local authorities and other listing providers.</p>
                        <p>We make reasonable efforts to present useful information, but listings may contain errors, omissions or outdated details.</p>
                        <p>Prices, availability, property conditions, boundaries, legal restrictions and other information may change without notice.</p>
                        <p>Some listings may have been sold, withdrawn or modified before our website is updated.</p>
                        <p>Users must independently verify important property information with the relevant seller, agent, authority or qualified professional.</p>
                        <p>Love Live Myoko does not guarantee that any listed property remains available or that information supplied by third parties is complete or accurate.</p>
                    </section>

                    <section aria-labelledby="property-transactions-and-professional-advice">
                        <h2 id="property-transactions-and-professional-advice">9. Property Transactions and Professional Advice</h2>
                        <p>A Property Finder membership provides access to property discovery and research tools.</p>
                        <p>It does not itself constitute a property purchase agreement, real estate brokerage contract, legal advice, financial advice, tax advice or investment advice.</p>
                        <p>Property purchases in Japan may involve additional costs, legal requirements, taxes, registration procedures, maintenance obligations and other considerations.</p>
                        <p>You are responsible for obtaining appropriate independent advice before making purchasing or investment decisions.</p>
                        <p>Any separate property agency, intermediary or management services provided by MYOKO WORKS LLC are subject to their own applicable arrangements and agreements.</p>
                        <p>Membership fees do not include property purchase costs, brokerage fees, legal fees or other transaction expenses unless expressly stated.</p>
                    </section>

                    <section aria-labelledby="saved-properties-and-property-alerts">
                        <h2 id="saved-properties-and-property-alerts">10. Saved Properties and Property Alerts</h2>
                        <p>Premium membership includes saved properties and Property Alerts.</p>
                        <p>Members can choose Myoko, Joetsu, Shinano Town / Kurohime and Iizuna, in any combination, and receive at most one daily email containing newly discovered properties matching their selected areas, only when new matches are found. Property Alerts do not guarantee an email every day.</p>
                        <p>We do not guarantee that every matching property will be identified or that notifications will be delivered immediately or successfully.</p>
                        <p>Email delivery may be affected by third-party services, spam filtering, technical issues or other circumstances.</p>
                        <p>Emails link directly to the original Japanese property websites. You can manage Property Alerts preferences or disable notifications through your account.</p>
                        <p>Property Alerts do not reserve properties or provide priority purchasing rights.</p>
                    </section>

                    <section aria-labelledby="acceptable-use">
                        <h2 id="acceptable-use">11. Acceptable Use</h2>
                        <p>You agree not to:</p>
                        <ul>
                            <li>Access accounts or information without authorisation.</li>
                            <li>Share or resell paid membership access.</li>
                            <li>Use automated tools to scrape, harvest or systematically extract Property Finder data without our written permission.</li>
                            <li>Redistribute or commercially exploit our aggregated listings, translations or database content without authorisation.</li>
                            <li>Circumvent membership restrictions, security controls or payment requirements.</li>
                            <li>Interfere with website performance or security.</li>
                            <li>Upload or transmit malicious code.</li>
                            <li>Use the website for fraudulent, unlawful or abusive purposes.</li>
                            <li>Infringe the intellectual property rights or privacy rights of others.</li>
                        </ul>
                        <p>We may take proportionate action against violations, including limiting or suspending access.</p>
                    </section>

                    <section aria-labelledby="intellectual-property">
                        <h2 id="intellectual-property">12. Intellectual Property</h2>
                        <p>The Love Live Myoko website design, original text, software, branding, database organisation and other original materials are protected by applicable intellectual property laws.</p>
                        <p>Third-party property descriptions, photographs and other materials may remain the property of their respective owners.</p>
                        <p>Your membership grants you a limited, personal, non-exclusive and non-transferable right to use the available services for their intended purposes.</p>
                        <p>It does not transfer ownership of any intellectual property.</p>
                        <p>You may not reproduce or commercially redistribute protected content without the appropriate permission.</p>
                    </section>

                    <section aria-labelledby="external-websites-and-services">
                        <h2 id="external-websites-and-services">13. External Websites and Services</h2>
                        <p>Our website may link to third-party property portals, real estate agencies, accommodation providers and other external websites.</p>
                        <p>These services are independently operated and may have their own terms, privacy policies and business practices.</p>
                        <p>We are not responsible for the content or actions of independent third-party websites, except to the extent responsibility cannot lawfully be excluded.</p>
                    </section>

                    <section aria-labelledby="service-availability">
                        <h2 id="service-availability">14. Service Availability</h2>
                        <p>We aim to provide reliable access to Love Live Myoko, but cannot guarantee uninterrupted or error-free operation.</p>
                        <p>Temporary interruptions may occur due to maintenance, updates, technical failures, third-party service outages or events outside our reasonable control.</p>
                        <p>We may make reasonable changes to improve functionality, security or performance.</p>
                        <p>If a material change substantially affects an existing paid service, we will handle any required notice or remedies in accordance with applicable law.</p>
                    </section>

                    <section aria-labelledby="account-suspension-and-termination">
                        <h2 id="account-suspension-and-termination">15. Account Suspension and Termination</h2>
                        <p>We may suspend or terminate access where reasonably necessary due to serious or repeated violations of these Terms, fraudulent activity, security threats or legal requirements.</p>
                        <p>Where appropriate, we will provide notice and an opportunity to resolve the issue.</p>
                        <p>Suspension or termination does not remove rights or obligations that have already arisen.</p>
                        <p>Any cancellation, refund or other remedies will remain subject to applicable law.</p>
                    </section>

                    <section aria-labelledby="limitation-of-liability">
                        <h2 id="limitation-of-liability">16. Limitation of Liability</h2>
                        <p>We provide Property Finder as an information and discovery service.</p>
                        <p>We do not guarantee property availability, investment returns, rental income, future property values or the successful completion of any property transaction.</p>
                        <p>To the extent permitted by applicable law, we are not responsible for losses arising solely from inaccurate third-party property information, independent third-party services or circumstances outside our reasonable control.</p>
                        <p>Nothing in these Terms excludes or limits liability that cannot legally be excluded or limited, including liability arising from intentional misconduct or gross negligence where applicable.</p>
                        <p>These Terms do not restrict any mandatory rights available to consumers under applicable law.</p>
                    </section>

                    <section aria-labelledby="privacy-and-personal-information">
                        <h2 id="privacy-and-personal-information">17. Privacy and Personal Information</h2>
                        <p>Our handling of personal information is described in our <Link href="/privacy-policy">Privacy Policy</Link>.</p>
                        <p>By using our services, you acknowledge that you have been provided with access to that policy.</p>
                    </section>

                    <section aria-labelledby="changes-to-these-terms">
                        <h2 id="changes-to-these-terms">18. Changes to These Terms</h2>
                        <p>We may update these Terms to reflect changes in our services, technology, business practices or legal requirements.</p>
                        <p>Updated Terms will be published on this page with a revised date.</p>
                        <p>Where required by law, we will provide notice or obtain agreement before material changes take effect.</p>
                        <p>Changes will not retroactively remove rights that have already arisen under applicable law.</p>
                    </section>

                    <section aria-labelledby="governing-law-and-disputes">
                        <h2 id="governing-law-and-disputes">19. Governing Law and Disputes</h2>
                        <p>These Terms are governed by the laws of Japan, without overriding mandatory consumer protections that may apply under relevant law.</p>
                        <p>Any disputes will be handled in accordance with applicable Japanese law and jurisdictional rules.</p>
                        <p>We encourage customers to contact us first so that we can attempt to resolve concerns directly.</p>
                    </section>

                    <section aria-labelledby="contact-information">
                        <h2 id="contact-information">20. Contact Information</h2>
                        <p><strong>MYOKO WORKS LLC</strong><br /><span lang="ja">合同会社 MYOKO WORKS</span></p>
                        <p><strong>Representative:</strong> David Bolwell</p>
                        <p><strong>Address:</strong><br /><span lang="ja">〒942-0041<br />新潟県上越市安江6-21</span><br />Japan</p>
                        <p><strong>Telephone:</strong> <a href="tel:+81255420049">0255-42-0049</a></p>
                        <p><strong>Website:</strong> <a href="https://love-live-myoko.com">love-live-myoko.com</a></p>
                        <p>For enquiries about these Terms, subscriptions or account issues, please contact us at <a href="mailto:info@love-live-myoko.com">info@love-live-myoko.com</a>.</p>
                        <p>Additional business and payment information is available in our <Link href="/commercial-disclosure">Commercial Disclosure</Link>.</p>
                    </section>
                </article>
            </div>
        </div>
    );
}
