import { Client } from 'pg';
import { databaseClientConfiguration, type FinderDatabaseEnv } from './database';
import type { CustomerAuthEnv, CustomerIdentity } from './customer-auth';
import type { MembershipSnapshot } from './membership';

type MembershipRow = {
    schema_version: number; user_id: string; session_id: string;
    session_active: boolean; session_valid_until: Date | null; account_active: boolean;
    account_role?: 'customer' | 'administrator'; subscription_active?: boolean;
    tier: string | null; status: string; payment_status: string;
    access_starts_at: Date | null; paid_through: Date | null; revoked_at: Date | null;
};

/** No service-role key, auth-table access or membership writes in the application.
 * The reviewed SQL helper must be provisioned before customer rollout is enabled.
 */
export async function loadMembershipSnapshot(env: FinderDatabaseEnv & CustomerAuthEnv, identity: CustomerIdentity): Promise<MembershipSnapshot | null> {
    const client = new Client(databaseClientConfiguration(env));
    let transaction = false;
    try {
        await client.connect();
        await client.query('BEGIN READ ONLY');
        transaction = true;
        const identityCheck = await client.query<{ safe: boolean }>(`
            SELECT session_user = 'property_finder_web_reader' AND current_user = session_user
                AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication
                AND NOT pg_has_role(session_user, 'crawler_writer', 'MEMBER') AS safe
            FROM pg_roles WHERE rolname = session_user
        `);
        if (identityCheck.rows.length !== 1 || identityCheck.rows[0].safe !== true) throw new Error('Unsafe membership reader');
        await client.query("SET LOCAL statement_timeout = '5s'");
        const v2 = env.FINDER_AUTH_ENABLED === 'enabled';
        const columns = v2 ? ', account_role, subscription_active' : '';
        const helper = v2 ? 'account_snapshot' : 'membership_snapshot';
        const { rows } = await client.query<MembershipRow>(`
            SELECT schema_version, user_id, session_id, session_active, session_valid_until, account_active,
                tier, status, payment_status, access_starts_at, paid_through, revoked_at${columns}
            FROM finder_security.${helper}($1::uuid, $2::uuid)
        `, [identity.userId, identity.sessionId]);
        if (!rows.length) return null;
        if (rows.length !== 1) throw new Error('Invalid membership result');
        const row = rows[0];
        return {
            schemaVersion: row.schema_version, userId: row.user_id, sessionId: row.session_id,
            sessionActive: row.session_active, sessionValidUntil: row.session_valid_until?.toISOString() ?? null,
            role: row.account_role, subscriptionActive: row.subscription_active,
            accountActive: row.account_active, tier: row.tier, status: row.status, paymentStatus: row.payment_status,
            accessStartsAt: row.access_starts_at?.toISOString() ?? null, paidThrough: row.paid_through?.toISOString() ?? null,
            revokedAt: row.revoked_at?.toISOString() ?? null,
        };
    } finally {
        if (transaction) await client.query('ROLLBACK').catch(() => undefined);
        await client.end().catch(() => undefined);
    }
}
