import { authConfiguration, type AuthEnv } from './config';
import { FinderHttpError } from '../property-finder/errors';
import type { CustomerIdentity } from '../property-finder/customer-auth';
import type { MembershipSnapshot } from '../../src/lib/auth/types';

export interface AccountSnapshot extends MembershipSnapshot {
    finderAccess: boolean; savedPropertiesAccess: boolean; paidAccessEnabled: boolean; membershipActive: boolean;
}
export class AccountRpcFailure extends FinderHttpError {
    constructor(status: number, code: string, readonly upstreamStatus: number, readonly databaseCode?: string) { super(status, code); }
}
/** HTTPS only. No SQL client, custom database login or service-role credential. */
export async function loadAccountSnapshot(env: AuthEnv, identity: CustomerIdentity, access: string, transport: typeof fetch = fetch): Promise<AccountSnapshot> {
    const config = authConfiguration(env);
    let response: Response;
    try {
        response = await transport(config.provider.replace('/auth/v1','/rest/v1/rpc/finder_account'), {
            method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10000),
            headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + access, 'Content-Type': 'application/json', 'Content-Profile': 'public', Accept: 'application/json' }, body: '{}',
        });
    } catch { throw new AccountRpcFailure(503,'authentication_unavailable',0); }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const code = ['authentication_required','account_unavailable'].includes(data?.message) ? data.message
            : response.status === 401 ? 'authentication_required' : 'authentication_unavailable';
        throw new AccountRpcFailure(code === 'authentication_required' ? 401 : code === 'account_unavailable' ? 403 : 503,code,response.status,
            typeof data?.code === 'string' && /^[0-9A-Z]{5}$/.test(data.code) ? data.code : undefined);
    }
    if (!data || data.schemaVersion !== 2 || data.userId !== identity.userId || data.sessionId !== identity.sessionId
        || !['customer','administrator'].includes(data.role) || data.sessionActive !== true || data.accountActive !== true
        || ['finderAccess','savedPropertiesAccess','paidAccessEnabled','membershipActive'].some(k => typeof data[k] !== 'boolean')) {
        throw new AccountRpcFailure(503,'authentication_unavailable',response.status);
    }
    return data as AccountSnapshot;
}
