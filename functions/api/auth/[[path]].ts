import { handleAuthRequest } from '../../../server/auth/api';
import type { AuthEnv } from '../../../server/auth/config';
export async function onRequest(context: { request: Request; env: AuthEnv }): Promise<Response> {
    return handleAuthRequest(context.request, context.env);
}
