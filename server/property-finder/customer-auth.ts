import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { FinderHttpError } from './access';

export interface CustomerAuthEnv {
    /** Same dedicated Supabase project as the restricted property reader. */
    FINDER_DATABASE_PROJECT_REF?: string;
    /** Unset/disabled keeps the existing administrator-only release. */
    FINDER_CUSTOMER_ACCESS?: string;
    /** Separate rollout for account authentication; does not enable paid listings. */
    FINDER_AUTH_ENABLED?: string;
}

export interface CustomerIdentity {
    readonly kind: 'customer';
    readonly userId: string;
    readonly sessionId: string;
    readonly tokenExpiresAt: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function requireCustomerRollout(env: CustomerAuthEnv): void {
    if (env.FINDER_CUSTOMER_ACCESS === undefined || env.FINDER_CUSTOMER_ACCESS === 'disabled') {
        throw new FinderHttpError(403, 'customer_access_disabled');
    }
    if (env.FINDER_CUSTOMER_ACCESS !== 'enabled' || !/^[a-z0-9]{20}$/.test(env.FINDER_DATABASE_PROJECT_REF || '')) {
        throw new FinderHttpError(503, 'customer_access_not_configured');
    }
}

/** Verification only: no login, cookies, refresh tokens or client-supplied IDs. */
export async function authenticateCustomer(request: Request, env: CustomerAuthEnv, verificationKey?: JWTVerifyGetKey): Promise<CustomerIdentity> {
    requireCustomerRollout(env);
    return verifySupabaseIdentity(request, env, verificationKey);
}

/** Shared verification for account sessions, including unpaid accounts. */
export async function verifySupabaseIdentity(request: Request, env: CustomerAuthEnv, verificationKey?: JWTVerifyGetKey): Promise<CustomerIdentity> {
    if (!/^[a-z0-9]{20}$/.test(env.FINDER_DATABASE_PROJECT_REF || '')) throw new FinderHttpError(503, 'authentication_not_configured');
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization') || '');
    if (!match || match[1].length > 16384) throw new FinderHttpError(401, 'authentication_required');
    const issuer = `https://${env.FINDER_DATABASE_PROJECT_REF}.supabase.co/auth/v1`;
    let keys = verificationKey || keySets.get(issuer);
    if (!keys) {
        keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { timeoutDuration: 5000 });
        keySets.set(issuer, keys as ReturnType<typeof createRemoteJWKSet>);
    }
    try {
        const { payload } = await jwtVerify(match[1], keys, {
            issuer, audience: 'authenticated', algorithms: ['ES256', 'RS256'],
            requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat', 'role', 'session_id', 'is_anonymous'],
            clockTolerance: 0,
        });
        if (payload.aud !== 'authenticated' || payload.role !== 'authenticated' || payload.is_anonymous !== false
            || typeof payload.sub !== 'string' || !UUID.test(payload.sub)
            || typeof payload.session_id !== 'string' || !UUID.test(payload.session_id)
            || !Number.isSafeInteger(payload.iat) || payload.iat! <= 0 || payload.iat! > Date.now() / 1000 + 5
            || !Number.isSafeInteger(payload.exp) || payload.exp! <= payload.iat!) throw new Error('Invalid customer identity');
        return { kind: 'customer', userId: payload.sub.toLowerCase(), sessionId: payload.session_id.toLowerCase(), tokenExpiresAt: payload.exp! * 1000 };
    } catch {
        // Never reflect JWT contents, JOSE errors, keys or account identifiers.
        throw new FinderHttpError(401, 'authentication_required');
    }
}
