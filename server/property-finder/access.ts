import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface FinderAccessEnv {
    FINDER_ACCESS_TEAM_DOMAIN?: string;
    /** API application AUD only; a different search-page AUD is not accepted here. */
    FINDER_ACCESS_AUD?: string;
    FINDER_ADMIN_EMAILS?: string;
}

export class FinderHttpError extends Error {
    constructor(public readonly status: number, public readonly code: string) { super(code); }
}

export interface FinderIdentity { subject: string; email: string }
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function accessConfiguration(env: FinderAccessEnv) {
    const domain = env.FINDER_ACCESS_TEAM_DOMAIN?.replace(/\/$/, '');
    if (!domain || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !env.FINDER_ACCESS_AUD) {
        throw new FinderHttpError(503, 'access_not_configured');
    }
    return { issuer: domain, audience: env.FINDER_ACCESS_AUD };
}

export async function authenticateAdministrator(
    request: Request,
    env: FinderAccessEnv,
    verificationKey?: JWTVerifyGetKey,
): Promise<FinderIdentity> {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) throw new FinderHttpError(401, 'authentication_required');
    const config = accessConfiguration(env);
    let keys = verificationKey || keySets.get(config.issuer);
    if (!keys) {
        keys = createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`), { timeoutDuration: 5000 });
        keySets.set(config.issuer, keys as ReturnType<typeof createRemoteJWKSet>);
    }
    try {
        const { payload } = await jwtVerify(token, keys, {
            issuer: config.issuer,
            audience: config.audience,
            algorithms: ['RS256'],
            requiredClaims: ['iss', 'aud', 'exp', 'iat', 'sub', 'email'],
            clockTolerance: 5,
        });
        if (payload.type !== 'app' || typeof payload.email !== 'string' || typeof payload.sub !== 'string' || !payload.sub) {
            throw new Error('Not an individual Access session');
        }
        const identity = { subject: payload.sub, email: payload.email.toLowerCase().trim() };
        await requireFinderEntitlement(identity, env);
        return identity;
    } catch (error) {
        if (error instanceof FinderHttpError) throw error;
        throw new FinderHttpError(401, 'authentication_required');
    }
}

/** Administrator-only allowance. Customer subscription permissions are handled
 * separately in authorization.ts against authoritative membership/session state.
 */
export async function requireFinderEntitlement(identity: FinderIdentity, env: FinderAccessEnv): Promise<void> {
    const admins = (env.FINDER_ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (!admins.length) throw new FinderHttpError(503, 'access_not_configured');
    if (!admins.includes(identity.email)) throw new FinderHttpError(403, 'administrator_access_required');
}
