import { getProperties, getProperty } from '@/lib/directus';
import { notFound } from 'next/navigation';
import Link from 'next/link';

// Generate static params for all properties at build time
export async function generateStaticParams() {
    const properties = await getProperties();
    return properties.map((property) => ({
        slug: property.slug,
    }));
}

export default async function PropertyPage({ params }: { params: { slug: string } }) {
    const { slug } = await params;
    const property = await getProperty(slug);

    if (!property) {
        notFound();
    }

    return (
        <main className="layout__container section">
            <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                <Link href="/" className="button button--secondary u-mb-8">&larr; Back to Properties</Link>

                <h1 className="u-mb-4">{property.title}</h1>

                <div
                    className="section__content"
                    dangerouslySetInnerHTML={{ __html: property.content }}
                />
            </div>
        </main>
    );
}
