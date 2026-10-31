import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { handleAuthRequest } from '../server/auth/api';
import { authConfiguration, type AuthEnv } from '../server/auth/config';
import { AUTH_COOKIES, cookieCredentialRequest, readFlow, signFlow } from '../server/auth/cookies';
import { type AuthDependencies } from '../server/auth/account';
import { verifySupabaseIdentity } from '../server/property-finder/customer-auth';
import type { AccountSnapshot } from '../server/auth/account-rpc';

const origin = 'https://love-live-myoko.com';
const env: AuthEnv = {
    FINDER_AUTH_ENABLED: 'enabled', FINDER_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
    FINDER_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_test_only',
    FINDER_AUTH_COOKIE_SECRET: 'test-only-cookie-signature-key-not-for-production-0123456789',
};
const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
let privateKey: CryptoKey, keys: JWTVerifyGetKey, token: string;
before(async () => {
    const pair = await generateKeyPair('ES256', { extractable: true }); privateKey = pair.privateKey;
    keys = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test-key', alg: 'ES256' }] });
    token = await jwt();
});
async function jwt(patch: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: `https://${env.FINDER_SUPABASE_PROJECT_REF}.supabase.co/auth/v1`, aud: 'authenticated',
        sub: userId, session_id: sessionId, is_anonymous: false, role: 'authenticated', iat: now, exp: now + 3600, ...patch,
    }).setProtectedHeader({ alg: 'ES256', kid: 'test-key' }).sign(privateKey);
}
function snapshot(patch: Partial<AccountSnapshot> = {}): AccountSnapshot {
    return { schemaVersion: 2, userId, sessionId, sessionActive: true, sessionValidUntil: null, accountActive: true,
        role: 'customer', subscriptionActive: false, tier: null, status: 'inactive', paymentStatus: 'unpaid',
        accessStartsAt: null, paidThrough: null, revokedAt: null, finderAccess: patch.role === 'administrator', savedPropertiesAccess: patch.role === 'administrator', paidAccessEnabled: false, membershipActive: false, ...patch };
}
const providerUser = () => ({ id: userId, email: 'customer@example.com', email_confirmed_at: '2026-01-01T00:00:00Z', user_metadata: { full_name: 'Customer' } });
const session = () => ({ access_token: token, refresh_token: 'test-refresh-token-only', expires_in: 3600, user: providerUser() });
type Call = { url: URL; method: string; headers: Headers; body: Record<string, unknown> | null };
function harness(reply?: (call: Call) => Response | Promise<Response>, record = snapshot()) {
    const calls: Call[] = [], subjects: string[] = [];
    const dependencies: AuthDependencies = {
        transport: async (input, init) => {
            const call = { url: new URL(String(input)), method: init?.method || 'GET', headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : null };
            calls.push(call); assert.equal(call.url.origin, `https://${env.FINDER_SUPABASE_PROJECT_REF}.supabase.co`);
            assert.equal(call.headers.get('apikey'), env.FINDER_SUPABASE_PUBLISHABLE_KEY); assert.equal(init?.redirect, 'manual'); assert.equal(init?.cache, 'no-store');
            if (reply) return reply(call);
            if (call.url.pathname.endsWith('/settings')) return Response.json({ mailer_autoconfirm: false, external: { google: true } });
            if (call.url.pathname.endsWith('/user')) return Response.json(providerUser());
            if (call.url.pathname.endsWith('/logout')) return new Response(null, { status: 204 });
            return Response.json(session());
        },
        verify: (request, settings) => verifySupabaseIdentity(request, settings, keys),
        snapshot: async (_env, identity) => { subjects.push(identity.userId); return record; },
    };
    return { dependencies, calls, subjects };
}
function req(action: string, body?: object, cookies = '', extra: Record<string, string> = {}) {
    return new Request(origin + '/api/auth/' + action, { method: body ? 'POST' : 'GET',
        headers: { ...(body ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...(cookies ? { Cookie: cookies } : {}), ...extra },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}
function cookie(response: Response, name: string) {
    const value = response.headers.getSetCookie().find(c => c.startsWith(name + '=') && !c.includes('Max-Age=0;'));
    assert(value, 'expected ' + name); return value.split(';')[0];
}
function privateResponse(response: Response) {
    assert.match(response.headers.get('Cache-Control')!, /private, no-store/);
    assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store'); assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
    assert.match(response.headers.get('Vary')!, /Cookie/); assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
}
function cleared(response: Response) { for (const name of Object.values(AUTH_COOKIES)) assert(response.headers.getSetCookie().some(c => c.startsWith(name + '=;') && c.includes('Max-Age=0;'))); }

test('Auth is a separate default-off rollout; configuration never exposes credentials or enables paid listings', async () => {
    const h = harness();
    for (const settings of [{}, { ...env, FINDER_AUTH_ENABLED: 'true' }, { ...env, FINDER_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_forbidden' }, { ...env, FINDER_AUTH_COOKIE_SECRET: 'short' }]) {
        const response = await handleAuthRequest(req('config'), settings, h.dependencies);
        assert.deepEqual(await response.json(), { enabled: false, googleEnabled: false }); privateResponse(response);
        assert.equal((await handleAuthRequest(req('login', { email: 'customer@example.com', password: 'long-password' }), settings, h.dependencies)).status, 503);
    }
    assert.equal(h.calls.length, 0);
    const response = await handleAuthRequest(req('config'), env, h.dependencies);
    assert.deepEqual(await response.json(), { enabled: true, googleEnabled: false }); assert.equal(h.calls.length, 0);
    for (const value of ['https://attacker.example', origin + '/path', 'https://user:pass@love-live-myoko.com', origin + '?x=1']) assert.throws(() => authConfiguration({ ...env, FINDER_AUTH_SITE_ORIGIN: value }));
});

test('Same-origin JSON, exact actions/methods and bounded bodies are enforced before any provider calls', async () => {
    const h = harness();
    for (const extra of [{ Origin: 'https://attacker.example' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }] as Record<string, string>[]) {
        assert.equal((await handleAuthRequest(req('logout', {}, AUTH_COOKIES.refresh + '=stolen', extra), env, h.dependencies)).status, 403);
    }
    const csrf = await handleAuthRequest(req('logout', {}, '', { Origin: 'https://attacker.example' }), env, h.dependencies);
    assert.equal(csrf.headers.get('Set-Cookie'), null);
    for (const action of ['admin', 'membership', 'upgrade', 'session/other', 'token', '?action=login']) assert.equal((await handleAuthRequest(req(action, {}), env, h.dependencies)).status, 404);
    assert.equal((await handleAuthRequest(req('session', {}), env, h.dependencies)).status, 405);
    assert.equal((await handleAuthRequest(req('login'), env, h.dependencies)).status, 405);
    assert.equal((await handleAuthRequest(req('login', {}, '', { 'Content-Type': 'text/plain' }), env, h.dependencies)).status, 415);
    assert.equal((await handleAuthRequest(req('login', { email: 'x'.repeat(9000) }), env, h.dependencies)).status, 413);
    const missingOrigin = new Request(origin + '/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal((await handleAuthRequest(missingOrigin, env, h.dependencies)).status, 403);
    assert.equal(h.calls.length, 0);
});

test('Registration sends only allowed profile fields, uses PKCE and requires provider email confirmation', async () => {
    const h = harness();
    for (const key of ['role', 'tier', 'user_id', 'is_admin', 'app_metadata', 'data']) {
        assert.equal((await handleAuthRequest(req('register', { name: 'Customer', email: 'customer@example.com', password: 'a-long-password', [key]: 'administrator' }), env, h.dependencies)).status, 400);
    }
    assert.equal(h.calls.length, 0);
    const response = await handleAuthRequest(req('register', { email: 'Customer@example.com', password: 'a-long-password', name: ' Customer ' }), env, h.dependencies);
    assert.equal(response.status, 200); assert.equal(response.headers.getSetCookie().length, 1); privateResponse(response);
    const flowCookie = cookie(response, AUTH_COOKIES.flow);
    const flow = await readFlow(decodeURIComponent(flowCookie.split('=')[1]), authConfiguration(env).secret, 'pkce');
    assert.equal(flow.kind, 'signup'); assert.equal(typeof flow.verifier, 'string');
    const signup = h.calls[1]; assert.equal(signup.url.pathname, '/auth/v1/signup'); assert.equal(signup.url.searchParams.get('redirect_to'), origin + '/api/auth/callback');
    assert.deepEqual(signup.body?.data, { full_name: 'Customer' }); assert.equal(signup.body?.email, 'customer@example.com');
    assert.equal(signup.body?.code_challenge, createHash('sha256').update(String(flow.verifier)).digest('base64url'));
    assert.equal(signup.body?.code_challenge_method, 's256'); assert(!JSON.stringify(await response.json()).includes(token));
    const badSettings = harness(() => Response.json({ mailer_autoconfirm: true }));
    assert.equal((await handleAuthRequest(req('register', { name: 'Customer', email: 'customer@example.com', password: 'a-long-password' }), env, badSettings.dependencies)).status, 503);
    assert.equal(badSettings.calls.length, 1);
});

test('Registration requires a nonblank full name before contacting the provider', async () => {
    const h = harness();
    for (const name of [undefined, null, 12, {}, '', '  \t\u3000 ', 'X'.repeat(81)]) {
        const body = { email: 'customer@example.com', password: 'a-long-password', ...(name !== undefined ? { name } : {}) };
        const response = await handleAuthRequest(req('register', body), env, h.dependencies);
        assert.equal(response.status, 400); assert.deepEqual(await response.json(), { code: 'invalid_name' });
        assert.equal(response.headers.get('Set-Cookie'), null);
    }
    assert.equal(h.calls.length, 0);
});

test('Registration trims full names into the existing profile field and the account reads that same name', async () => {
    for (const name of ['  Jane Smith  ', '\u3000山田 太郎\u3000', '  X  ']) {
        let storedName = '';
        const h = harness(call => {
            if (call.url.pathname.endsWith('/settings')) return Response.json({ mailer_autoconfirm: false });
            if (call.url.pathname.endsWith('/signup')) { storedName = (call.body?.data as { full_name: string }).full_name; return Response.json({}); }
            return Response.json({ ...providerUser(), user_metadata: { full_name: storedName } });
        });
        const response = await handleAuthRequest(req('register', { email: 'customer@example.com', password: 'a-long-password', name }), env, h.dependencies);
        assert.equal(response.status, 200); assert.equal(storedName, name.trim());
        const account = await handleAuthRequest(req('session', undefined, AUTH_COOKIES.access + '=' + token), env, h.dependencies);
        assert.equal(account.status, 200); assert.equal((await account.json()).user.name, name.trim());
    }
});

test('Existing verified accounts without a full name can still log in and read their own account', async () => {
    const h = harness(call => Response.json(call.url.pathname.endsWith('/user')
        ? { ...providerUser(), user_metadata: {} } : { ...session(), user: { ...providerUser(), user_metadata: {} } }));
    const login = await handleAuthRequest(req('login', { email: 'customer@example.com', password: 'a-long-password' }), env, h.dependencies);
    assert.equal(login.status, 200);
    const account = await handleAuthRequest(req('session', undefined, cookie(login, AUTH_COOKIES.access)), env, h.dependencies);
    assert.equal(account.status, 200); assert.equal((await account.json()).user.name, '');
});

test('Registration enforces eight characters and the technical maximum without trimming passwords', async () => {
    const rejected = harness();
    for (const value of [undefined, null, '', 'Aa1!abc', 'X'.repeat(129)]) {
        const response = await handleAuthRequest(req('register', { name: 'Full Name', email: 'customer@example.com', password: value }), env, rejected.dependencies);
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { code: typeof value === 'string' && value.length > 128 ? 'password_too_long' : 'invalid_password' });
    }
    assert.equal(rejected.calls.length, 0);
    for (const value of ['Aa1!abcd', ' Abc123!', 'Aa1!' + 'X'.repeat(124)]) {
        const h = harness();
        const response = await handleAuthRequest(req('register', { name: 'Full Name', email: 'customer@example.com', password: value }), env, h.dependencies);
        assert.equal(response.status, 200); assert.equal(h.calls[1].body?.password, value);
    }
});

test('Stronger provider password policy remains enforced and is never masked as successful registration', async () => {
    const h = harness(call => call.url.pathname.endsWith('/settings') ? Response.json({ mailer_autoconfirm: false })
        : Response.json({ code: 'weak_password', message: 'PRIVATE provider policy details' }, { status: 422 }));
    const response = await handleAuthRequest(req('register', { name: 'Full Name', email: 'customer@example.com', password: 'Aa1!abcd' }), env, h.dependencies);
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), { code: 'weak_password' });
    assert.equal(response.headers.get('Set-Cookie'), null);
});

test('Signup, resend and recovery ConfirmationURL flows preserve PKCE and return only to the canonical production callback', async () => {
    for (const action of ['register', 'resend', 'recover']) {
        const h = harness();
        const body = action === 'register' ? { name: 'Customer', email: 'customer@example.com', password: 'a-long-password' } : { email: 'customer@example.com' };
        const response = await handleAuthRequest(req(action, body), env, h.dependencies);
        assert.equal(response.status, 200);
        const state = cookie(response, AUTH_COOKIES.flow);
        const flow = await readFlow(decodeURIComponent(state.split('=')[1]), authConfiguration(env).secret, 'pkce');
        const sent = h.calls.find(c => c.url.pathname.endsWith(action === 'register' ? '/signup' : '/' + action))!;
        assert(sent); assert.equal(sent.url.searchParams.get('redirect_to'), origin + '/api/auth/callback');
        assert.equal(sent.body?.code_challenge_method, 's256');
        assert.equal(sent.body?.code_challenge, createHash('sha256').update(String(flow.verifier)).digest('base64url'));
        assert.equal(flow.kind, action === 'recover' ? 'reset' : 'signup');
        // The template's ConfirmationURL visits Supabase /verify first. PKCE
        // verification redirects to redirect_to?code=..., not to token fragments.
        const confirmationUrl = new URL(`https://${env.FINDER_SUPABASE_PROJECT_REF}.supabase.co/auth/v1/verify`);
        confirmationUrl.searchParams.set('token', 'pkce_provider-email-token');
        confirmationUrl.searchParams.set('type', action === 'recover' ? 'recovery' : 'signup');
        confirmationUrl.searchParams.set('redirect_to', sent.url.searchParams.get('redirect_to')!);
        const callback = new URL(confirmationUrl.searchParams.get('redirect_to')!); callback.searchParams.set('code', 'single-use-provider-code');
        const returned = await handleAuthRequest(new Request(callback, { headers: { Cookie: state } }), env, h.dependencies);
        assert.equal(returned.status, 303);
        assert.equal(returned.headers.get('Location'), origin + (action === 'recover' ? '/reset-password/' : '/account/'));
        assert(returned.headers.getSetCookie().some(c => c.startsWith(AUTH_COOKIES.flow + '=;') && c.includes('Max-Age=0;')));
        assert(cookie(returned, AUTH_COOKIES.access));
        if (action === 'recover') assert(cookie(returned, AUTH_COOKIES.recovery));
        assert.equal(h.calls.at(-1)?.body?.code_verifier, flow.verifier);
    }
});

test('Incorrect production domains, fragment callbacks and absent/expired PKCE state never mint sessions', async () => {
    const h = harness();
    for (const domain of ['https://lovelivemyoko.com', 'https://www.lovelivemyoko.com', 'https://www.love-live-myoko.com']) {
        assert.throws(() => authConfiguration({ ...env, FINDER_AUTH_SITE_ORIGIN: domain }));
        const response = await handleAuthRequest(new Request(domain + '/api/auth/callback?code=code'), env, h.dependencies);
        assert.equal(response.headers.get('Location'), origin + '/login/?error=link_expired');
        assert(!response.headers.getSetCookie().some(c => c.startsWith(AUTH_COOKIES.access + '=')));
    }
    const expired = await new SignJWT({ kind: 'reset', verifier: 'a'.repeat(43) }).setProtectedHeader({ alg: 'HS256' })
        .setIssuer('love-live-myoko-auth').setAudience('pkce').setIssuedAt(1).setExpirationTime(2).sign(authConfiguration(env).secret);
    for (const request of [req('callback'), req('callback#access_token=discarded'), req('callback?code=code'), req('callback?code=code', undefined, AUTH_COOKIES.flow + '=' + expired)]) {
        const response = await handleAuthRequest(request, env, h.dependencies);
        assert.equal(response.headers.get('Location'), origin + '/login/?error=link_expired'); privateResponse(response);
    }
    assert.equal(h.calls.length, 0);
});

test('Login and email-code verification issue only verified HttpOnly secure sessions; bad credentials and tokens fail closed', async () => {
    for (const [action, body] of [['login', { email: 'customer@example.com', password: 'a-long-password' }], ['verify-email', { email: 'customer@example.com', token: '123456' }]] as const) {
        const h = harness(); const response = await handleAuthRequest(req(action, body), env, h.dependencies);
        assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true }); privateResponse(response);
        for (const name of [AUTH_COOKIES.access, AUTH_COOKIES.refresh]) { const c = response.headers.getSetCookie().find(v => v.startsWith(name + '='))!; for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert(c.includes(attribute)); assert(!c.includes('Domain=')); }
        assert(cookie(response, AUTH_COOKIES.access).includes(token));
    }
    for (const value of [{ ...session(), access_token: 'forged' }, { ...session(), access_token: await jwt({ exp: 1 }) }, { ...session(), user: { ...providerUser(), id: otherId } }, { ...session(), user: { ...providerUser(), email_confirmed_at: null } }]) {
        const h = harness(() => Response.json(value)); const response = await handleAuthRequest(req('login', { email: 'customer@example.com', password: 'a-long-password' }), env, h.dependencies);
        assert([401, 403].includes(response.status)); assert.equal(response.headers.get('Set-Cookie'), null);
    }
    const rejected = harness(() => Response.json({ msg: 'private provider details' }, { status: 400 }));
    const failed = await handleAuthRequest(req('login', { email: 'customer@example.com', password: 'incorrect' }), env, rejected.dependencies);
    assert.equal(failed.status, 401); assert.deepEqual(await failed.json(), { code: 'invalid_credentials' });
});

test('Google is offered only when both configured and enabled, with signed PKCE and a fixed callback', async () => {
    const h = harness();
    assert.equal((await handleAuthRequest(req('google', {}), env, h.dependencies)).status, 503);
    const settings = { ...env, FINDER_GOOGLE_LOGIN_ENABLED: 'enabled' };
    assert.deepEqual(await (await handleAuthRequest(req('config'), settings, h.dependencies)).json(), { enabled: true, googleEnabled: true });
    const disabled = harness(() => Response.json({ external: { google: false } }));
    assert.equal((await handleAuthRequest(req('google', {}), settings, disabled.dependencies)).status, 503);
    const response = await handleAuthRequest(req('google', {}), settings, h.dependencies);
    const url = new URL((await response.json()).redirect); assert.equal(url.hostname, `${env.FINDER_SUPABASE_PROJECT_REF}.supabase.co`); assert.equal(url.pathname, '/auth/v1/authorize');
    assert.equal(url.searchParams.get('provider'), 'google'); assert.equal(url.searchParams.get('redirect_to'), origin + '/api/auth/callback');
    const state = cookie(response, AUTH_COOKIES.flow);
    const callback = await handleAuthRequest(req('callback?code=real-provider-code&next=https://attacker.example', undefined, state), settings, h.dependencies);
    assert.equal(callback.status, 303); assert.equal(callback.headers.get('Location'), origin + '/account/'); assert(cookie(callback, AUTH_COOKIES.access));
    const parts = state.slice(state.indexOf('=') + 1).split('.');
    // Change signature bytes, not the final base64url padding bits (or a
    // character that might already be "x"). This must always be a real forgery.
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    const tampered = AUTH_COOKIES.flow + '=' + parts.join('.');
    for (const cookies of ['', AUTH_COOKIES.flow + '=forged', tampered]) {
        const failed = await handleAuthRequest(req('callback?code=code', undefined, cookies), settings, h.dependencies);
        assert.equal(failed.headers.get('Location'), origin + '/login/?error=link_expired'); assert(!failed.headers.getSetCookie().some(c => c.startsWith(AUTH_COOKIES.access + '=')));
    }
    const exchanged = h.calls.find(c => c.url.searchParams.get('grant_type') === 'pkce')!;
    const flow = await readFlow(decodeURIComponent(state.split('=')[1]), authConfiguration(env).secret, 'pkce'); assert.equal(exchanged.body?.code_verifier, flow.verifier);
    const providerRejection = harness(() => Response.json({}, { status: 400 }));
    const replay = await handleAuthRequest(req('callback?code=used-code', undefined, state), settings, providerRejection.dependencies);
    assert.equal(replay.headers.get('Location'), origin + '/login/?error=link_expired');
});

test('Password reset requires its signed recovery session, binds user and session, updates then revokes globally', async () => {
    const h = harness();
    const recover = await handleAuthRequest(req('recover', { email: 'customer@example.com' }), env, h.dependencies);
    const callback = await handleAuthRequest(req('callback?code=recovery-code', undefined, cookie(recover, AUTH_COOKIES.flow)), env, h.dependencies);
    assert.equal(callback.headers.get('Location'), origin + '/reset-password/');
    const credentials = [cookie(callback, AUTH_COOKIES.access), cookie(callback, AUTH_COOKIES.recovery)].join('; ');
    const response = await handleAuthRequest(req('password', { password: 'new-long-password' }, credentials), env, h.dependencies);
    assert.equal(response.status, 200); cleared(response);
    const last = h.calls.slice(-2); assert.equal(last[0].method, 'PUT'); assert.deepEqual(last[0].body, { password: 'new-long-password' }); assert.equal(last[1].url.searchParams.get('scope'), 'global');
    const recoveryWrongSubject = await signFlow({ userId: otherId, sessionId }, authConfiguration(env).secret, 'recovery');
    for (const c of [AUTH_COOKIES.access + '=' + token, AUTH_COOKIES.access + '=' + token + '; ' + AUTH_COOKIES.recovery + '=' + recoveryWrongSubject]) {
        const isolated = harness(); assert([400, 403].includes((await handleAuthRequest(req('password', { password: 'new-long-password' }, c), env, isolated.dependencies)).status));
        assert(!isolated.calls.some(call => call.method === 'PUT'));
    }
});

test('Refresh rotates cookies; logout revokes the current session before clearing; provider outages are reported honestly', async () => {
    const h = harness(); const refreshCookie = AUTH_COOKIES.refresh + '=old-refresh-token';
    const refreshed = await handleAuthRequest(req('refresh', {}, refreshCookie), env, h.dependencies);
    assert.equal(refreshed.status, 200); assert.equal(cookie(refreshed, AUTH_COOKIES.refresh), AUTH_COOKIES.refresh + '=test-refresh-token-only'); assert.deepEqual(await refreshed.json(), { ok: true });
    const loggedOut = await handleAuthRequest(req('logout', {}, refreshCookie), env, h.dependencies);
    assert.equal(loggedOut.status, 200); cleared(loggedOut);
    assert.equal(h.calls.at(-1)?.url.searchParams.get('scope'), 'local'); assert.equal(h.calls.at(-1)?.headers.get('Authorization'), 'Bearer ' + token);
    const failed = harness(() => Response.json({}, { status: 400 }));
    const invalid = await handleAuthRequest(req('refresh', {}, refreshCookie), env, failed.dependencies); assert.equal(invalid.status, 400); cleared(invalid);
    const outage = harness(() => { throw new Error('private infrastructure failure'); });
    const unconfirmed = await handleAuthRequest(req('logout', {}, refreshCookie), env, outage.dependencies); assert.equal(unconfirmed.status, 503); cleared(unconfirmed); assert.deepEqual(await unconfirmed.json(), { code: 'logout_revocation_unavailable' });
});

test('Account lookup is bound to the verified subject/session; unpaid customers can manage only their own safe profile', async () => {
    const h = harness(); const credentials = AUTH_COOKIES.access + '=' + await jwt({ user_metadata: { role: 'administrator', tier: 'premium' } });
    const response = await handleAuthRequest(req('session?user_id=' + otherId, undefined, credentials, { 'X-User-Id': otherId, 'X-Role': 'administrator' }), env, h.dependencies);
    assert.equal(response.status, 200); privateResponse(response);
    const data = await response.json(); assert.equal(data.user.id, userId); assert.equal(data.role, 'customer'); assert.equal(data.membership.tier, null); assert.equal(data.membership.active, false); assert.equal(data.finderAccess, false); assert.equal(data.paidAccessEnabled, false);
    assert.deepEqual(h.subjects, [userId]); assert(!JSON.stringify(data).includes(token)); assert(!JSON.stringify(data).includes('paymentStatus'));
    assert.equal((await handleAuthRequest(req('profile', { name: ' Updated ' }, credentials), env, h.dependencies)).status, 200);
    assert.deepEqual(h.calls.at(-1)?.body, { data: { full_name: 'Updated' } });
    const before = h.calls.length;
    for (const body of [{ name: 'X', role: 'administrator' }, { name: 'X', tier: 'premium' }, { name: 'X', user_id: otherId }]) assert.equal((await handleAuthRequest(req('profile', body, credentials), env, h.dependencies)).status, 400);
    assert.equal(h.calls.length, before);
    for (const patch of [{ userId: otherId }, { sessionId: otherId }, { schemaVersion: 1 }, { role: undefined }, { sessionActive: false }, { accountActive: false }, { sessionValidUntil: new Date(0).toISOString() }]) {
        const invalid = harness(undefined, snapshot(patch)); assert.equal((await handleAuthRequest(req('session', undefined, credentials), env, invalid.dependencies)).status, 403); assert.equal(invalid.calls.length, 0);
    }
    assert.equal((await handleAuthRequest(req('session'), env, h.dependencies)).status, 401);
    assert.equal((await handleAuthRequest(req('session', undefined, credentials, { Authorization: 'Bearer forged' }), env, h.dependencies)).status, 401);
    assert.equal(cookieCredentialRequest(req('session', undefined, credentials + '; ' + credentials)).headers.get('Authorization'), null);
});

test('A fresh Supabase administrator login reaches its SQL-authorized account without Access; logout revokes it', async () => {
    let record: AccountSnapshot | null = snapshot({ role: 'administrator' });
    const h = harness(call => {
        if (call.url.pathname.endsWith('/logout')) { record = null; return new Response(null, { status: 204 }); }
        if (call.url.pathname.endsWith('/user')) return Response.json(providerUser());
        return Response.json(session());
    });
    h.dependencies.snapshot = async () => record;
    const login = await handleAuthRequest(req('login', { email: 'customer@example.com', password: 'a-long-password' }), env, h.dependencies);
    assert.equal(login.status, 200);
    const credentials = [cookie(login, AUTH_COOKIES.access), cookie(login, AUTH_COOKIES.refresh)].join('; ');
    const account = await handleAuthRequest(req('session', undefined, credentials), env, h.dependencies);
    assert.equal(account.status, 200);
    const details = await account.json(); assert.equal(details.role, 'administrator'); assert.equal(details.membership.tier, null); assert.equal(details.finderAccess, true);
    const logout = await handleAuthRequest(req('logout', {}, credentials), env, h.dependencies);
    assert.equal(logout.status, 200); cleared(logout);
    assert.equal((await handleAuthRequest(req('session', undefined, credentials), env, h.dependencies)).status, 403);
});

test('Email operations mask account existence and throttle errors survive without provider internals', async () => {
    for (const action of ['recover', 'resend']) {
        const h = harness(() => Response.json({ message: 'account not found; secret diagnostics' }, { status: 400 }));
        const response = await handleAuthRequest(req(action, { email: 'unknown@example.com' }), env, h.dependencies); assert.equal(response.status, 200); assert.match((await response.json()).message, /If this address/);
    }
    const h = harness(() => Response.json({ message: 'private provider body' }, { status: 429 }));
    const response = await handleAuthRequest(req('recover', { email: 'customer@example.com' }), env, h.dependencies); assert.equal(response.status, 429); assert.deepEqual(await response.json(), { code: 'too_many_attempts' });
});

test('Registration diagnostics distinguish key/settings failures from signup failures without reflecting provider details', async t => {
    const logs: string[] = [];
    t.mock.method(console, 'warn', (value: string) => { logs.push(value); });
    const providerRequestId = '12345678-1234-1234-1234-123456789abc';
    for (const failureAt of ['settings', 'signup']) {
        logs.length = 0;
        const h = harness(call => call.url.pathname.endsWith('/settings') && failureAt === 'signup'
            ? Response.json({ mailer_autoconfirm: false })
            : Response.json({ code: 'unexpected_failure', message: 'PRIVATE SMTP diagnostic customer@example.com password=private-password' },
                { status: failureAt === 'settings' ? 401 : 500, headers: { 'sb-request-id': providerRequestId } }));
        const response = await handleAuthRequest(req('register', { name: 'Customer', email: 'customer@example.com', password: 'private-password' }, '',
            { 'X-Request-ID': 'attacker-controlled@example.com' }), env, h.dependencies);
        assert.equal(response.status, failureAt === 'settings' ? 400 : 503);
        assert.deepEqual(await response.json(), { code: 'authentication_failed' });
        assert.match(response.headers.get('X-Request-ID')!, /^[a-f0-9-]{36}$/);
        assert.equal(logs.length, 1, 'a provider failure is logged once, including when propagated');
        const event = JSON.parse(logs[0]);
        assert.equal(event.stage, 'provider_' + failureAt); assert.equal(event.action, 'register');
        assert.equal(event.providerStatus, failureAt === 'settings' ? 401 : 500);
        assert.equal(event.providerCode, 'unexpected_failure'); assert.equal(event.providerRequestId, providerRequestId);
        assert.equal(event.requestId, response.headers.get('X-Request-ID'));
        assert(!/PRIVATE|customer@|private-password|attacker-controlled|sb_publishable_|test-only-cookie/.test(logs.join('')));
        if (failureAt === 'settings') assert.equal(h.calls.length, 1, 'settings/key failure never reaches signup');
    }
});

test('Provider timeouts, network failures and malformed responses have safe distinct diagnostics', async t => {
    const logs: string[] = [];
    t.mock.method(console, 'warn', (value: string) => { logs.push(value); });
    for (const kind of ['timeout', 'network', 'invalid_response']) {
        logs.length = 0;
        const h = harness(() => {
            if (kind === 'timeout') throw new DOMException('PRIVATE timeout with password=private-password', 'TimeoutError');
            if (kind === 'network') throw new TypeError('PRIVATE network https://secret@example.com/path');
            return new Response('PRIVATE not JSON', { status: 200 });
        });
        const response = await handleAuthRequest(req('register', { name: 'Customer', email: 'customer@example.com', password: 'private-password' }), env, h.dependencies);
        assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: 'authentication_unavailable' });
        assert.equal(logs.length, 1); const event = JSON.parse(logs[0]);
        assert.equal(event.failure, kind); assert.equal(event.stage, 'provider_settings');
        assert(!/PRIVATE|secret@|private-password|customer@/.test(logs.join('')));
    }
});

test('Masked signup rejections are logged safely and unrecognized provider fields cannot inject log content', async t => {
    const logs: string[] = [];
    t.mock.method(console, 'warn', (value: string) => { logs.push(value); });
    const h = harness(call => call.url.pathname.endsWith('/settings') ? Response.json({ mailer_autoconfirm: false })
        : Response.json({ code: 'PRIVATE customer@example.com', error: 'PRIVATE SMTP password' },
            { status: 400, headers: { 'sb-request-id': 'PRIVATE customer@example.com', 'x-sb-error-code': 'PRIVATE token' } }));
    const response = await handleAuthRequest(req('register', { name: 'Customer', email: 'customer@example.com', password: 'private-password' }), env, h.dependencies);
    assert.equal(response.status, 200); assert.match((await response.json()).message, /If this address/);
    const event = JSON.parse(logs[0]); assert.equal(event.stage, 'provider_signup'); assert.equal(event.providerStatus, 400);
    assert.equal(event.providerCode, undefined); assert.equal(event.providerRequestId, undefined);
    assert(!/PRIVATE|customer@|private-password/.test(logs.join('')));
});

test('Provider redirects fail closed without following a Location or proceeding to signup', async t => {
    const logs: string[] = [];
    t.mock.method(console, 'warn', (value: string) => { logs.push(value); });
    for (const status of [301, 302, 303, 307, 308]) for (const stage of ['settings', 'signup']) {
        const h = harness(call => stage === 'signup' && call.url.pathname.endsWith('/settings') ? Response.json({ mailer_autoconfirm: false })
            : new Response(null, { status, headers: { Location: 'https://attacker.example/collect?secret=PRIVATE' } }));
        const response = await handleAuthRequest(req('register', { name: 'Customer', email: 'customer@example.com', password: 'private-password' }), env, h.dependencies);
        assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: 'authentication_unavailable' });
        assert.equal(h.calls.length, stage === 'settings' ? 1 : 2); assert.equal(response.headers.get('Location'), null);
        const event = JSON.parse(logs.at(-1)!); assert.equal(event.failure, 'redirect'); assert.equal(event.providerStatus, status);
        assert(!/attacker|PRIVATE|customer@|private-password/.test(logs.join('')));
    }
});

test('Static routing includes public Auth Functions and the browser never stores tokens or constructs privileged clients', () => {
    const routes = JSON.parse(readFileSync('public/_routes.json', 'utf8'));
    for (const route of ['/api/auth', '/api/auth/*']) assert(routes.include.includes(route)); assert.deepEqual(routes.exclude, []);
    assert(readFileSync('functions/api/auth/[[path]].ts', 'utf8').includes('handleAuthRequest(context.request, context.env)'));
    for (const file of ['src/lib/auth/client.ts', 'src/components/auth/AuthForm.tsx', 'src/components/auth/AccountDashboard.tsx']) {
        assert(!/localStorage|sessionStorage|document\.cookie|service_role|sb_secret_|FINDER_AUTH_COOKIE_SECRET|createClient\(/.test(readFileSync(file, 'utf8')), file);
    }
});

test('Direct Supabase token handoff reuses a verified cookie session, is same-origin/no-store and never opens a database or exposes refresh/private secrets', async () => {
    const h = harness();
    h.dependencies.snapshot = async () => { throw new Error('handoff must not use Hyperdrive'); };
    const response = await handleAuthRequest(req('supabase-access', {}, `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.refresh}=private-refresh-token`), env, h.dependencies);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accessToken: token, supabaseOrigin: `https://${env.FINDER_SUPABASE_PROJECT_REF}.supabase.co`, publishableKey: env.FINDER_SUPABASE_PUBLISHABLE_KEY });
    assert.match(response.headers.get('Cache-Control')!, /private, no-store/);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null); assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(h.calls.length, 0);
    for (const body of [{ userId: otherId }, { tier: 'premium' }, { role: 'administrator' }]) assert.equal((await handleAuthRequest(req('supabase-access', body, `${AUTH_COOKIES.access}=${token}`), env, h.dependencies)).status, 400);
    const cross = new Request(origin + '/api/auth/supabase-access', { method: 'POST', headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json', Cookie: `${AUTH_COOKIES.access}=${token}` }, body: '{}' });
    assert.equal((await handleAuthRequest(cross, env, h.dependencies)).status, 403);
    assert.equal((await handleAuthRequest(req('supabase-access', {}), env, h.dependencies)).status, 401);
    assert.equal((await handleAuthRequest(req('supabase-access'), env, h.dependencies)).status, 405);
    assert.equal((await handleAuthRequest(req('supabase-access', {}, `${AUTH_COOKIES.access}=forged`), env, h.dependencies)).status, 401);
});
