"use client";

import Image from "next/image";

type LightboxProps = {
    src: string;
    alt?: string;
    onClose: () => void;
};

export default function Lightbox({ src, alt, onClose }: LightboxProps) {
    return (
        <div className="lightbox" onClick={onClose}>
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

                <img
                    src={src}
                    alt={alt || ""}
                    className="lightbox__image"
                />
            </div>
        </div>
    );
}
