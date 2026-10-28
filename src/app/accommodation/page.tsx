import styles from '@/styles/editorial.module.css';
import { getAccommodations } from '@/lib/directus';
import AccommodationCard from '@/components/AccommodationCard';

export const metadata = {
    title: 'Accommodation | Love Live Myoko',
};

export default async function AccommodationPage() {
    const accommodations = await getAccommodations();

    return (
        <div className={`layout__container section ${styles.page}`}>
            <div className="stack stack--sm u-mb-8">
                <h1 className={`section__header ${styles.catalogIntro}`}>Accommodation</h1>
                <p className={`text--lead ${styles.text}`}>
                    Discover our selection of premium stays in Myoko.
                </p>
            </div>

            {accommodations.length === 0 ? (
                <p>No accommodation available at the moment.</p>
            ) : (
                <div className="grid grid--2-cols grid--3-cols">
                    {accommodations.map((acc) => (
                        <div key={acc.id}>
                            <AccommodationCard accommodation={acc} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
