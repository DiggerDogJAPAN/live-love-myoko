"use client";

import { useState } from "react";
import Lightbox from "./Lightbox";

interface PropertyGalleryProps {
    gallery: { directus_files_id: string }[];
    title: string;
}

export default function PropertyGallery({ gallery, title }: PropertyGalleryProps) {
    const [activeImage, setActiveImage] = useState<string | null>(null);

    const getFullUrl = (id: string) => `${process.env.NEXT_PUBLIC_DIRECTUS_URL}/assets/${id}`;
    const getThumbUrl = (id: string) => `${process.env.NEXT_PUBLIC_DIRECTUS_URL}/assets/${id}?width=600&height=400&fit=cover`;

    return (
        <>
            <div className="property-gallery">
                {gallery.map((item, index) => (
                    <button
                        key={item.directus_files_id}
                        className="property-gallery__item"
                        onClick={() => setActiveImage(getFullUrl(item.directus_files_id))}
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

            {activeImage && (
                <Lightbox
                    src={activeImage}
                    alt={title}
                    onClose={() => setActiveImage(null)}
                />
            )}
        </>
    );
}
