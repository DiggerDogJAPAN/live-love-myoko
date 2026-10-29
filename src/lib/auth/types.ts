export interface AccountDetails {
    user: { id: string; email: string; name: string; verified: boolean };
    sessionExpiresAt: number;
    role: 'customer' | 'administrator';
    membership: { tier: 'basic' | 'premium' | null; status: string; paidThrough: string | null; active: boolean };
    finderAccess: boolean;
    paidAccessEnabled: boolean;
}
