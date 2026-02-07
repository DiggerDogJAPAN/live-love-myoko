import { getProperties } from '@/lib/directus';
import PropertyCard from '@/components/PropertyCard';

export default async function PropertiesPage() {
    const properties = await getProperties();

    return (
        <div className="layout__container section">
            <h1 className="section__header">Available Properties</h1>

            {properties.length === 0 ? (
                <p>No properties found at this time.</p>
            ) : (
                <div className="grid grid--2-cols grid--3-cols">
                    {properties.map((property) => (
                        <div key={property.id}>
                            <PropertyCard property={property} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
