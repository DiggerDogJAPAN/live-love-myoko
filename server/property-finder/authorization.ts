import { authenticateAdministrator, FinderHttpError, type FinderAccessEnv, type FinderIdentity } from './access';
import { authenticateCustomer, verifySupabaseIdentity, requireCustomerRollout, type CustomerAuthEnv, type CustomerIdentity } from './customer-auth';
import { loadMembershipSnapshot } from './membership-database';
import { authorizeMembership, type CustomerGrant, type FinderPermission, type MembershipSnapshot } from './membership';
import { cookieCredentialRequest } from '../auth/cookies';
import type { FinderDatabaseEnv } from './database';

export type FinderAuthorizationEnv = FinderAccessEnv & FinderDatabaseEnv & CustomerAuthEnv;
export type FinderGrant = { readonly kind: 'administrator'; readonly identity: FinderIdentity } | CustomerGrant;
export interface AuthorizationDependencies {
    authenticate: (request: Request, env: FinderAuthorizationEnv) => Promise<FinderIdentity>;
    authenticateCustomer: (request: Request, env: FinderAuthorizationEnv) => Promise<CustomerIdentity>;
    loadMembership: (env: FinderAuthorizationEnv, identity: CustomerIdentity) => Promise<MembershipSnapshot | null>;
}

/** All property-data handlers must request an explicit server-chosen permission.
 * A failed Access assertion never falls back to another authentication mechanism.
 */
export async function authorizeFinderRequest(request: Request, env: FinderAuthorizationEnv, permission: FinderPermission, dependencies: Partial<AuthorizationDependencies> = {}): Promise<FinderGrant> {
    if (request.headers.has('Cf-Access-Jwt-Assertion')) {
        const identity = await (dependencies.authenticate || authenticateAdministrator)(request, env);
        return { kind: 'administrator', identity };
    }
    const credential = env.FINDER_AUTH_ENABLED === 'enabled' ? cookieCredentialRequest(request) : request;
    if (!credential.headers.has('Authorization')) throw new FinderHttpError(401, 'authentication_required');
    if (env.FINDER_AUTH_ENABLED !== 'enabled') requireCustomerRollout(env); // Phase 1 stays disabled by default.
    const verify = env.FINDER_AUTH_ENABLED === 'enabled' ? verifySupabaseIdentity : authenticateCustomer;
    const identity = await (dependencies.authenticateCustomer || verify)(credential, env);
    const snapshot = await (dependencies.loadMembership || loadMembershipSnapshot)(env, identity);
    const grant = authorizeMembership(identity, snapshot, permission);
    if (grant.role !== 'administrator') requireCustomerRollout(env);
    return grant;
}
