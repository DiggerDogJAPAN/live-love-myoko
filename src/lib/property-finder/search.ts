import { municipalityLabel, propertyArea, propertyDisplayArea, propertyJapaneseNeighbourhood, propertyMatchesArea, type FinderProperty } from './model';

export interface FinderFilters {
    keyword: string;
    municipality: string;
    area: string;
    minPrice: string;
    maxPrice: string;
    propertyType: string;
    sort: 'price-asc' | 'price-desc' | 'newest';
}

export const initialFilters: FinderFilters = {
    keyword: '', municipality: '', area: '', minPrice: '', maxPrice: '', propertyType: '', sort: 'price-asc',
};

/** Group reviewed display aliases, retaining an existing underlying filter value. */
export function locationOptions(properties: readonly FinderProperty[], municipality = ''): { value: string; label: string }[] {
    const options = new Map<string, string>();
    for (const property of properties) {
        if (municipality && municipalityLabel(property.municipality) !== municipalityLabel(municipality)) continue;
        const value = propertyArea(property);
        const label = propertyDisplayArea(property);
        if (value && label) {
            const previous = options.get(label);
            // Prefer existing English keys; selection still matches Japanese aliases.
            const rank = (key: string) => /[\u3040-\u30ff\u3400-\u9fff]/.test(key) ? 1 : 0;
            if (!previous || rank(value) < rank(previous) || (rank(value) === rank(previous) && value.localeCompare(previous) < 0)) options.set(label, value);
        }
    }
    return [...options].map(([label, value]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

export function priceError(filters: FinderFilters): string | null {
    for (const value of [filters.minPrice, filters.maxPrice]) {
        if (value !== '' && (!Number.isSafeInteger(Number(value)) || Number(value) < 0)) {
            return 'Enter a whole, non-negative price in yen.';
        }
    }
    if (filters.minPrice !== '' && filters.maxPrice !== '' && Number(filters.minPrice) > Number(filters.maxPrice)) {
        return 'Minimum price must be less than or equal to maximum price.';
    }
    return null;
}

function listedTime(value: string | null): number | null {
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
}

export function hasListingDates(properties: readonly FinderProperty[]): boolean {
    return properties.some((property) => listedTime(property.listedAt) !== null);
}

export function searchProperties(properties: readonly FinderProperty[], filters: FinderFilters): FinderProperty[] {
    if (priceError(filters)) return [];
    const terms = filters.keyword.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const results = properties.filter((property) => {
        const text = [property.title, property.municipality, propertyArea(property), propertyDisplayArea(property), propertyJapaneseNeighbourhood(property), property.neighbourhood, property.areaJa, property.regionJa, property.regionEn, property.propertyType, property.sourceName].filter(Boolean).join(' ').toLocaleLowerCase();
        return terms.every((term) => text.includes(term))
            && (!filters.municipality || municipalityLabel(property.municipality) === municipalityLabel(filters.municipality))
            && (!filters.area || propertyMatchesArea(property, filters.area))
            && (!filters.propertyType || property.propertyType === filters.propertyType)
            && (filters.minPrice === '' || (property.askingPriceJpy !== null && property.askingPriceJpy >= Number(filters.minPrice)))
            && (filters.maxPrice === '' || (property.askingPriceJpy !== null && property.askingPriceJpy <= Number(filters.maxPrice)));
    });
    return results.sort((a, b) => {
        if (filters.sort === 'newest') {
            const aTime = listedTime(a.listedAt);
            const bTime = listedTime(b.listedAt);
            if (aTime === null) return bTime === null ? 0 : 1;
            if (bTime === null) return -1;
            return bTime - aTime;
        }
        // Missing prices sort last in both directions; zero is a known price.
        if (a.askingPriceJpy === null) return b.askingPriceJpy === null ? 0 : 1;
        if (b.askingPriceJpy === null) return -1;
        return filters.sort === 'price-desc' ? b.askingPriceJpy - a.askingPriceJpy : a.askingPriceJpy - b.askingPriceJpy;
    });
}
