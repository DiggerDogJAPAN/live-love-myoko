import type { FinderProperty } from './model';

// Entirely invented development examples. Never imported by production routes.
// No real inventory, municipal IDs, source photographs or private database access.
// Original URLs are deliberately absent: do not imply a synthetic home is a real listing.
function fixture(
    title: string,
    municipality: string,
    area: string,
    propertyType: FinderProperty['propertyType'],
    askingPriceJpy: number | null,
    listedAt: string | null,
    sourceName = 'Synthetic development source',
): FinderProperty {
    return { title, municipality, area, propertyType, askingPriceJpy, listedAt, sourceName,
        purchaseConditionsJa: null, availability: 'Available', originalListingUrl: null, thumbnail: null };
}

export const developmentProperties: readonly FinderProperty[] = [
    fixture('Synthetic Akakura home', 'Myoko', 'Akakura', 'House', 18500000, '2026-01-10', 'Myoko Akiya Bank'),
    fixture('Synthetic Kurohime woodland plot', 'Shinano Town', 'Kurohime', 'Land', 4200000, '2026-02-04'),
    fixture('Synthetic Takada townhouse', 'Joetsu', 'Takada', 'House', 8600000, '2026-01-28'),
    fixture('Synthetic Iizuna country home', 'Iizuna', 'Mure', 'House', 12400000, '2026-02-10'),
    fixture('Synthetic Ikenotaira lodge', 'Myoko', 'Ikenotaira', 'Lodge', 48500000, '2026-01-02'),
    fixture('Synthetic Sekiyama garden home', 'Myoko', 'Sekiyama', 'House', 3100000, null, 'Myoko Akiya Bank'),
    fixture('Synthetic Naoetsu apartment', 'Joetsu', 'Naoetsu', 'Apartment', 6800000, '2026-02-01'),
    fixture('Synthetic Kurohime holiday home', 'Shinano Town', 'Kurohime', 'House', 23500000, '2026-02-06'),
    fixture('Synthetic Iizuna village plot', 'Iizuna', 'Samizu', 'Land', 1900000, null),
    fixture('Synthetic Suginohara lodge', 'Myoko', 'Suginohara', 'Lodge', 65000000, '2026-01-15'),
    fixture('Synthetic Takada building plot', 'Joetsu', 'Takada', 'Land', 800000, '2026-02-12'),
    fixture('Synthetic Shinano renovation home', 'Shinano Town', 'Furuma', 'House', 2500000, null),
    fixture('Synthetic Myoko price-pending home', 'Myoko', 'Sekiyama', null, null, null, 'Myoko Akiya Bank'),
    { ...fixture('Synthetic Iizuna unconfirmed example', 'Iizuna', 'Mure', 'House', 0, null), availability: 'Unknown' },
];
