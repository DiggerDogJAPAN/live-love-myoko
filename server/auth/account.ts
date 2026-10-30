import { FinderHttpError } from '../property-finder/errors';
import { verifySupabaseIdentity, type CustomerIdentity } from '../property-finder/customer-auth';
import { loadMembershipSnapshot } from '../property-finder/membership-database';
import { authorizeMembership, type MembershipSnapshot } from '../property-finder/membership';
import type { AccountDetails } from '../../src/lib/auth/types';
import { cookieCredentialRequest } from './cookies';
import { providerRequest, type AuthFetch, type ProviderUser } from './provider';
import type { AuthEnv } from './config';
export interface AuthDependencies {
    transport: AuthFetch;
    verify: (request: Request, env: AuthEnv) => Promise<CustomerIdentity>;
    snapshot: (env: AuthEnv, identity: CustomerIdentity) => Promise<MembershipSnapshot | null>;
}
export async function verifiedAccount(request: Request, env: AuthEnv, dependencies: Partial<AuthDependencies> = {}) {
    const credential = cookieCredentialRequest(request);
    const identity = await (dependencies.verify || verifySupabaseIdentity)(credential, env);
    const snapshot = await (dependencies.snapshot || loadMembershipSnapshot)(env, identity);
    if (!snapshot || snapshot.schemaVersion !== 2 || snapshot.userId !== identity.userId || snapshot.sessionId !== identity.sessionId
        || snapshot.sessionActive !== true || snapshot.accountActive !== true || !['customer', 'administrator'].includes(snapshot.role || '')
        || identity.tokenExpiresAt <= Date.now() || (snapshot.sessionValidUntil !== null && !(Date.parse(snapshot.sessionValidUntil) > Date.now()))) {
        throw new FinderHttpError(403, 'account_unavailable');
    }
    const access = credential.headers.get('Authorization')!.slice(7);
    const user = await providerRequest(env, '/user', undefined, access, 'GET', dependencies.transport) as unknown as ProviderUser;
    if (user.id !== identity.userId || !user.email || !user.email_confirmed_at) throw new FinderHttpError(403, 'email_verification_required');
    return { identity, snapshot, user, access };
}
export function accountDetails(account: Awaited<ReturnType<typeof verifiedAccount>>, env: AuthEnv): AccountDetails {
    const { user, snapshot, identity } = account;
    let active = false;
    try { authorizeMembership(identity, snapshot, 'listings:read'); active = true; } catch { /* Unpaid accounts can manage their account, never listings. */ }
    let savedAccess = false;
    try { authorizeMembership(identity, snapshot, 'saved-properties:use'); savedAccess = true; } catch { /* Premium/admin only. */ }
    const administrator = snapshot.role === 'administrator';
    return { user: { id: identity.userId, email: user.email!, name: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.slice(0, 80) : '', verified: true },
        sessionExpiresAt: identity.tokenExpiresAt,
        role: administrator ? 'administrator' : 'customer', membership: { tier: administrator ? null : snapshot.tier === 'basic' || snapshot.tier === 'premium' ? snapshot.tier : null,
            status: administrator ? 'not_required' : snapshot.status, paidThrough: administrator ? null : snapshot.paidThrough, active: !administrator && active },
        savedPropertiesAccess: savedAccess && (administrator || env.FINDER_CUSTOMER_ACCESS === 'enabled'),
        finderAccess: active && (administrator || env.FINDER_CUSTOMER_ACCESS === 'enabled'), paidAccessEnabled: env.FINDER_CUSTOMER_ACCESS === 'enabled' };
}
