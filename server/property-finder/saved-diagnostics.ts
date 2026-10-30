import { FinderHttpError } from './errors';

export type SavedDatabaseStage = 'configuration' | 'connect' | 'transaction' | 'reader_identity' | 'eligibility' | 'save_helper' | 'remove_helper' | 'saved_ids' | 'current_listings' | 'result' | 'commit';
export type SavedRequestStage = 'route' | 'authorization' | 'request_body' | 'storage' | 'response';
const stages = new Set<SavedDatabaseStage | SavedRequestStage>(['configuration', 'connect', 'transaction', 'reader_identity', 'eligibility', 'save_helper', 'remove_helper', 'saved_ids', 'current_listings', 'result', 'commit', 'route', 'authorization', 'request_body', 'storage', 'response']);
const operations = new Set(['ids', 'list', 'save', 'remove']);
const codes = new Set(['authentication_not_configured', 'authentication_required', 'active_membership_required', 'membership_upgrade_required',
    'customer_access_disabled', 'customer_access_not_configured', 'invalid_listing_id', 'invalid_saved_request', 'method_not_allowed', 'same_origin_required',
    'saved_properties_unavailable', 'saved_listing_unavailable', 'saved_rate_limited', 'saved_limit_reached', 'saved_access_denied']);
const connectionCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'EPIPE']);
function databaseCode(error: unknown): string | undefined {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
    return typeof code === 'string' && (/^[0-9A-Z]{5}$/.test(code) || connectionCodes.has(code)) ? code : undefined;
}
/** Preserve classifications only: never retain raw SQL messages, detail, query,
 * parameters, credentials, private row data or the upstream error as a cause. */
export class SavedDatabaseFailure extends FinderHttpError {
    readonly databaseCode?: string;
    constructor(status: number, code: string, readonly stage: SavedDatabaseStage, error: unknown) {
        super(status, code); this.databaseCode = databaseCode(error);
    }
}
export function reportSavedFailure(requestId: string, operation: string, method: string, stage: SavedRequestStage, status: number, code: string, error: unknown): void {
    const database = error instanceof SavedDatabaseFailure;
    console.warn(JSON.stringify({ event: 'finder_saved_request_failure', requestId,
        operation: operations.has(operation) ? operation : 'unknown', method: ['GET', 'PUT', 'DELETE'].includes(method) ? method : 'other',
        stage: database && stages.has(error.stage) ? error.stage : stage,
        status, code: codes.has(code) ? code : 'saved_properties_unavailable',
        failure: database ? 'database' : error instanceof FinderHttpError ? 'request_rejected' : 'runtime',
        ...(database && error.databaseCode ? { databaseCode: error.databaseCode } : {}),
    }));
}
