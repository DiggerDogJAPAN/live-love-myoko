import { Client } from 'pg';
import { databaseClientConfiguration, customerProperty, type CustomerViewRow, type FinderDatabaseEnv } from './database';
import { requireCurrentGrant, type CustomerGrant } from './membership';
import { SavedDatabaseFailure, type SavedDatabaseStage } from './saved-diagnostics';
import { FinderHttpError } from './errors';
import type { SavedEntry, SavedPage } from '../../src/lib/property-finder/saved';

export type SavedOperation = 'ids' | 'list' | 'save' | 'remove';
export interface SavedQuery { operation: SavedOperation; propertyId?: string; cursor?: string }
export type SavedResult = { ids: string[]; total: number } | SavedPage | { propertyId: string; saved: boolean };
const PAGE_SIZE = 20;

/** Read only current eligible display fields; no historical listing snapshots. */
export async function savedPropertyOperation(env: FinderDatabaseEnv, grant: CustomerGrant, query: SavedQuery, client?: Client): Promise<SavedResult> {
    let transaction = false; let stage: SavedDatabaseStage = 'configuration';
    try {
        client ??= new Client(databaseClientConfiguration(env));
        stage = 'connect';
        await client.connect();
        // Keep the reader's default read-only setting. Only this scoped transaction
        // opts into the narrowly granted private helper mutations/rate counters.
        stage = 'transaction';
        await client.query('BEGIN READ WRITE'); transaction = true;
        stage = 'reader_identity';
        const { rows: identity } = await client.query<{ safe: boolean }>(`SELECT session_user='property_finder_web_reader' AND current_user=session_user
            AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication
            AND NOT pg_has_role(session_user,'crawler_writer','MEMBER') AS safe FROM pg_roles WHERE rolname=session_user`);
        if (identity.length !== 1 || identity[0].safe !== true) throw new Error('Unsafe saved property connection');
        await client.query("SET LOCAL statement_timeout='5s'");
        requireCurrentGrant(grant);
        let result: SavedResult;
        if (query.operation === 'save' || query.operation === 'remove') {
            if (query.operation === 'save') {
                // The postgres-owned helper authenticates/owns the bookmark, but
                // its view reads bypass caller RLS. Validate the target under the
                // actual customer role first, including restrictive portal gates.
                stage = 'eligibility';
                await client.query('SET LOCAL ROLE crawler_customer_reader');
                const { rows: eligible } = await client.query<{ listing_id: string }>(`SELECT listing_id FROM property_api.customer_properties
                    WHERE listing_id=$1::uuid AND publication_status='active' AND availability_status='active'`, [query.propertyId]);
                await client.query('RESET ROLE');
                if (eligible.length !== 1) throw new FinderHttpError(404, 'saved_listing_unavailable');
            }
            const helper = query.operation === 'save' ? 'save_property' : 'remove_saved_property';
            stage = query.operation === 'save' ? 'save_helper' : 'remove_helper';
            await client.query(`SELECT finder_security.${helper}($1::uuid,$2::uuid,$3::uuid)`, [grant.userId, grant.sessionId, query.propertyId]);
            result = { propertyId: query.propertyId!, saved: query.operation === 'save' };
        } else {
            stage = 'saved_ids';
            const { rows } = await client.query<{ property_id: string; saved_at: Date }>(
                'SELECT property_id,saved_at FROM finder_security.saved_property_ids($1::uuid,$2::uuid)', [grant.userId, grant.sessionId]);
            if (query.operation === 'ids') result = { ids: rows.map(row => row.property_id), total: rows.length };
            else {
                // A deleted cursor bookmark is harmless: compare immutable keyset values.
                const after = query.cursor?.split('|');
                const remaining = rows.filter(row => !after || row.saved_at.toISOString() < after[0]
                    || (row.saved_at.toISOString() === after[0] && row.property_id < after[1]));
                const page = remaining.slice(0, PAGE_SIZE);
                stage = 'current_listings';
                await client.query('SET LOCAL ROLE crawler_customer_reader');
                const { rows: current } = await client.query<CustomerViewRow>(`SELECT listing_id,title,asking_price_jpy,location_en,location_display,location_ja,
                    publication_status,availability_status,source_attribution,original_pdf_url,thumbnail_url,location_needs_review,region_en,region_ja,
                    municipality,property_type,transaction_type,purchase_conditions_ja FROM property_api.customer_properties
                    WHERE listing_id=ANY($1::uuid[]) AND publication_status='active' AND availability_status='active'`, [page.map(row => row.property_id)]);
                stage = 'result';
                const properties = new Map(current.map(row => [row.listing_id, customerProperty(row)]));
                const items: SavedEntry[] = page.map(row => ({ propertyId: row.property_id, savedAt: row.saved_at.toISOString(), property: properties.get(row.property_id) || null }));
                const last = page.at(-1);
                result = { items, total: rows.length, nextCursor: remaining.length > PAGE_SIZE && last ? `${last.saved_at.toISOString()}|${last.property_id}` : null };
            }
        }
        requireCurrentGrant(grant);
        stage = 'commit';
        await client.query('COMMIT'); transaction = false;
        return result;
    } catch (error) {
        const message = (error as { message?: string }).message;
        const failures: Record<string, [number, string]> = {
            saved_access_denied: [403, 'saved_access_denied'], saved_rate_limited: [429, 'saved_rate_limited'],
            saved_listing_unavailable: [404, 'saved_listing_unavailable'], saved_limit_reached: [409, 'saved_limit_reached'],
        };
        if (error instanceof FinderHttpError) throw new SavedDatabaseFailure(error.status, error.code, stage, error);
        if (message && Object.hasOwn(failures, message)) {
            const [status, code] = failures[message];
            throw new SavedDatabaseFailure(status, code, stage, error);
        }
        throw new SavedDatabaseFailure(503, 'saved_properties_unavailable', stage, error);
    } finally {
        if (client) {
            if (transaction) await client.query('ROLLBACK').catch(() => undefined);
            await client.end().catch(() => undefined);
        }
    }
}
