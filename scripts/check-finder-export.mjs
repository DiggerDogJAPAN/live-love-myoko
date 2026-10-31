import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Paid Finder inventory and server secrets must never enter the public export.
 * Directus-managed /properties pages are intentionally public and use other fields.
 */
export function finderArtifactProblem(name, contents) {
    name = name.replaceAll('\\', '/');
    if (/(^|\/)api(\/|$)/.test(name)) return 'API response artifact';
    if (/\.(?:pem|key|sql|db|sqlite3?|backup|bak)(?:$|\.)|(^|\/)\.env(?:[./]|$)|(^|\/)\.dev\.vars|(^|\/)(?:server|crawler)\//i.test(name)) return 'private server artifact';
    const text = contents.replace(/\\+"/g, '"').replaceAll('&quot;', '"');
    if (/(?:["']originalListingUrl["']|\boriginalListingUrl)\s*:\s*["']https?:\/\//i.test(text)
        || /(?:["']askingPriceJpy["']|\baskingPriceJpy)\s*:\s*\d/.test(text)) return 'embedded Finder inventory';
    if (/postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|Synthetic Akakura|property_finder_web_reader|crawler_writer|FINDER_DATABASE_URL|DIRECTUS_STATIC_TOKEN|FINDER_AUTH_COOKIE_SECRET|FINDER_ALERTS_SUPABASE_SECRET_KEY|FINDER_ALERTS_CRON_SECRET|RESEND_API_KEY|sb_secret_/.test(text)) return 'server credential reference or development fixture';
    return null;
}

export function checkFinderExport(directory) {
    let checked = 0;
    for (const name of fs.readdirSync(directory, { recursive: true })) {
        const full = path.join(directory, name);
        if (!fs.statSync(full).isFile()) continue;
        const privateName = finderArtifactProblem(name, '');
        if (privateName) throw new Error(`Unsafe static export (${privateName}): ${name}`);
        if (!/\.(html|txt|json|js|map|css)$/i.test(name)) continue;
        const problem = finderArtifactProblem(name, fs.readFileSync(full, 'utf8'));
        if (problem) throw new Error(`Unsafe static export (${problem}): ${name}`);
        checked++;
    }
    const routeFile = path.join(directory, '_routes.json');
    const routes = JSON.parse(fs.readFileSync(routeFile, 'utf8'));
    if (routes.version !== 1 || !Array.isArray(routes.exclude) || routes.exclude.length !== 0) {
        throw new Error('Invalid runtime routing configuration');
    }
    const accountPages = ['login', 'register', 'account', 'forgot-password', 'reset-password', 'verify-email'];
    if (accountPages.some(name => fs.existsSync(path.join(directory, name, 'index.html')))
        && (!routes.include.includes('/api/auth') || !routes.include.includes('/api/auth/*'))) {
        throw new Error('Account pages require Auth API Pages Functions routing');
    }
    const search = fs.readFileSync(path.join(directory, 'property-finder/search/index.html'), 'utf8');
    if (/<article\b/.test(search) || /<dl\b/.test(search) || /data-fixture-preview=/.test(search)) throw new Error('Finder static search page contains property cards');
    return checked;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const checked = checkFinderExport(path.resolve(process.argv[2] || 'out'));
    console.log(`Finder static-export security guard passed (${checked} text artifacts; no embedded inventory or server credentials).`);
}
