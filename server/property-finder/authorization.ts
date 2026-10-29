import { FinderHttpError } from './errors';
import { verifySupabaseIdentity, requireCustomerRollout, type CustomerAuthEnv, type CustomerIdentity } from './customer-auth';
import { loadMembershipSnapshot } from './membership-database';
import { authorizeMembership, type CustomerGrant, type FinderPermission, type MembershipSnapshot } from './membership';
import { cookieCredentialRequest } from '../auth/cookies';
import type { FinderDatabaseEnv } from './database';

export type FinderAuthorizationEnv = FinderDatabaseEnv & CustomerAuthEnv;
export type FinderGrant = CustomerGrant;
export interface AuthorizationDependencies {
    verifyIdentity: (request: Request, env: FinderAuthorizationEnv) => Promise<CustomerIdentity>;
    loadMembership: (env: FinderAuthorizationEnv, identity: CustomerIdentity) => Promise<MembershipSnapshot | null>;
}

/** All property data uses verified Supabase identity and a fresh private snapshot.
 * Proxy/Access headers and browser-supplied role flags convey no permissions. */
export async function authorizeFinderRequest(request: Request, env: FinderAuthorizationEnv, permission: FinderPermission, dependencies: Partial<AuthorizationDependencies> = {}): Promise<FinderGrant> {
    if (env.FINDER_AUTH_ENABLED !== 'enabled') throw new FinderHttpError(503, 'authentication_not_configured');
    const credential = cookieCredentialRequest(request);
    if (!credential.headers.has('Authorization')) throw new FinderHttpError(401, 'authentication_required');
    const identity = await (dependencies.verifyIdentity || verifySupabaseIdentity)(credential, env);
    const snapshot = await (dependencies.loadMembership || loadMembershipSnapshot)(env, identity);
    if (snapshot?.schemaVersion !== 2) throw new FinderHttpError(403, 'active_membership_required');
    const grant = authorizeMembership(identity, snapshot, permission);
    if (grant.role !== 'administrator') requireCustomerRollout(env);
    return grant;
}
