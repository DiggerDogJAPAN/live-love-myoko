import { getAccommodations } from '@/lib/directus';
import AccommodationCard from '@/components/AccommodationCard';

export const metadata = {
    title: 'Accommodation | Live Love Myoko',
};

export default async function AccommodationPage() {
    const accommodations = await getAccommodations();

    return (
        <div className="layout__container section">
            <div className="stack stack--sm u-mb-8">
                <h1 className="section__header" style={{ marginBottom: '0.5rem' }}>Accommodation</h1>
                <p className="text--lead" style={{ color: 'var(--color-text-muted)' }}>
                    Discover our selection of premium stays in Myoko.
                </p>
            </div>

            {accommodations.length === 0 ? (
                <p>No accommodation available at the moment.</p>
            ) : (
                <div className="grid grid--2-cols grid--3-cols">
                    {accommodations.map((acc) => (
                        <div key={acc.id}>
                            <AccommodationCard accommodation={acc as any} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
