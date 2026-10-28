import { Client, type ClientConfig } from 'pg';
import { checkServerIdentity, type ConnectionOptions } from 'node:tls';
import { originalListingUrl, propertyArea, propertyTitle, type FinderProperty } from '../../src/lib/property-finder/model';

export interface FinderDatabaseEnv {
    FINDER_DATABASE_URL?: string;
    FINDER_DATABASE_PROJECT_REF?: string;
    /** Cloudflare-managed private connection. Origin must use the reader + verify-full CA. */
    FINDER_HYPERDRIVE?: { connectionString: string };
}

const READER_LOGIN = 'property_finder_web_reader';

/** Parse explicitly so URI sslmode parameters cannot overwrite verified TLS options. */
export function databaseConfiguration(env: FinderDatabaseEnv): ClientConfig {
    if (!env.FINDER_DATABASE_URL || !/^[a-z0-9]{20}$/.test(env.FINDER_DATABASE_PROJECT_REF || '')) throw new Error('Database not configured');
    const uri = new URL(env.FINDER_DATABASE_URL);
    const ref = env.FINDER_DATABASE_PROJECT_REF;
    const user = decodeURIComponent(uri.username);
    const direct = uri.hostname === `db.${ref}.supabase.co` && user === READER_LOGIN;
    const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(uri.hostname) && user === `${READER_LOGIN}.${ref}`;
    if (!['postgres:', 'postgresql:'].includes(uri.protocol) || (!direct && !pooler) || !uri.password || uri.hash || uri.pathname !== '/postgres' || (uri.port && uri.port !== '5432')) {
        throw new Error('Dedicated reader connection required');
    }
    for (const [key, value] of uri.searchParams) {
        if (key !== 'sslmode' || value !== 'verify-full') throw new Error('Unsupported connection option');
    }
    const tls: ConnectionOptions & { expectedServerHostname: string } = {
        rejectUnauthorized: true,
        servername: uri.hostname,
        // pg-cloudflare passes this to Workers' TLS socket upgrade. Node uses servername.
        expectedServerHostname: uri.hostname,
        checkServerIdentity,
        minVersion: 'TLSv1.2',
    };
    return {
        host: uri.hostname, port: 5432, database: 'postgres', user,
        password: decodeURIComponent(uri.password),
        ssl: tls,
        connectionTimeoutMillis: 8000,
        query_timeout: 8000,
        application_name: 'love-live-myoko-property-finder',
    };
}

/** Hyperdrive owns the origin TLS handshake; its origin must be configured with
 * the Supabase CA and verify-full. The binding connection is Cloudflare-internal.
 * Without a binding, direct verified TLS remains available for trusted local workerd.
 */
export function databaseClientConfiguration(env: FinderDatabaseEnv): ClientConfig {
    const direct = databaseConfiguration(env); // Always validate the dedicated origin identity.
    if (!env.FINDER_HYPERDRIVE) return direct;
    const binding = env.FINDER_HYPERDRIVE.connectionString;
    if (!binding || !['postgres:', 'postgresql:'].includes(new URL(binding).protocol)) {
        throw new Error('Invalid Hyperdrive binding');
    }
    return {
        connectionString: binding,
        connectionTimeoutMillis: direct.connectionTimeoutMillis,
        query_timeout: direct.query_timeout,
        application_name: direct.application_name,
    };
}

export interface CustomerViewRow {
    title: string | null;
    asking_price_jpy: string | number | null;
    location_en: string | null;
    location_display: string | null;
    location_ja: string | null;
    publication_status: string;
    availability_status: string;
    source_attribution: string;
    original_pdf_url: string | null;
    thumbnail_url: string | null;
    location_needs_review: boolean;
    region_en: string | null;
    region_ja: string | null;
}

/** The restricted view returns null unless the stored image permission is permitted.
 * Only this reviewed source/host is enabled; unknown future sources keep placeholders.
 */
function permittedThumbnail(src: string | null, sourceName: string, title: string | null): FinderProperty['thumbnail'] {
    if (!src || sourceName !== 'Myoko Akiya Bank') return null;
    try {
        const url = new URL(src);
        if (url.protocol !== 'https:' || url.hostname !== 'www.city.myoko.niigata.jp'
            || url.username || url.password || url.port || !url.pathname.startsWith('/fs/')
            || !/\.(jpe?g|png|webp)$/i.test(url.pathname)) return null;
        return { src: url.href, alt: title || 'Myoko Akiya Bank property photograph', permission: 'permitted' };
    } catch {
        return null;
    }
}

export function customerProperty(row: CustomerViewRow): FinderProperty | null {
    if (row.publication_status !== 'active' || row.availability_status !== 'active') return null;
    if (!row.source_attribution.startsWith('Source: ') || !row.source_attribution.slice(8).trim()) throw new Error('Invalid source attribution');
    const sourceName = row.source_attribution.slice(8).trim();
    const price = row.asking_price_jpy === null ? null : Number(row.asking_price_jpy);
    if (price !== null && (!Number.isSafeInteger(price) || price < 0)) throw new Error('Invalid asking price');
    const property: FinderProperty = {
        title: row.title,
        // The current view omits municipality. This source is explicitly Myoko City.
        // Do not infer future sources' municipalities from a neighbourhood or region.
        municipality: sourceName === 'Myoko Akiya Bank' ? 'Myoko' : null,
        area: row.location_en || row.location_display || row.location_ja || null,
        neighbourhood: row.location_en || row.location_display || row.location_ja || null,
        regionEn: row.region_en,
        regionJa: row.region_ja,
        areaJa: row.location_ja,
        locationNeedsReview: row.location_needs_review,
        askingPriceJpy: price,
        availability: 'Available',
        sourceName,
        originalListingUrl: row.original_pdf_url,
        // The view gates thumbnail_url on permitted display rights; no copies are made.
        thumbnail: null,
        propertyType: null, listedAt: null,
    };
    property.area = propertyArea(property);
    property.title = propertyTitle(property);
    property.thumbnail = permittedThumbnail(row.thumbnail_url, sourceName, property.title);
    property.originalListingUrl = originalListingUrl(property);
    return property;
}

export async function loadCustomerProperties(env: FinderDatabaseEnv): Promise<FinderProperty[]> {
    const client = new Client(databaseClientConfiguration(env));
    let transaction = false;
    try {
        await client.connect();
        await client.query('BEGIN READ ONLY');
        transaction = true;
        const { rows } = await client.query<{ safe: boolean }>(`
            SELECT session_user = 'property_finder_web_reader'
                AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication
                AND NOT pg_has_role(session_user, 'crawler_writer', 'MEMBER') AS safe
            FROM pg_roles WHERE rolname = session_user
        `);
        if (rows.length !== 1 || rows[0].safe !== true) throw new Error('Unsafe database login');
        await client.query('SET LOCAL ROLE crawler_customer_reader');
        await client.query("SET LOCAL statement_timeout = '5s'");
        const result = await client.query<CustomerViewRow>(`
            SELECT title, asking_price_jpy, location_en, location_display, location_ja,
                publication_status, availability_status, source_attribution, original_pdf_url, thumbnail_url, location_needs_review, region_en, region_ja
            FROM property_api.customer_properties
            WHERE publication_status = 'active' AND availability_status = 'active'
            ORDER BY asking_price_jpy ASC NULLS LAST, original_pdf_url ASC
            LIMIT 501
        `);
        // Bounded snapshot for the existing client-side filters. Never silently truncate.
        if (result.rows.length > 500) throw new Error('Directory needs server pagination');
        return result.rows.map(customerProperty).filter((property): property is FinderProperty => property !== null);
    } finally {
        if (transaction) await client.query('ROLLBACK').catch(() => undefined);
        await client.end().catch(() => undefined);
    }
}
