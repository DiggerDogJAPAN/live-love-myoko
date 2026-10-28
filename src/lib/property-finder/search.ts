import { propertyArea, type FinderProperty } from './model';

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
        const text = [property.title, property.municipality, propertyArea(property), property.neighbourhood, property.areaJa, property.regionJa, property.propertyType, property.sourceName].filter(Boolean).join(' ').toLocaleLowerCase();
        return terms.every((term) => text.includes(term))
            && (!filters.municipality || property.municipality === filters.municipality)
            && (!filters.area || propertyArea(property) === filters.area)
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
