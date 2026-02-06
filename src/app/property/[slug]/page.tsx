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
        <main className="flex min-h-screen flex-col items-center p-24">
            <div className="w-full max-w-3xl">
                <Link href="/" className="text-blue-500 hover:underline mb-8 inline-block">&larr; Back to Properties</Link>

                <h1 className="text-4xl font-bold mb-6">{property.title}</h1>

                <div
                    className="prose dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: property.content }}
                />
            </div>
        </main>
    );
}
