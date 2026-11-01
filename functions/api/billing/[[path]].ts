import { handleBillingRequest } from '../../../server/billing/api';
import type { BillingEnv } from '../../../server/billing/provider';

export async function onRequest(context: { request: Request; env: BillingEnv }): Promise<Response> {
    return handleBillingRequest(context.request, context.env);
}
