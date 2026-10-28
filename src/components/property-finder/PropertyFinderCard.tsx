'use client';

import { useState } from 'react';
import Image from 'next/image';
import { enquiryMailto, formatPrice, originalListingUrl, propertyLocation, propertyTitle, visibleThumbnail, type FinderProperty } from '@/lib/property-finder/model';
import styles from './finder.module.css';

export default function PropertyFinderCard({ property }: { property: FinderProperty }) {
    const original = originalListingUrl(property);
    const title = propertyTitle(property);
    const location = propertyLocation(property);
    // Derive the compact eyebrow from the same validated label used by titles/filters.
    const locationEyebrow = location.replace(/ \(([^()]*)\)$/, ' · $1') || 'Location not provided';
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const thumbnail = visibleThumbnail(property.thumbnail, failedSrc);
    return (
        <article className={styles.card}>
            <div className={styles.cardImage}>
                {thumbnail ? (
                    <Image src={thumbnail.src} alt={thumbnail.alt} onError={() => setFailedSrc(thumbnail.src)} fill sizes="(max-width: 711px) 100vw, (max-width: 1055px) 50vw, 33vw" unoptimized />
                ) : (
                    <div className={styles.placeholder}>
                        <svg viewBox="0 0 240 110" fill="none" aria-hidden="true">
                            <path d="M0 100 53 46l33 36 40-66 49 61 26-29 39 52" stroke="currentColor" strokeWidth="1.5" />
                            <path d="m77 100 38-30 38 30M88 92v18m54-18v18m-30-2V94h14v14" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                        <span>Property image unavailable</span>
                    </div>
                )}
            </div>
            <div className={styles.cardContent}>
                <div className={styles.cardTopRow}>
                    <p className={styles.location}>{locationEyebrow}</p>
                    <span className={`${styles.status} ${property.availability === 'Available' ? styles.available : ''}`}>
                        <span className={styles.statusDot} aria-hidden="true" />
                        {property.availability === 'Unknown' ? 'Availability not provided' : property.availability}
                    </span>
                </div>
                <h3>{title}</h3>
                <dl className={styles.facts}>
                    <dt>Price</dt><dd className={styles.price}>{formatPrice(property.askingPriceJpy)}</dd>
                    <dt>Type</dt><dd>{property.propertyType || 'Not provided'}</dd>
                    <dt>Source</dt><dd>{original
                        ? <a href={original} target="_blank" rel="noopener noreferrer">{property.sourceName}</a>
                        : property.sourceName}</dd>
                    {property.listedAt && <><dt>Listed</dt><dd>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(property.listedAt))}</dd></>}
                </dl>
                {property.sourceName === 'Shinano Town Akiya Bank' && <p className={styles.source}>
                    Enquiries and viewings are subject to the original programme’s eligibility and registration requirements. Investment or commercial use is not assured.{' '}
                    <a href="https://www.town.shinano.lg.jp/docs/369.html" target="_blank" rel="noopener noreferrer">Programme conditions ↗</a>
                </p>}
                {property.sourceName !== 'Joetsu City Akiya Bank' && property.purchaseConditionsJa?.trim() && <details className={styles.conditions}>
                    <summary>Important Property Conditions</summary>
                    <p className={styles.conditionsLabel}>Source disclosure (Japanese)</p>
                    <p lang="ja" className={styles.conditionsText}>{property.purchaseConditionsJa}</p>
                </details>}
                <div className={styles.cardActions}>
                    <a href={enquiryMailto(property)} className={`button ${styles.cardButton} ${styles.primaryAction}`}>Ask Us for Help</a>
                    {original ? (
                        <a href={original} className={`button ${styles.cardButton} ${styles.secondaryAction}`} target="_blank" rel="noopener noreferrer">Listing <span aria-hidden="true">↗</span></a>
                    ) : (
                        <button className={`button ${styles.cardButton} ${styles.secondaryAction}`} type="button" disabled aria-label="Listing — original URL not available">Listing ↗</button>
                    )}
                </div>
            </div>
        </article>
    );
}
