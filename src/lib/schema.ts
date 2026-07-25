import { Accommodation, Property } from '@/lib/directus';

const SITE_URL = 'https://love-live-myoko.com';

function cleanSchema<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return undefined as unknown as T;
  }

  if (Array.isArray(obj)) {
    const cleanedArray = obj
      .map((item) => cleanSchema(item))
      .filter((item) => item !== undefined && item !== null && item !== '');
    return (cleanedArray.length > 0 ? cleanedArray : undefined) as unknown as T;
  }

  if (typeof obj === 'object') {
    const cleanedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = cleanSchema(value);
      if (
        cleanedValue !== undefined &&
        cleanedValue !== null &&
        cleanedValue !== '' &&
        !(typeof cleanedValue === 'object' && Object.keys(cleanedValue).length === 0)
      ) {
        cleanedObj[key] = cleanedValue;
      }
    }
    return (Object.keys(cleanedObj).length > 0 ? cleanedObj : undefined) as unknown as T;
  }

  return obj;
}

function cleanMapUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.includes('<iframe')) {
    const match = url.match(/src=["']([^"'\s>]+)/i);
    if (match && match[1]) {
      return match[1];
    }
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return undefined;
}

export function generateAccommodationSchema(accommodation: Accommodation, slug: string) {
  const canonicalUrl = `${SITE_URL}/accommodation/${slug}/`;
  const mainEntityId = `${canonicalUrl}#accommodation`;
  const webpageId = `${canonicalUrl}#webpage`;
  const breadcrumbId = `${canonicalUrl}#breadcrumb`;
  const orgId = `${SITE_URL}/#organization`;
  const websiteId = `${SITE_URL}/#website`;

  // Images
  const images: string[] = [];
  if (accommodation.featured_image) {
    images.push(`${SITE_URL}/images/accommodations/${slug}/featured.jpg`);
  }
  if (accommodation.gallery && accommodation.gallery.length > 0) {
    accommodation.gallery.forEach((_, idx) => {
      images.push(`${SITE_URL}/images/accommodations/${slug}/gallery-${idx + 1}.jpg`);
    });
  }
  const uniqueImages = Array.from(new Set(images));

  // Occupancy
  const occupancy =
    typeof accommodation.max_guests === 'number' && accommodation.max_guests > 0
      ? {
          '@type': 'QuantitativeValue',
          maxValue: accommodation.max_guests,
          unitText: 'guests',
        }
      : undefined;

  // Address
  const address = {
    '@type': 'PostalAddress',
    streetAddress: accommodation.street_address || undefined,
    addressLocality: accommodation.address_locality || 'Myoko',
    addressRegion: accommodation.address_region || 'Niigata',
    postalCode: accommodation.postal_code || undefined,
    addressCountry: accommodation.address_country || 'JP',
  };

  // Geo
  const geo =
    typeof accommodation.latitude === 'number' && typeof accommodation.longitude === 'number'
      ? {
          '@type': 'GeoCoordinates',
          latitude: accommodation.latitude,
          longitude: accommodation.longitude,
        }
      : undefined;

  // Amenities
  const amenitiesList: string[] = [];
  if (accommodation.amenities) {
    if (Array.isArray(accommodation.amenities)) {
      amenitiesList.push(...accommodation.amenities);
    }
  }
  if (typeof accommodation.parking === 'number' && accommodation.parking > 0) {
    if (!amenitiesList.some((a) => a.toLowerCase().includes('parking'))) {
      amenitiesList.push('Parking');
    }
  }
  const amenityFeatures =
    amenitiesList.length > 0
      ? amenitiesList.map((name) => ({
          '@type': 'LocationFeatureSpecification',
          name,
          value: true,
        }))
      : undefined;

  // Offer
  const offers =
    typeof accommodation.price === 'number' && accommodation.price > 0
      ? {
          '@type': 'Offer',
          price: accommodation.price,
          priceCurrency: 'JPY',
          url: accommodation.website_url || canonicalUrl,
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: accommodation.price,
            priceCurrency: 'JPY',
            unitText: 'night',
          },
        }
      : undefined;

  // SameAs links
  const sameAs: string[] = [];
  const mapUrlClean = cleanMapUrl(accommodation.map_url);
  if (mapUrlClean) sameAs.push(mapUrlClean);
  if (accommodation.website_url && accommodation.website_url !== canonicalUrl) {
    sameAs.push(accommodation.website_url);
  }

  const vacationRentalNode = {
    '@type': 'VacationRental',
    '@id': mainEntityId,
    name: accommodation.title,
    description: accommodation.summary || undefined,
    url: canonicalUrl,
    image: uniqueImages.length > 0 ? uniqueImages : undefined,
    occupancy,
    numberOfRooms: typeof accommodation.rooms === 'number' ? accommodation.rooms : undefined,
    numberOfBedrooms: typeof accommodation.rooms === 'number' ? accommodation.rooms : undefined,
    numberOfBathroomsTotal: typeof accommodation.baths === 'number' ? accommodation.baths : undefined,
    numberOfBeds: typeof accommodation.beds === 'number' ? accommodation.beds : undefined,
    address,
    geo,
    amenityFeature: amenityFeatures,
    offers,
    identifier: accommodation.slug || String(accommodation.id),
    provider: { '@id': orgId },
    sameAs: sameAs.length > 0 ? sameAs : undefined,
  };

  const webpageNode = {
    '@type': 'WebPage',
    '@id': webpageId,
    url: canonicalUrl,
    name: `${accommodation.title} | LiveLove Myoko`,
    description: accommodation.summary || `View details for ${accommodation.title}.`,
    mainEntity: { '@id': mainEntityId },
    isPartOf: { '@id': websiteId },
  };

  const breadcrumbNode = {
    '@type': 'BreadcrumbList',
    '@id': breadcrumbId,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Accommodation',
        item: `${SITE_URL}/accommodation/`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: accommodation.title,
        item: canonicalUrl,
      },
    ],
  };

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [vacationRentalNode, webpageNode, breadcrumbNode],
  };

  return cleanSchema(graph);
}

export function generatePropertySchema(property: Property, slug: string) {
  const canonicalUrl = `${SITE_URL}/property/${slug}/`;
  const mainEntityId = `${canonicalUrl}#property`;
  const webpageId = `${canonicalUrl}#webpage`;
  const breadcrumbId = `${canonicalUrl}#breadcrumb`;
  const orgId = `${SITE_URL}/#organization`;
  const websiteId = `${SITE_URL}/#website`;

  // Property Type Mapping
  let schemaType = 'SingleFamilyResidence';
  if (property.schema_property_type) {
    schemaType = property.schema_property_type;
  } else if (property.property_type) {
    switch (property.property_type) {
      case 'apartment':
        schemaType = 'Apartment';
        break;
      case 'house':
        schemaType = 'SingleFamilyResidence';
        break;
      case 'lodge':
        schemaType = 'Residence';
        break;
      case 'land':
        schemaType = 'Place';
        break;
      default:
        schemaType = 'SingleFamilyResidence';
    }
  }

  // Images
  const images: string[] = [];
  if (property.featured_image) {
    images.push(`${SITE_URL}/images/properties/${slug}/featured.jpg`);
  }
  if (property.gallery && property.gallery.length > 0) {
    property.gallery.forEach((_, idx) => {
      images.push(`${SITE_URL}/images/properties/${slug}/gallery-${idx + 1}.jpg`);
    });
  }
  const uniqueImages = Array.from(new Set(images));

  // Offer
  const statusStr = String(property.listing_status || property.status || '');
  const isAvailable = statusStr !== 'sold' && statusStr !== 'withdrawn';
  const offers =
    typeof property.price === 'number' && property.price > 0 && statusStr !== 'withdrawn'
      ? {
          '@type': 'Offer',
          price: property.price,
          priceCurrency: 'JPY',
          url: canonicalUrl,
          availability: isAvailable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        }
      : undefined;

  // Address
  const address = {
    '@type': 'PostalAddress',
    streetAddress: property.street_address || undefined,
    addressLocality: property.address_locality || property.location || 'Myoko',
    addressRegion: property.address_region || 'Niigata',
    postalCode: property.postal_code || undefined,
    addressCountry: property.address_country || 'JP',
  };

  // Geo
  const geo =
    typeof property.latitude === 'number' && typeof property.longitude === 'number'
      ? {
          '@type': 'GeoCoordinates',
          latitude: property.latitude,
          longitude: property.longitude,
        }
      : undefined;

  // Floor Size
  const floorArea = property.floor_area_sqm || property.floor_area;
  const floorSize =
    typeof floorArea === 'number' && floorArea > 0
      ? {
          '@type': 'QuantitativeValue',
          value: floorArea,
          unitCode: property.floor_area_unit || 'MTK',
        }
      : undefined;

  // Amenities
  let amenitiesList: string[] = [];
  if (property.amenities) {
    if (Array.isArray(property.amenities)) {
      amenitiesList = [...property.amenities];
    } else if (typeof property.amenities === 'string') {
      try {
        amenitiesList = JSON.parse(property.amenities);
      } catch (e) {
        amenitiesList = [];
      }
    }
  }
  const amenityFeatures =
    amenitiesList.length > 0
      ? amenitiesList.map((name) => ({
          '@type': 'LocationFeatureSpecification',
          name,
          value: true,
        }))
      : undefined;

  // SameAs link
  const sameAs: string[] = [];
  const mapUrlClean = cleanMapUrl(property.map_url);
  if (mapUrlClean) sameAs.push(mapUrlClean);

  const propertyNode = {
    '@type': schemaType,
    '@id': mainEntityId,
    name: property.title,
    description: property.seo_description || property.summary || undefined,
    url: canonicalUrl,
    image: uniqueImages.length > 0 ? uniqueImages : undefined,
    offers,
    address,
    geo,
    numberOfRooms: typeof property.rooms === 'number' ? property.rooms : undefined,
    numberOfBedrooms: typeof property.bedrooms === 'number' ? property.bedrooms : undefined,
    numberOfBathroomsTotal: typeof property.bathrooms === 'number' ? property.bathrooms : undefined,
    floorSize,
    amenityFeature: amenityFeatures,
    broker: { '@id': orgId },
    sameAs: sameAs.length > 0 ? sameAs : undefined,
  };

  const webpageNode = {
    '@type': 'WebPage',
    '@id': webpageId,
    url: canonicalUrl,
    name: property.seo_title || `${property.title} | LiveLove Myoko`,
    description: property.seo_description || property.summary || `View details for ${property.title}.`,
    mainEntity: { '@id': mainEntityId },
    isPartOf: { '@id': websiteId },
  };

  const breadcrumbNode = {
    '@type': 'BreadcrumbList',
    '@id': breadcrumbId,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Properties',
        item: `${SITE_URL}/properties/`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: property.title,
        item: canonicalUrl,
      },
    ],
  };

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [propertyNode, webpageNode, breadcrumbNode],
  };

  return cleanSchema(graph);
}
