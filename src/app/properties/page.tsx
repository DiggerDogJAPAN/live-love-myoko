import { getProperties } from '@/lib/directus';
import PropertyCard from '@/components/PropertyCard';
import styles from '@/components/PropertyCard.module.css';

export default async function PropertiesPage() {
    const properties = await getProperties();

    return (
        <div className="layout__container section">
            <h1 className="section__header">Properties</h1>

            {properties.length === 0 ? (
                <p>No properties found at this time.</p>
            ) : (
                <div className={styles.grid}>
                    {properties.map((property) => (
                        <div key={property.id} className={styles.gridItem}>
                            <PropertyCard property={property} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
