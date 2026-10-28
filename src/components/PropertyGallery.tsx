/* eslint-disable @next/next/no-img-element -- Preserve the existing Directus and static-export image URLs. */
"use client";

import { useState, useMemo, useCallback } from "react";
import Lightbox from "./Lightbox";

interface PropertyGalleryProps {
    gallery: { directus_files_id: string }[];
    featuredImageId?: string | null;
    title: string;
    slug: string;
    collection?: 'properties' | 'accommodations';
    sold?: boolean;
}

export default function PropertyGallery({ gallery, featuredImageId, title, slug, collection = 'properties', sold = false }: PropertyGalleryProps) {
    const [currentIndex, setCurrentIndex] = useState<number | null>(null);

    const isProd = process.env.NODE_ENV === 'production';
    const DIRECTUS_ASSETS_BASE = `${process.env.NEXT_PUBLIC_DIRECTUS_URL}/assets`;

    const getFullUrl = useCallback((id: string, index?: number, isFeatured?: boolean) => {
        if (isProd) {
            if (isFeatured) return `/images/${collection}/${slug}/featured.jpg`;
            return `/images/${collection}/${slug}/gallery-${index}.jpg`;
        }
        return `${DIRECTUS_ASSETS_BASE}/${id}`;
    }, [isProd, collection, slug, DIRECTUS_ASSETS_BASE]);

    const getThumbUrl = useCallback((id: string, index: number) => {
        if (isProd) {
            return `/images/${collection}/${slug}/gallery-${index + 1}.jpg`;
        }
        return `${DIRECTUS_ASSETS_BASE}/${id}?width=600&height=400&fit=cover`;
    }, [isProd, collection, slug, DIRECTUS_ASSETS_BASE]);

    // Process all images into a single sequence, prioritizing the featured image
    const allImages = useMemo(() => {
        const images = [];

        // Add featured image first if it exists
        if (featuredImageId) {
            images.push({
                src: getFullUrl(featuredImageId, 0, true),
                alt: `${title} featured image`
            });
        }

        // Add gallery images in their provided order
        gallery.forEach((item, index) => {
            images.push({
                src: getFullUrl(item.directus_files_id, index + 1),
                alt: `${title} gallery image ${index + 1}`
            });
        });

        return images;
    }, [gallery, featuredImageId, title, getFullUrl]);

    // When a gallery thumbnail is clicked, open the lightbox at the correct index
    const handleThumbnailClick = (galleryIndex: number) => {
        // If featured image is at index 0, gallery index starts at 1
        const actualIndex = featuredImageId ? galleryIndex + 1 : galleryIndex;
        setCurrentIndex(actualIndex);
    };

    return (
        <>
            <div className="property-gallery">
                {gallery.map((item, index) => (
                    <button
                        key={item.directus_files_id}
                        type="button"
                        className="property-gallery__item"
                        onClick={() => handleThumbnailClick(index)}
                        aria-label={`View gallery image ${index + 1}`}
                    >
                        <div className="property-gallery__frame">
                            <img
                                src={getThumbUrl(item.directus_files_id, index)}
                                alt={`${title} gallery ${index + 1}`}
                                className={`property-gallery__image${sold ? ' property-photo--sold' : ''}`}
                            />
                        </div>
                    </button>
                ))}
            </div>

            {currentIndex !== null && (
                <Lightbox
                    images={allImages}
                    initialIndex={currentIndex}
                    onClose={() => setCurrentIndex(null)}
                    sold={sold}
                />
            )}
        </>
    );
}
