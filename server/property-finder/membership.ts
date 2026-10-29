import { FinderHttpError } from './errors';
import type { CustomerIdentity } from './customer-auth';

export type MembershipTier = 'basic' | 'premium';
export type FinderPermission = 'listings:read' | 'search:use' | 'saved-properties:use' | 'saved-searches:use' | 'maps:read' | 'refund:request-review';
const permissions: Record<MembershipTier, readonly FinderPermission[]> = {
    basic: ['listings:read', 'search:use'],
    premium: ['listings:read', 'search:use', 'saved-properties:use', 'saved-searches:use', 'maps:read', 'refund:request-review'],
};

/** Only an authoritative server-side lookup may construct this snapshot. */
export interface MembershipSnapshot {
    schemaVersion: number;
    userId: string;
    sessionId: string;
    sessionActive: boolean;
    sessionValidUntil: string | null;
    accountActive: boolean;
    role?: 'customer' | 'administrator';
    subscriptionActive?: boolean;
    tier: string | null;
    status: string;
    paymentStatus: string;
    accessStartsAt: string | null;
    paidThrough: string | null;
    revokedAt: string | null;
}
export interface CustomerGrant {
    readonly kind: 'customer';
    readonly userId: string;
    readonly sessionId: string;
    readonly role: 'customer' | 'administrator';
    readonly tier: MembershipTier | null;
    readonly validUntil: number;
}

/** Payment/membership claims in a JWT, URL, header or browser state are ignored. */
export function authorizeMembership(identity: CustomerIdentity, snapshot: MembershipSnapshot | null, permission: FinderPermission, now = Date.now()): CustomerGrant {
    const denied = () => new FinderHttpError(403, 'active_membership_required');
    if (!snapshot || ![1, 2].includes(snapshot.schemaVersion) || snapshot.userId !== identity.userId || snapshot.sessionId !== identity.sessionId
        || snapshot.sessionActive !== true || snapshot.accountActive !== true) throw denied();
    const role = snapshot.schemaVersion === 1 ? 'customer' : snapshot.role;
    if ((snapshot.schemaVersion === 1 && snapshot.role && snapshot.role !== 'customer') || !['customer', 'administrator'].includes(role || '')) throw denied();
    const sessionUntil = snapshot.sessionValidUntil === null ? Infinity : Date.parse(snapshot.sessionValidUntil);
    const sessionLimit = Math.min(identity.tokenExpiresAt, sessionUntil);
    if (!Number.isFinite(sessionLimit) || sessionLimit <= now) throw denied();
    if (role === 'administrator') {
        if (!Object.values(permissions).some(list => list.includes(permission))) throw denied();
        return { kind: 'customer', role, userId: identity.userId, sessionId: identity.sessionId, tier: null, validUntil: sessionLimit };
    }
    if ((snapshot.schemaVersion === 2 && snapshot.subscriptionActive !== true)
        || snapshot.status !== 'active' || snapshot.paymentStatus !== 'paid' || snapshot.revokedAt !== null
        || !snapshot.tier || !Object.hasOwn(permissions, snapshot.tier)
        || typeof snapshot.accessStartsAt !== 'string' || typeof snapshot.paidThrough !== 'string') throw denied();
    const start = Date.parse(snapshot.accessStartsAt), paidThrough = Date.parse(snapshot.paidThrough);
    const validUntil = Math.min(sessionLimit, paidThrough);
    if (!Number.isFinite(start) || !Number.isFinite(paidThrough) || start > now || paidThrough <= start || validUntil <= now) throw denied();
    const tier = snapshot.tier as MembershipTier;
    if (!permissions[tier].includes(permission)) throw new FinderHttpError(403, 'membership_upgrade_required');
    return { kind: 'customer', role: 'customer', userId: identity.userId, sessionId: identity.sessionId, tier, validUntil };
}

export function requireCurrentGrant(grant: CustomerGrant): void {
    if (grant.validUntil <= Date.now()) throw new FinderHttpError(403, 'active_membership_required');
}
