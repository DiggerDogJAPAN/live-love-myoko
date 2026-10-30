import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Client } from 'pg';
import { handleSavedRequest } from '../server/property-finder/saved-api';
import { savedPropertyOperation } from '../server/property-finder/saved-database';
import { SavedDatabaseFailure } from '../server/property-finder/saved-diagnostics';
import type { CustomerGrant } from '../server/property-finder/membership';

const user = '00000000-0000-4000-8000-000000000001', session = '00000000-0000-4000-8000-000000000011';
const env = { FINDER_AUTH_ENABLED: 'enabled', FINDER_AUTH_SITE_ORIGIN: 'https://love-live-myoko.com', FINDER_CUSTOMER_ACCESS: 'disabled' };
const grant: CustomerGrant = { kind: 'customer', userId: user, sessionId: session, role: 'administrator', tier: null, validUntil: Date.now() + 3600000 };
function request(path = '/ids', method = 'GET', body?: string) {
    return new Request('https://love-live-myoko.com/api/property-finder/saved-properties' + path, { method, headers: { Authorization: 'Bearer synthetic-private-token', Cookie: 'synthetic-private-cookie', Origin: env.FINDER_AUTH_SITE_ORIGIN, 'X-Request-ID': 'private-client-value' }, body });
}
const authorization = {
    verifyIdentity: async () => ({ kind: 'customer' as const, userId: user, sessionId: session, tokenExpiresAt: grant.validUntil }),
    loadMembership: async () => ({ schemaVersion: 2, userId: user, sessionId: session, sessionActive: true, sessionValidUntil: null, accountActive: true, role: 'administrator' as const,
        subscriptionActive: false, tier: null, status: 'inactive', paymentStatus: 'unpaid', accessStartsAt: null, paidThrough: null, revokedAt: null }),
};
function failingClient(code: string, message: string) {
    const queries: string[] = [];
    const client = { connect: async () => undefined, end: async () => undefined, query: async (sql: string) => {
        queries.push(sql); if (sql.includes('FROM pg_roles')) return { rows: [{ safe: true }] };
        if (sql.includes('finder_security.saved_property_ids')) throw Object.assign(new Error(message), { code, detail: 'private-row-details', query: 'private SQL parameters' });
        return { rows: [] };
    } } as unknown as Client;
    return { client, queries };
}
test('Database failures log only request ID, safe operation/status/stage and SQLSTATE, never upstream details or credentials', async t => {
    const logs: string[] = []; t.mock.method(console, 'warn', (line: string) => logs.push(line));
    const h = failingClient('42501', 'permission denied: postgresql://private-user:private-password@host/database');
    const response = await handleSavedRequest(request(), env, { ...authorization, saved: (settings, current, query) => savedPropertyOperation(settings, current, query, h.client) });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: 'saved_properties_unavailable' });
    const log = JSON.parse(logs[0]); assert.equal(log.event, 'finder_saved_request_failure'); assert.equal(log.operation, 'ids'); assert.equal(log.method, 'GET'); assert.equal(log.stage, 'saved_ids');
    assert.equal(log.status, 503); assert.equal(log.databaseCode, '42501'); assert.equal(log.requestId, response.headers.get('X-Request-ID')); assert.notEqual(log.requestId, 'private-client-value');
    assert(h.queries.includes('ROLLBACK'));
    assert(!/private-|postgresql|cookie|token|parameters|userId|sessionId/.test(logs.join('')));
});
test('Expected database rate limits retain safe status/retry guidance while malformed database codes are omitted', async t => {
    const logs: string[] = []; t.mock.method(console, 'warn', (line: string) => logs.push(line));
    const h = failingClient('P0001', 'saved_rate_limited');
    const response = await handleSavedRequest(request(), env, { ...authorization, saved: (settings, current, query) => savedPropertyOperation(settings, current, query, h.client) });
    assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '60'); assert.deepEqual(await response.json(), { code: 'saved_rate_limited' });
    assert.equal(JSON.parse(logs[0]).databaseCode, 'P0001');
    const unsafe = new SavedDatabaseFailure(503, 'saved_properties_unavailable', 'connect', { code: 'private-secret-from-driver' }); assert.equal(unsafe.databaseCode, undefined);
});
test('Invalid ownership payloads are rejected with a correlatable body-stage diagnostic without logging their contents', async t => {
    const logs: string[] = []; t.mock.method(console, 'warn', (line: string) => logs.push(line)); let called = false;
    const response = await handleSavedRequest(request('/00000000-0000-4000-8000-000000000101', 'PUT', '{"userId":"private-other-owner"}'), env, { ...authorization, saved: async () => { called = true; return { ids: [], total: 0 }; } });
    assert.equal(response.status, 400); assert.equal(called, false); const log = JSON.parse(logs[0]); assert.equal(log.operation, 'save'); assert.equal(log.stage, 'request_body'); assert.equal(log.code, 'invalid_saved_request');
    assert(!logs[0].includes('private-other-owner')); assert.equal(log.requestId, response.headers.get('X-Request-ID'));
});
