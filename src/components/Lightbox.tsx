/* eslint-disable @next/next/no-img-element -- Preserve the existing CMS image and lightbox sources. */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";

type LightboxImage = {
    src: string;
    alt?: string;
};

type LightboxProps = {
    images: LightboxImage[];
    initialIndex: number;
    onClose: () => void;
    sold?: boolean;
};

export default function Lightbox({ images, initialIndex, onClose, sold = false }: LightboxProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const touchStart = useRef<number | null>(null);
    const dialog = useRef<HTMLDivElement>(null);

    const handleNext = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
    }, [images.length]);

    const handlePrev = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    }, [images.length]);

    useEffect(() => {
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowRight") handleNext();
            if (e.key === "ArrowLeft") handlePrev();
            if (e.key === "Tab") {
                const controls = dialog.current?.querySelectorAll<HTMLButtonElement>('button');
                if (!controls?.length) return;
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "hidden"; // Prevent background scrolling

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus();
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
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Image gallery"
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
                    className={`lightbox__image${sold ? ' property-photo--sold' : ''}`}
                />
                {sold && <span className="property-sold-badge">SOLD</span>}
            </div>
        </div>
    );
}
