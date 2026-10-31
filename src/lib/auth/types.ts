export interface AccountDetails {
    user: { id: string; email: string; name: string; verified: boolean };
    sessionExpiresAt: number;
    role: 'customer' | 'administrator';
    membership: { tier: 'basic' | 'premium' | null; status: string; paidThrough: string | null; active: boolean };
    finderAccess: boolean;
    savedPropertiesAccess?: boolean;
    paidAccessEnabled: boolean;
}

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
