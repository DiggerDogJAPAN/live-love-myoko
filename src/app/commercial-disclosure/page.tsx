import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './commercial-disclosure.module.css';

const canonical = 'https://love-live-myoko.com/commercial-disclosure/';
const description = 'Business operator details, monthly membership prices, Stripe payments, renewal, cancellation and refunds for Love Live Myoko Property Finder services.';

export const metadata: Metadata = {
    title: 'Commercial Disclosure | Love Live Myoko',
    description,
    alternates: { canonical },
    openGraph: { title: 'Commercial Disclosure | Love Live Myoko', description, url: canonical, type: 'website' },
};

export default function CommercialDisclosurePage() {
    return (
        <div className={styles.page}>
            <div className="layout__container">
                <article className={styles.content} aria-labelledby="commercial-disclosure-heading">
                    <header className={styles.header}>
                        <h1 id="commercial-disclosure-heading">Commercial Disclosure</h1>
                        <p className={styles.subtitle} lang="ja">特定商取引法に基づく表記</p>
                        <p>Disclosure pursuant to Japan&apos;s Act on Specified Commercial Transactions.</p>
                    </header>

                    <section aria-labelledby="business-operator">
                        <h2 id="business-operator">Business Operator <span lang="ja">販売事業者</span></h2>
                        <p><strong>MYOKO WORKS LLC</strong><br /><span lang="ja">合同会社 MYOKO WORKS</span></p>
                    </section>

                    <section aria-labelledby="representative">
                        <h2 id="representative">Representative <span lang="ja">代表者</span></h2>
                        <p>David Bolwell</p>
                    </section>

                    <section aria-labelledby="business-address">
                        <h2 id="business-address">Business Address <span lang="ja">所在地</span></h2>
                        <p><span lang="ja">〒942-0041<br />新潟県上越市安江6-21</span><br />Japan</p>
                    </section>

                    <section aria-labelledby="contact">
                        <h2 id="contact">Contact <span lang="ja">お問い合わせ</span></h2>
                        <p><strong>Telephone:</strong> <a href="tel:+81255420049">0255-42-0049</a></p>
                        <p><strong>Online enquiries:</strong> <a href="mailto:info@love-live-myoko.com">info@love-live-myoko.com</a></p>
                        <p><strong>Website:</strong> <a href="https://love-live-myoko.com">love-live-myoko.com</a></p>
                    </section>

                    <section aria-labelledby="services">
                        <h2 id="services">Services <span lang="ja">販売する商品・サービス</span></h2>
                        <p>Love Live Myoko provides online property search and discovery services focused on Myoko and surrounding areas in Japan.</p>
                        <p>Love Live Myoko offers two paid Property Finder membership levels, billed monthly:</p>
                        <h3>Basic Membership</h3>
                        <p>Provides access to the property search and discovery features included in the Basic membership plan, including the Property Finder directory, aggregated Japanese property listings, search filters and sorting, and direct links to original Japanese property websites.</p>
                        <h3>Premium Membership</h3>
                        <p>Provides everything included in Basic, with additional Property Finder features including eligible saved-property and Property Alerts functionality.</p>
                        <p>Property Alerts lets Premium members choose preferred areas and receive at most one daily email when new matching properties are discovered. Emails link directly to the original Japanese property websites. Members can manage their alert preferences or disable notifications through their account.</p>
                        <p>The exact features and limitations of each membership are displayed on the <Link href="/membership">Finder Memberships page</Link>.</p>
                    </section>

                    <section aria-labelledby="prices">
                        <h2 id="prices">Prices <span lang="ja">販売価格</span></h2>
                        <p><strong>Basic: ¥2,000/month</strong><br /><strong>Premium: ¥4,000/month</strong></p>
                        <p>Subscription prices are also displayed on the <Link href="/membership">Finder Memberships page</Link>. All prices are displayed in Japanese yen (JPY).</p>
                        <p>The applicable tax treatment and total amount payable are displayed at checkout before payment confirmation.</p>
                    </section>

                    <section aria-labelledby="additional-charges">
                        <h2 id="additional-charges">Additional Charges <span lang="ja">商品代金以外の必要料金</span></h2>
                        <p>Any additional charges imposed by Love Live Myoko are clearly displayed before payment confirmation.</p>
                        <p>Customers are responsible for any charges imposed independently by their internet provider, mobile carrier, bank or card issuer, including applicable foreign transaction or currency conversion fees.</p>
                    </section>

                    <section aria-labelledby="payment-methods">
                        <h2 id="payment-methods">Payment Methods <span lang="ja">支払方法</span></h2>
                        <p>Payments are processed securely through <strong>Stripe</strong>. Accepted credit and debit card options are displayed in Stripe Checkout. Availability depends on Stripe and the customer&apos;s card issuer.</p>
                        <p>Stripe processes payment card information through its hosted payment infrastructure. Love Live Myoko does not store complete payment card details in its own database.</p>
                    </section>

                    <section aria-labelledby="payment-timing">
                        <h2 id="payment-timing">Payment Timing <span lang="ja">支払時期</span></h2>
                        <p>The initial subscription payment is charged when the customer confirms and completes their membership purchase.</p>
                        <p>Subsequent subscription payments are charged automatically each month on the scheduled renewal date unless the subscription has been cancelled or otherwise terminated.</p>
                        <p>The monthly billing interval and renewal terms are displayed before payment confirmation.</p>
                    </section>

                    <section aria-labelledby="service-availability">
                        <h2 id="service-availability">Service Availability <span lang="ja">役務の提供時期</span></h2>
                        <p>Paid membership access is activated after successful payment confirmation and processing.</p>
                        <p>Membership features remain available during the applicable paid subscription period, subject to the membership terms and service availability.</p>
                    </section>

                    <section aria-labelledby="subscription-renewal">
                        <h2 id="subscription-renewal">Subscription Renewal <span lang="ja">契約の更新</span></h2>
                        <p>Basic and Premium memberships renew automatically each month unless cancelled. The subscription continues until cancelled or otherwise terminated.</p>
                        <p>The renewal price and monthly billing frequency are displayed before purchase. Customers should review their subscription details before confirming payment.</p>
                    </section>

                    <section aria-labelledby="cancellation">
                        <h2 id="cancellation">Cancellation <span lang="ja">解約について</span></h2>
                        <p>Customers can manage and cancel their subscriptions through their account.</p>
                        <p>Cancellation stops future recurring subscription charges. Unless otherwise stated at checkout or required by applicable law, cancellation takes effect at the end of the current paid billing period, and membership benefits remain available until that date.</p>
                        <p>To avoid a renewal charge, cancellation must be completed before the next scheduled payment is processed. If you experience difficulty cancelling, please contact us using the details above.</p>
                        <p>Account deletion does not automatically cancel an active subscription unless the account deletion process expressly confirms that the subscription has also been cancelled.</p>
                    </section>

                    <section aria-labelledby="refunds">
                        <h2 id="refunds">Refunds <span lang="ja">返金について</span></h2>
                        <p>Because Property Finder memberships provide access to digital services, subscription payments are generally non-refundable once access has been activated, except where required by applicable law or expressly stated in an applicable offer.</p>
                        <p>Cancelling a subscription does not ordinarily result in a refund for the remaining portion of the current billing period.</p>
                        <p>If we discontinue a paid service during an active subscription period or fail to provide a service as contracted, we address any refund or other remedy required by applicable law.</p>
                        <p>Premium members may qualify for a refund of up to three months of Premium membership fees following a qualifying property purchase through our agency. Eligibility is subject to the separately published conditions of the offer and verification; the refund is not automatic.</p>
                        <p>Refund requests and exceptions are handled in accordance with our <Link href="/terms-of-service">Terms of Service</Link> and applicable law. Please contact us using the details above for refund enquiries.</p>
                    </section>

                    <section aria-labelledby="operating-requirements">
                        <h2 id="operating-requirements">Operating Requirements <span lang="ja">動作環境</span></h2>
                        <p>The Property Finder service requires an internet connection and a reasonably up-to-date web browser. Certain membership features require an active account and successful authentication.</p>
                        <p>Internet connectivity and related charges are the responsibility of the customer.</p>
                    </section>

                    <section aria-labelledby="other-conditions">
                        <h2 id="other-conditions">Other Conditions <span lang="ja">その他</span></h2>
                        <p>Memberships provide access to online property information and related discovery features.</p>
                        <p>A membership does not guarantee property availability, the accuracy of information supplied by independent listing sources, successful property purchase, or any particular investment outcome.</p>
                        <p>The applicable <Link href="/terms-of-service">Terms of Service</Link> and <Link href="/privacy-policy">Privacy Policy</Link> also govern use of the website.</p>
                    </section>
                </article>
            </div>
        </div>
    );
}
