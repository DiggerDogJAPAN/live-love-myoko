import { handleFinderRequest, type FinderEnv } from '../../../server/property-finder/api';

// Cloudflare Pages Function, executed at request time outside the Next.js export.
export async function onRequest(context: { request: Request; env: FinderEnv }): Promise<Response> {
    return handleFinderRequest(context.request, context.env);
}
