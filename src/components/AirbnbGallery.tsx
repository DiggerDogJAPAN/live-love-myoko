"use client";

import { useState, useMemo } from "react";
import Lightbox from "./Lightbox";

interface AirbnbGalleryProps {
    gallery: { directus_files_id: string }[];
    featuredImageId?: string | null;
    title: string;
    slug: string;
    collection?: 'properties' | 'accommodations';
}

function GalleryImage({ src, alt, isMain, onClick }: { src: string, alt: string, isMain: boolean, onClick: () => void }) {
    const [loaded, setLoaded] = useState(false);

    return (
        <img
            src={src}
            alt={alt}
            loading={isMain ? undefined : "lazy"}
            className={`airbnb-gallery__image ${loaded ? 'airbnb-gallery__image--loaded' : ''}`}
            onLoad={() => setLoaded(true)}
            onClick={onClick}
        />
    );
}

export default function AirbnbGallery({ gallery, featuredImageId, title, slug, collection = 'properties' }: AirbnbGalleryProps) {
    const [currentIndex, setCurrentIndex] = useState<number | null>(null);

    const isProd = process.env.NODE_ENV === 'production';
    const DIRECTUS_ASSETS_BASE = `${process.env.NEXT_PUBLIC_DIRECTUS_URL}/assets`;

    const getFullUrl = (id: string, index?: number, isFeatured?: boolean) => {
        if (isProd) {
            if (isFeatured) return `/images/${collection}/${slug}/featured.jpg`;
            return `/images/${collection}/${slug}/gallery-${index}.jpg`;
        }
        return `${DIRECTUS_ASSETS_BASE}/${id}`;
    };

    const getThumbUrl = (id: string, index: number, isFeatured?: boolean) => {
        if (isProd) {
            if (isFeatured) return `/images/${collection}/${slug}/featured.jpg`;
            return `/images/${collection}/${slug}/gallery-${index}.jpg`;
        }
        const width = isFeatured ? 1200 : 600;
        const height = isFeatured ? 800 : 400;
        return `${DIRECTUS_ASSETS_BASE}/${id}?width=${width}&height=${height}&fit=cover`;
    };

    // Process all images into a single sequence, prioritizing the featured image
    const allImages = useMemo(() => {
        const images = [];

        if (featuredImageId) {
            images.push({
                id: featuredImageId,
                src: getFullUrl(featuredImageId, 0, true),
                thumb: getThumbUrl(featuredImageId, 0, true),
                alt: `${title} featured image`,
                isFeatured: true
            });
        }

        gallery.forEach((item, index) => {
            images.push({
                id: item.directus_files_id,
                src: getFullUrl(item.directus_files_id, index + 1, false),
                thumb: getThumbUrl(item.directus_files_id, index + 1, false),
                alt: `${title} gallery image ${index + 1}`,
                isFeatured: false
            });
        });

        return images;
    }, [gallery, featuredImageId, title, slug, collection]);

    if (allImages.length === 0) return null;

    // We only show up to 5 images in the desktop grid
    const displayImages = allImages.slice(0, 5);

    return (
        <>
            <div className="airbnb-gallery">
                <div className="airbnb-gallery__grid">
                    {displayImages.map((img, index) => {
                        const isMain = index === 0;
                        const itemClass = isMain 
                            ? "airbnb-gallery__item airbnb-gallery__item--main" 
                            : "airbnb-gallery__item airbnb-gallery__item--side";
                            
                        return (
                            <div 
                                key={`${img.id}-${index}`} 
                                className={itemClass}
                                onClick={() => setCurrentIndex(index)}
                                role="button"
                                aria-label={`View photo ${index + 1}`}
                            >
                                <GalleryImage
                                    src={img.thumb}
                                    alt={img.alt}
                                    isMain={isMain}
                                    onClick={() => setCurrentIndex(index)}
                                />
                                {isMain && allImages.length > 1 && (
                                    <div className="airbnb-gallery__badge">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                            <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                            <polyline points="21 15 16 10 5 21"></polyline>
                                        </svg>
                                        {allImages.length} photos
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                
                {allImages.length > 5 && (
                    <button 
                        className="airbnb-gallery__btn" 
                        onClick={() => setCurrentIndex(0)}
                        aria-label="Show all photos"
                    >
                        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                            <path d="M2 3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm0 8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2zm8-8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V3zm0 8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-2z"></path>
                        </svg>
                        Show all photos
                    </button>
                )}
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
