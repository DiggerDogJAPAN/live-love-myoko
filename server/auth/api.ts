import { FinderHttpError } from '../property-finder/errors';
import { verifySupabaseIdentity } from '../property-finder/customer-auth';
import { AUTH_HEADERS, authConfiguration, readAuthBody, requireSameOrigin, type AuthEnv } from './config';
import { AUTH_COOKIES, authCookie, clearAuthCookies, createPkce, readFlow, setAuthCookie, signFlow, type AuthFlow } from './cookies';
import { ProviderError, providerRequest, providerSession, type ProviderSession } from './provider';
import { accountDetails, verifiedAccount, type AuthDependencies } from './account';
import { reportAuthFailure } from './diagnostics';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, registrationFullName } from '../../src/lib/auth/validation';

function email(value: unknown): string {
    if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new FinderHttpError(400, 'invalid_email');
    return value.trim().toLowerCase();
}
function password(value: unknown, creating = true): string {
    if (typeof value !== 'string' || value.length < (creating ? MIN_PASSWORD_LENGTH : 1)) throw new FinderHttpError(400, 'invalid_password');
    if (value.length > MAX_PASSWORD_LENGTH) throw new FinderHttpError(400, 'password_too_long');
    return value;
}
function fields(body: Record<string, unknown>, allowed: string[]) {
    if (Object.keys(body).some(key => !allowed.includes(key))) throw new FinderHttpError(400, 'invalid_request');
}
function providerClientRejection(error: unknown): error is ProviderError {
    return error instanceof ProviderError && error.failure === 'http'
        && error.providerStatus >= 400 && error.providerStatus < 500 && error.providerStatus !== 429 && error.providerCode !== 'weak_password';
}
function sessionCookies(headers: Headers, value: ProviderSession) {
    setAuthCookie(headers, AUTH_COOKIES.access, value.access_token, value.expires_in);
    setAuthCookie(headers, AUTH_COOKIES.refresh, value.refresh_token, 60 * 60 * 24 * 30);
    setAuthCookie(headers, AUTH_COOKIES.recovery, '', 0);
}
export async function handleAuthRequest(request: Request, env: AuthEnv, dependencies: Partial<AuthDependencies> = {}): Promise<Response> {
    const headers = new Headers(AUTH_HEADERS);
    const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
    const action = new URL(request.url).pathname.replace(/\/$/, '').replace(/^\/api\/auth\//, '');
    const getActions = ['config', 'session', 'callback'];
    const postActions = ['register', 'login', 'logout', 'refresh', 'recover', 'resend', 'verify-email', 'google', 'password', 'profile'];
    if (![...getActions, ...postActions].includes(action)) return reply(404, { code: 'not_found' });
    if (request.method !== (getActions.includes(action) ? 'GET' : 'POST')) return reply(405, { code: 'method_not_allowed' });
    const requestId = crypto.randomUUID();
    headers.set('X-Request-ID', requestId);
    const reported = new WeakSet<object>();
    let stage = 'request_validation';
    const report = (error: unknown) => {
        if (error && typeof error === 'object') { if (reported.has(error)) return; reported.add(error); }
        reportAuthFailure(requestId, action, stage, error);
    };
    const provider = async (path: string, body?: object, access?: string, method?: string) => {
        const operation = path.split(/[/?]/)[1];
        stage = ['settings', 'signup', 'recover', 'resend', 'token', 'verify', 'user', 'logout'].includes(operation) ? 'provider_' + operation : 'provider';
        try { return await providerRequest(env, path, body, access, method, dependencies.transport); }
        catch (error) { report(error); throw error; }
    };
    const validateSession = async (value: Record<string, unknown>) => {
        const session = providerSession(value);
        const identity = await (dependencies.verify || verifySupabaseIdentity)(new Request(request.url, { headers: { Authorization: 'Bearer ' + session.access_token } }), env);
        const user = value.user as Record<string, unknown> | undefined;
        if (!user || user.id !== identity.userId || typeof user.email !== 'string' || typeof user.email_confirmed_at !== 'string' || !user.email_confirmed_at) throw new FinderHttpError(403, 'email_verification_required');
        return { session, identity };
    };
    let originValidated = false;
    try {
        if (action !== 'callback') { requireSameOrigin(request, env, request.method === 'POST'); originValidated = true; }
        if (action === 'config') {
            try { authConfiguration(env); } catch { return reply(200, { enabled: false, googleEnabled: false }); }
            let googleEnabled = false;
            if (env.FINDER_GOOGLE_LOGIN_ENABLED === 'enabled') {
                try { const settings = await provider('/settings'); googleEnabled = (settings.external as Record<string, unknown> | undefined)?.google === true; } catch { /* Provider unavailable stays hidden. */ }
            }
            return reply(200, { enabled: true, googleEnabled });
        }
        stage = 'configuration';
        const config = authConfiguration(env);
        const callback = config.origin + '/api/auth/callback';
        if (action === 'callback') {
            const query = new URL(request.url).searchParams;
            try {
                if (new URL(request.url).origin !== config.origin || query.has('error') || query.getAll('code').length !== 1) throw new FinderHttpError(400, 'link_expired');
                const code = query.get('code')!;
                const flow = await readFlow(authCookie(request, AUTH_COOKIES.flow), config.secret, 'pkce');
                if (!['signup', 'reset', 'google'].includes(String(flow.kind)) || typeof flow.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(flow.verifier) || code.length > 2048) throw new FinderHttpError(400, 'link_expired');
                const { session, identity } = await validateSession(await provider('/token?grant_type=pkce', { auth_code: code, code_verifier: flow.verifier }));
                sessionCookies(headers, session);
                if (flow.kind === 'reset') setAuthCookie(headers, AUTH_COOKIES.recovery, await signFlow({ userId: identity.userId, sessionId: identity.sessionId }, config.secret, 'recovery'), 600);
                headers.set('Location', config.origin + (flow.kind === 'reset' ? '/reset-password/' : '/account/'));
            } catch { headers.set('Location', config.origin + '/login/?error=link_expired'); }
            setAuthCookie(headers, AUTH_COOKIES.flow, '', 0);
            return new Response(null, { status: 303, headers });
        }
        if (action === 'session') return reply(200, accountDetails(await verifiedAccount(request, env, dependencies), env));
        stage = 'request_validation';
        const body = await readAuthBody(request);
        if (action === 'logout') {
            fields(body, []);
            let access = authCookie(request, AUTH_COOKIES.access);
            const refresh = authCookie(request, AUTH_COOKIES.refresh);
            try {
                if (refresh) {
                    try { access = (await validateSession(await provider('/token?grant_type=refresh_token', { refresh_token: refresh }))).session.access_token; }
                    catch (error) { if (!(access && error instanceof ProviderError && [400, 401, 403].includes(error.providerStatus))) throw error; }
                }
                if (access) await provider('/logout?scope=local', {}, access);
            } catch (error) {
                clearAuthCookies(headers);
                if (!(error instanceof ProviderError && [400, 401, 403, 404].includes(error.providerStatus))) return reply(503, { code: 'logout_revocation_unavailable' });
            }
            clearAuthCookies(headers); return reply(200, { ok: true });
        }
        if (action === 'refresh') {
            fields(body, []);
            const refresh = authCookie(request, AUTH_COOKIES.refresh);
            if (!refresh) throw new FinderHttpError(401, 'authentication_required');
            try {
                const { session } = await validateSession(await provider('/token?grant_type=refresh_token', { refresh_token: refresh }));
                sessionCookies(headers, session); return reply(200, { ok: true });
            } catch (error) { if (error instanceof ProviderError && error.failure === 'http' && error.providerStatus >= 400 && error.providerStatus < 500) clearAuthCookies(headers); throw error; }
        }
        if (action === 'profile') {
            fields(body, ['name']);
            if (typeof body.name !== 'string' || body.name.trim().length > 80) throw new FinderHttpError(400, 'invalid_request');
            const account = await verifiedAccount(request, env, dependencies);
            await provider('/user', { data: { full_name: body.name.trim() } }, account.access, 'PUT');
            return reply(200, { ok: true });
        }
        if (action === 'password') {
            fields(body, ['password']); const value = password(body.password);
            const account = await verifiedAccount(request, env, dependencies);
            const recovery = await readFlow(authCookie(request, AUTH_COOKIES.recovery), config.secret, 'recovery');
            if (recovery.userId !== account.identity.userId || recovery.sessionId !== account.identity.sessionId) throw new FinderHttpError(403, 'password_recovery_required');
            await provider('/user', { password: value }, account.access, 'PUT');
            try { await provider('/logout?scope=global', {}, account.access); }
            catch { clearAuthCookies(headers); return reply(503, { code: 'password_updated_signout_incomplete' }); }
            clearAuthCookies(headers); return reply(200, { ok: true });
        }
        if (action === 'google') {
            fields(body, []);
            const settings = await provider('/settings');
            if (env.FINDER_GOOGLE_LOGIN_ENABLED !== 'enabled' || (settings.external as Record<string, unknown> | undefined)?.google !== true) throw new FinderHttpError(503, 'google_not_configured');
            const pkce = await createPkce();
            setAuthCookie(headers, AUTH_COOKIES.flow, await signFlow({ kind: 'google', verifier: pkce.verifier }, config.secret, 'pkce'), 900);
            const url = new URL(config.provider + '/authorize');
            url.searchParams.set('provider', 'google'); url.searchParams.set('scopes', 'email profile'); url.searchParams.set('redirect_to', callback);
            url.searchParams.set('code_challenge', pkce.challenge); url.searchParams.set('code_challenge_method', 's256');
            return reply(200, { redirect: url.href });
        }
        if (action === 'login') {
            fields(body, ['email', 'password']);
            try {
                const { session } = await validateSession(await provider('/token?grant_type=password', { email: email(body.email), password: password(body.password, false) }));
                sessionCookies(headers, session); return reply(200, { ok: true });
            } catch (error) { if (providerClientRejection(error)) throw new FinderHttpError(401, 'invalid_credentials'); throw error; }
        }
        if (action === 'verify-email') {
            fields(body, ['email', 'token']);
            if (typeof body.token !== 'string' || !/^[0-9]{6,10}$/.test(body.token)) throw new FinderHttpError(400, 'invalid_verification_code');
            const { session } = await validateSession(await provider('/verify', { type: 'signup', email: email(body.email), token: body.token }));
            sessionCookies(headers, session); return reply(200, { ok: true });
        }
        fields(body, action === 'register' ? ['email', 'password', 'name'] : ['email']);
        const address = email(body.email);
        const fullName = action === 'register' ? registrationFullName(body.name) : null;
        if (action === 'register' && !fullName) throw new FinderHttpError(400, 'invalid_name');
        stage = 'pkce';
        if (action === 'resend') {
            // Resent ConfirmationURL links need their own PKCE state too; an
            // implicit resend would return fragment tokens to this server callback.
            const pkce = await createPkce();
            try { await provider('/resend?redirect_to=' + encodeURIComponent(callback), { type: 'signup', email: address,
                code_challenge: pkce.challenge, code_challenge_method: 's256' }); }
            catch (error) { if (!providerClientRejection(error)) throw error; }
            stage = 'flow_cookie';
            setAuthCookie(headers, AUTH_COOKIES.flow, await signFlow({ kind: 'signup', verifier: pkce.verifier }, config.secret, 'pkce'), 900);
        } else {
            const pkce = await createPkce();
            let kind: AuthFlow['kind'] = 'reset';
            if (action === 'register') {
                kind = 'signup';
                const value = password(body.password);
                const settings = await provider('/settings');
                if (settings.mailer_autoconfirm !== false) throw new FinderHttpError(503, 'email_confirmation_not_configured');
                try { await provider('/signup?redirect_to=' + encodeURIComponent(callback), { email: address, password: value,
                    data: { full_name: fullName }, code_challenge: pkce.challenge, code_challenge_method: 's256' }); }
                catch (error) { if (!providerClientRejection(error)) throw error; }
            } else {
                try { await provider('/recover?redirect_to=' + encodeURIComponent(callback), { email: address, code_challenge: pkce.challenge, code_challenge_method: 's256' }); }
                catch (error) { if (!providerClientRejection(error)) throw error; }
            }
            stage = 'flow_cookie';
            setAuthCookie(headers, AUTH_COOKIES.flow, await signFlow({ kind, verifier: pkce.verifier }, config.secret, 'pkce'), 900);
        }
        return reply(200, { ok: true, message: 'If this address can receive account emails, please check your inbox.' });
    } catch (error) {
        report(error);
        if (action === 'logout' && originValidated) { clearAuthCookies(headers); return reply(503, { code: 'logout_revocation_unavailable' }); }
        if (error instanceof FinderHttpError) return reply(error.status, { code: error.code });
        return reply(503, { code: 'authentication_unavailable' });
    }
}
