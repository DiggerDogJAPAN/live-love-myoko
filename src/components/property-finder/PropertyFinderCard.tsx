'use client';

import { useState } from 'react';
import Image from 'next/image';
import { enquiryMailto, formatPrice, originalListingUrl, propertyLocation, propertyTitle, visibleThumbnail, type FinderProperty } from '@/lib/property-finder/model';
import styles from './finder.module.css';

export default function PropertyFinderCard({ property }: { property: FinderProperty }) {
    const original = originalListingUrl(property);
    const title = propertyTitle(property);
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const thumbnail = visibleThumbnail(property.thumbnail, failedSrc);
    return (
        <article className={styles.card}>
            <div className={styles.cardImage}>
                {thumbnail ? (
                    <Image src={thumbnail.src} alt={thumbnail.alt} onError={() => setFailedSrc(thumbnail.src)} fill sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw" unoptimized />
                ) : (
                    <div className={styles.placeholder}>
                        <svg viewBox="0 0 240 110" fill="none" aria-hidden="true">
                            <path d="M0 100 53 46l33 36 40-66 49 61 26-29 39 52" stroke="currentColor" strokeWidth="1.5" />
                            <path d="m77 100 38-30 38 30M88 92v18m54-18v18m-30-2V94h14v14" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                        <span>Property image unavailable</span>
                    </div>
                )}
                <span className={styles.status}>{property.availability === 'Unknown' ? 'Availability not provided' : property.availability}</span>
            </div>
            <div className={styles.cardContent}>
                {propertyLocation(property) && <p className={styles.location}>{propertyLocation(property)}{property.areaJa && property.areaJa !== property.area && <> · <span lang="ja">{property.areaJa}</span></>}</p>}
                <h3>{title}</h3>
                <p className={styles.price}>{formatPrice(property.askingPriceJpy)}</p>
                <div className={styles.facts}>
                    {property.propertyType && <span>{property.propertyType}</span>}
                    {property.listedAt && <span>Listed {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(property.listedAt))}</span>}
                </div>
                <p className={styles.source}>Source: {property.sourceName}</p>
                <div className={styles.cardActions}>
                    <a href={enquiryMailto(property)} className="button button--primary">Ask Us for Help</a>
                    {original ? (
                        <a href={original} className="button button--secondary" target="_blank" rel="noopener noreferrer">View Original Listing <span aria-hidden="true">↗</span></a>
                    ) : (
                        <button className="button button--secondary" type="button" disabled aria-label="View Original Listing — original URL not available">View Original Listing</button>
                    )}
                </div>
            </div>
        </article>
    );
}
