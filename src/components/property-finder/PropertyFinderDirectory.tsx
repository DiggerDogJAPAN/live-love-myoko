'use client';

import { useState } from 'react';
import Link from 'next/link';
import { finderMunicipalities, municipalityLabel, propertyArea, type FinderProperty } from '@/lib/property-finder/model';
import { hasListingDates, initialFilters, priceError, searchProperties, type FinderFilters } from '@/lib/property-finder/search';
import PropertyFinderCard from './PropertyFinderCard';
import styles from './finder.module.css';

const PAGE_SIZE = 6;

export default function PropertyFinderDirectory({ properties, mode = 'synthetic' }: {
    properties: readonly FinderProperty[];
    mode?: 'synthetic' | 'live';
}) {
    const [filters, setFilters] = useState<FinderFilters>(initialFilters);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const update = (patch: Partial<FinderFilters>) => {
        setFilters((previous) => ({ ...previous, ...patch }));
        setVisibleCount(PAGE_SIZE);
    };
    const reset = () => { setFilters(initialFilters); setVisibleCount(PAGE_SIZE); };
    const error = priceError(filters);
    const results = searchProperties(properties, filters);
    const municipalities = mode === 'live' ? finderMunicipalities : [...new Set(properties.map((p) => municipalityLabel(p.municipality)).filter((value): value is string => Boolean(value)))].sort();
    const areas = [...new Set(properties.filter((p) => !filters.municipality || municipalityLabel(p.municipality) === filters.municipality).map(propertyArea).filter((value): value is string => Boolean(value)))].sort();
    const types = [...new Set(properties.map((p) => p.propertyType).filter((value): value is NonNullable<FinderProperty['propertyType']> => Boolean(value)))].sort();
    const activeCount = [filters.keyword, filters.municipality, filters.area, filters.minPrice, filters.maxPrice, filters.propertyType].filter(Boolean).length;

    return (
        <div className={styles.directory}>
            {mode === 'synthetic' ? <div className={styles.previewNotice} data-fixture-preview="SYNTHETIC_FINDER_FIXTURE_V1">
                <div className="layout__container">
                    <strong>Local development preview · Synthetic properties</strong>
                    <p>These invented examples demonstrate the interface. They are not real listings, prices, availability or evidence of source coverage.</p>
                    <p id="fixture-link-note">Original listing buttons are disabled because these examples have no genuine listing URLs. Enquiry buttons open your email application with the synthetic example’s details.</p>
                </div>
            </div> : <div className={styles.previewNotice}>
                <div className="layout__container">
                    <strong>Authorized administrator directory</strong>
                    <p>Eligible listings from the original sources. Please confirm current details and availability with the source. Paid membership access is not yet open.</p>
                </div>
            </div>}
            <div className="layout__container">
                <header className={styles.directoryHeader}>
                    <Link href="/property-finder" className={styles.backLink}>← About Property Finder</Link>
                    <p className={styles.eyebrow}>Love Live Myoko · Property Finder</p>
                    <h1>A place to begin.<em>A property to make yours.</em></h1>
                    <p>{mode === 'synthetic' ? 'Explore the directory preview by location, budget and property type.' : 'Explore eligible listings by location and budget. Where a field is not provided by the source, it is left blank.'}</p>
                </header>

                <section className={styles.filters} aria-label="Property search filters">
                    <label className={styles.keyword} htmlFor="finder-keyword">
                        <span>Search properties</span>
                        <input id="finder-keyword" type="search" autoComplete="off" placeholder="Try Myoko, Nojiri or Takada…" value={filters.keyword} onChange={(event) => update({ keyword: event.target.value })} />
                    </label>
                    <button type="button" className={styles.filterToggle} aria-expanded={filtersOpen} aria-controls="finder-filter-fields" onClick={() => setFiltersOpen(!filtersOpen)}>
                        Refine search{activeCount > 0 ? ` (${activeCount})` : ''} <span aria-hidden="true">{filtersOpen ? '−' : '+'}</span>
                    </button>
                    <div id="finder-filter-fields" className={`${styles.filterFields} ${filtersOpen ? styles.filtersOpen : ''}`}>
                        <label htmlFor="finder-municipality"><span>Municipality</span>
                            <select id="finder-municipality" value={filters.municipality} onChange={(event) => update({ municipality: event.target.value, area: '' })}>
                                <option value="">All municipalities</option>{municipalities.map((value) => <option key={value}>{value}</option>)}
                            </select>
                        </label>
                        <label htmlFor="finder-area"><span>Location</span>
                            <select id="finder-area" value={filters.area} onChange={(event) => update({ area: event.target.value })}>
                                <option value="">All locations</option>{areas.map((value) => <option key={value}>{value}</option>)}
                            </select>
                        </label>
                        <label htmlFor="finder-min"><span>Min price (¥)</span>
                            <input id="finder-min" type="number" min="0" step="1" inputMode="numeric" placeholder="No minimum" value={filters.minPrice} aria-invalid={Boolean(error)} aria-describedby={error ? 'finder-price-error' : undefined} onChange={(event) => update({ minPrice: event.target.value })} />
                        </label>
                        <label htmlFor="finder-max"><span>Max price (¥)</span>
                            <input id="finder-max" type="number" min="0" step="1" inputMode="numeric" placeholder="No maximum" value={filters.maxPrice} aria-invalid={Boolean(error)} aria-describedby={error ? 'finder-price-error' : undefined} onChange={(event) => update({ maxPrice: event.target.value })} />
                        </label>
                        {types.length > 0 && <label htmlFor="finder-type"><span>Property type</span>
                            <select id="finder-type" value={filters.propertyType} onChange={(event) => update({ propertyType: event.target.value })}>
                                <option value="">All types</option>{types.map((value) => <option key={value}>{value}</option>)}
                            </select>
                        </label>}
                    </div>
                    {error && <p className={styles.error} id="finder-price-error" role="alert">{error}</p>}
                    {activeCount > 0 && <button className={styles.clearButton} type="button" onClick={reset}>Clear all filters</button>}
                </section>

                <div className={styles.resultsBar}>
                    <p role="status" aria-live="polite" aria-atomic="true"><strong>{results.length}</strong> {results.length === 1 ? 'property' : 'properties'}{activeCount > 0 ? ' match your search' : mode === 'synthetic' ? ' in the preview' : ' in the directory'}{results.length > 0 && <span> · Showing {Math.min(visibleCount, results.length)}</span>}</p>
                    <label htmlFor="finder-sort"><span>Sort by</span>
                        <select id="finder-sort" value={filters.sort} onChange={(event) => update({ sort: event.target.value as FinderFilters['sort'] })}>
                            <option value="price-asc">Price: low to high</option>
                            <option value="price-desc">Price: high to low</option>
                            {hasListingDates(properties) && <option value="newest">Newest listed</option>}
                        </select>
                    </label>
                </div>
                {filters.sort === 'newest' && <p className={styles.sortNote}>Uses listing dates where supplied. Undated properties appear last; crawl/check dates are not used.</p>}
                {results.length > 0 ? (
                    <>
                        <div className={styles.resultsGrid}>
                            {results.slice(0, visibleCount).map((property, index) => <PropertyFinderCard key={`${property.title}-${index}`} property={property} />)}
                        </div>
                        {visibleCount < results.length && <div className={styles.loadMore}><button type="button" className="button button--secondary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Load More Properties ({results.length - visibleCount} remaining)</button></div>}
                    </>
                ) : (
                    <div className={styles.empty}>
                        <span aria-hidden="true">⌕</span><h2>{error ? 'Let’s adjust that price range.' : 'No properties match this search.'}</h2>
                        <p>{error || 'Try a wider price range, another area or fewer keywords.'}</p>
                        <button type="button" className="button button--primary" onClick={reset}>Reset Search</button>
                    </div>
                )}
                <div className={styles.directoryFootnote}>
                    <p>{mode === 'synthetic' ? 'The full directory will require verified membership. This preview contains synthetic development fixtures only.' : 'Live access is restricted to authorized administrators. Source listings may change; confirm details before making a purchase decision.'}</p>
                    <Link href="/properties">Looking for properties handled directly by Love Live Myoko? →</Link>
                </div>
            </div>
        </div>
    );
}
