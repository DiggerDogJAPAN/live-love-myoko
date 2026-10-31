import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
    return {
        // Keep private pages' noindex metadata readable; exclude API endpoints from crawling.
        rules: { userAgent: '*', allow: '/', disallow: '/api/' },
        sitemap: 'https://love-live-myoko.com/sitemap.xml',
    };
}
