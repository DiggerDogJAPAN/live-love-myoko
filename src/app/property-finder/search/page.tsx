import type { Metadata } from 'next';
import PropertyFinderAccess from '@/components/property-finder/PropertyFinderAccess';

export const metadata: Metadata = {
    title: 'Search Properties | Property Finder | Love Live Myoko',
    description: 'Secure Property Finder administrator preview. Paid membership access is coming soon.',
    alternates: { canonical: 'https://love-live-myoko.com/property-finder/search/' },
    robots: { index: false, follow: false },
};

export default async function PropertyFinderSearchPage() {
    // Only synthetic examples can be server-rendered. Live data is requested from
    // the authenticated Pages Function after hydration, never during static export.
    if (process.env.NODE_ENV === 'development' && process.env.FINDER_PREVIEW_MODE !== 'live') {
        const [{ default: PropertyFinderDirectory }, { developmentProperties }] = await Promise.all([
            import('@/components/property-finder/PropertyFinderDirectory'),
            import('@/lib/property-finder/development-fixtures'),
        ]);
        return <PropertyFinderDirectory properties={developmentProperties} mode="synthetic" />;
    }

    return <PropertyFinderAccess />;
}
