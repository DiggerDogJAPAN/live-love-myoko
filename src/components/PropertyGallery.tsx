"use client";

import { useState, useMemo } from "react";
import Lightbox from "./Lightbox";

interface PropertyGalleryProps {
    gallery: { directus_files_id: string }[];
    featuredImageId?: string | null;
    title: string;
}

export default function PropertyGallery({ gallery, featuredImageId, title }: PropertyGalleryProps) {
    const [currentIndex, setCurrentIndex] = useState<number | null>(null);

    const DIRECTUS_ASSETS_BASE = "http://localhost:8055/assets";

    const getFullUrl = (id: string) =>
        `${DIRECTUS_ASSETS_BASE}/${id}`;

    const getThumbUrl = (id: string) =>
        `${DIRECTUS_ASSETS_BASE}/${id}?width=600&height=400&fit=cover`;

    // Process all images into a single sequence, prioritizing the featured image
    const allImages = useMemo(() => {
        const images = [];

        // Add featured image first if it exists
        if (featuredImageId) {
            images.push({
                src: getFullUrl(featuredImageId),
                alt: `${title} featured image`
            });
        }

        // Add gallery images in their provided order
        gallery.forEach((item, index) => {
            images.push({
                src: getFullUrl(item.directus_files_id),
                alt: `${title} gallery image ${index + 1}`
            });
        });

        return images;
    }, [gallery, featuredImageId, title]);

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
                        className="property-gallery__item"
                        onClick={() => handleThumbnailClick(index)}
                        aria-label={`View gallery image ${index + 1}`}
                    >
                        <div className="about__image-wrapper" style={{ aspectRatio: '16/10' }}>
                            <img
                                src={getThumbUrl(item.directus_files_id)}
                                alt={`${title} gallery ${index + 1}`}
                                className="about__image"
                                style={{ height: '100%', width: '100%', objectFit: 'cover' }}
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
                />
            )}
        </>
    );
}
