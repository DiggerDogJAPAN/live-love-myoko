import { handleAlertsRequest, type AlertsEnv } from '../../../server/property-alerts/api';
export async function onRequest(context: { request: Request; env: AlertsEnv }) {
    return handleAlertsRequest(context.request, context.env);
}
