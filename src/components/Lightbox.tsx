"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";

type LightboxImage = {
    src: string;
    alt?: string;
};

type LightboxProps = {
    images: LightboxImage[];
    initialIndex: number;
    onClose: () => void;
};

export default function Lightbox({ images, initialIndex, onClose }: LightboxProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const touchStart = useRef<number | null>(null);

    const handleNext = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
    }, [images.length]);

    const handlePrev = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    }, [images.length]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowRight") handleNext();
            if (e.key === "ArrowLeft") handlePrev();
        };

        document.addEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "hidden"; // Prevent background scrolling

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "unset";
        };
    }, [onClose, handleNext, handlePrev]);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStart.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStart.current === null) return;
        const touchEnd = e.changedTouches[0].clientX;
        const diff = touchStart.current - touchEnd;

        // Threshold for swipe
        if (Math.abs(diff) > 50) {
            if (diff > 0) handleNext();
            else handlePrev();
        }
        touchStart.current = null;
    };

    return (
        <div
            className="lightbox"
            onClick={onClose}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className="lightbox__content"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    className="lightbox__close"
                    onClick={onClose}
                    aria-label="Close image"
                >
                    ×
                </button>

                {images.length > 1 && (
                    <>
                        <button
                            className="lightbox__prev"
                            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                            aria-label="Previous image"
                        >
                            ‹
                        </button>
                        <button
                            className="lightbox__next"
                            onClick={(e) => { e.stopPropagation(); handleNext(); }}
                            aria-label="Next image"
                        >
                            ›
                        </button>
                        <div className="lightbox__index">
                            {currentIndex + 1} / {images.length}
                        </div>
                    </>
                )}

                <img
                    src={images[currentIndex].src}
                    alt={images[currentIndex].alt || ""}
                    className="lightbox__image"
                />
            </div>
        </div>
    );
}
