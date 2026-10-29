import { SignJWT, jwtVerify } from 'jose';
import { FinderHttpError } from '../property-finder/access';
export const AUTH_COOKIES = { access: '__Host-llm-access', refresh: '__Host-llm-refresh', flow: '__Host-llm-flow', recovery: '__Host-llm-recovery' } as const;
export function authCookie(request: Request, name: string): string | null {
    const values = (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(name + '='));
    if (values.length !== 1) return null;
    try { const value = decodeURIComponent(values[0].slice(name.length + 1)); return value && value.length <= 3800 ? value : null; } catch { return null; }
}
export function cookieCredentialRequest(request: Request): Request {
    if (request.headers.has('Authorization')) return request;
    const access = authCookie(request, AUTH_COOKIES.access);
    if (!access) return request;
    const headers = new Headers(request.headers); headers.set('Authorization', 'Bearer ' + access);
    return new Request(request.url, { headers });
}
export function setAuthCookie(headers: Headers, name: string, value: string, maxAge: number): void {
    headers.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
}
export function clearAuthCookies(headers: Headers): void {
    for (const name of Object.values(AUTH_COOKIES)) setAuthCookie(headers, name, '', 0);
}
export type AuthFlow = { kind: 'signup' | 'reset' | 'google'; verifier: string };
export async function signFlow(value: AuthFlow | { userId: string; sessionId: string }, secret: Uint8Array, audience: 'pkce' | 'recovery'): Promise<string> {
    return new SignJWT({ ...value }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer('love-live-myoko-auth')
        .setAudience(audience).setIssuedAt().setExpirationTime(audience === 'pkce' ? '15m' : '10m').sign(secret);
}
export async function readFlow(value: string | null, secret: Uint8Array, audience: 'pkce' | 'recovery') {
    if (!value) throw new FinderHttpError(400, 'link_expired');
    try { return (await jwtVerify(value, secret, { issuer: 'love-live-myoko-auth', audience, algorithms: ['HS256'], requiredClaims: ['iat', 'exp'] })).payload; }
    catch { throw new FinderHttpError(400, 'link_expired'); }
}
export async function createPkce() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = Buffer.from(bytes).toString('base64url');
    const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
    return { verifier, challenge };
}
