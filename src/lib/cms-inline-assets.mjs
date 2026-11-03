import { createHash } from 'node:crypto';

/** Export only images hosted by this CMS; external image URLs stay unchanged. */
export function inlineCmsImages(html = '', cmsUrl = '') {
    const images = [];
    for (const match of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)) {
        const source = match[2].replace(/&amp;/g, '&');
        let url;
        try { url = new URL(source, cmsUrl); } catch { continue; }
        if (url.origin !== new URL(cmsUrl).origin || url.username || url.password
            || !/^\/assets\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?:[./][^?#]*)?$/i.test(url.pathname)) continue;
        const extension = /\.(jpe?g|png|webp|gif|avif|svg)$/i.exec(url.pathname)?.[1]?.toLowerCase() || 'jpg';
        const digest = createHash('sha256').update(url.href).digest('hex').slice(0, 24);
        images.push({ source, url: url.href, publicPath: `/images/cms-inline/${digest}.${extension}` });
    }
    return images;
}

export function staticCmsHtml(html = '', cmsUrl = '') {
    const images = inlineCmsImages(html, cmsUrl);
    return html.replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])(.*?)\2/gi, (match, prefix, quote, source) => {
        const image = images.find(image => image.source === source.replace(/&amp;/g, '&'));
        return image ? `${prefix}${quote}${image.publicPath}${quote}` : match;
    });
}
