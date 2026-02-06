import Link from 'next/link';
import { getProperties } from '@/lib/directus';

export default async function Home() {
  const properties = await getProperties();

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <h1 className="text-4xl font-bold mb-8">Properties</h1>

      {properties.length === 0 ? (
        <p className="text-gray-500">No properties found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
          {properties.map((property) => (
            <Link
              key={property.id}
              href={`/property/${property.slug}`}
              className="block p-6 border rounded-lg hover:shadow-lg transition-shadow bg-white dark:bg-zinc-900"
            >
              <h2 className="text-2xl font-semibold mb-2">{property.title}</h2>
              <span className="text-blue-500 hover:underline">View Details &rarr;</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
