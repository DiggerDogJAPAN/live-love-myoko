import { siteOrigin, type AuthEnv } from '../auth/config';
import { BillingError, stripeIdentifier, stripeId, type PlanPrices, type StripePrice } from './model';

export interface BillingEnv extends AuthEnv {
    FINDER_BILLING_ENABLED?: string; FINDER_STRIPE_MODE?: string; STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_BASIC_PRICE_ID?: string; STRIPE_PREMIUM_PRICE_ID?: string; STRIPE_PORTAL_CONFIGURATION_ID?: string;
    STRIPE_BASIC_PRODUCT_ID?: string; STRIPE_PREMIUM_PRODUCT_ID?: string; STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID?: string;
    FINDER_BILLING_SUPABASE_SECRET_KEY?: string;
    FINDER_BILLING_SANDBOX_ENABLED?: string;
}
// Pin both API reads and the Dashboard snapshot webhook destination to this version.
export const STRIPE_VERSION = '2026-07-29.dahlia';
export function billingConfiguration(env: BillingEnv) {
    const origin = siteOrigin(env), livemode = env.FINDER_STRIPE_MODE === 'live';
    if (env.FINDER_BILLING_ENABLED !== 'enabled' || !['test', 'live'].includes(env.FINDER_STRIPE_MODE || '')
        || !new RegExp('^sk_' + (livemode ? 'live' : 'test') + '_[A-Za-z0-9]{10,}$').test(env.STRIPE_SECRET_KEY || '')
        || !/^whsec_[A-Za-z0-9]{10,}$/.test(env.STRIPE_WEBHOOK_SECRET || '')
        || !stripeIdentifier(env.STRIPE_BASIC_PRICE_ID, 'price') || !stripeIdentifier(env.STRIPE_PREMIUM_PRICE_ID, 'price')
        || env.STRIPE_BASIC_PRICE_ID === env.STRIPE_PREMIUM_PRICE_ID || !stripeIdentifier(env.STRIPE_PORTAL_CONFIGURATION_ID, 'bpc')
        || !stripeIdentifier(env.STRIPE_BASIC_PRODUCT_ID, 'prod') || !stripeIdentifier(env.STRIPE_PREMIUM_PRODUCT_ID, 'prod')
        || env.STRIPE_BASIC_PRODUCT_ID === env.STRIPE_PREMIUM_PRODUCT_ID
        || !stripeIdentifier(env.STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID, 'bpc')
        || env.STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID === env.STRIPE_PORTAL_CONFIGURATION_ID
        || !/^(sb_secret_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(env.FINDER_BILLING_SUPABASE_SECRET_KEY || '')
        || env.FINDER_SUPABASE_PROJECT_REF !== 'fgdoqsepihlzfqlqymet'
        || (!livemode && env.FINDER_BILLING_SANDBOX_ENABLED !== 'enabled')
        || (livemode && env.FINDER_BILLING_SANDBOX_ENABLED === 'enabled')) throw new BillingError('billing_not_configured');
    return { origin, livemode, sandbox: !livemode, prices: { basic: env.STRIPE_BASIC_PRICE_ID!, premium: env.STRIPE_PREMIUM_PRICE_ID! } as PlanPrices,
        products: { basic: env.STRIPE_BASIC_PRODUCT_ID!, premium: env.STRIPE_PREMIUM_PRODUCT_ID! } };
}
export async function stripeRequest<T>(env: BillingEnv, path: string, transport: typeof fetch, body?: URLSearchParams, key?: string): Promise<T> {
    if (!path.startsWith('/') || path.includes('://')) throw new BillingError();
    let response: Response;
    try {
        // Workers supports manual/follow; reject returned redirects explicitly so
        // provider credentials never reach another destination.
        response = await transport('https://api.stripe.com/v1' + path, { method: body ? 'POST' : 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000),
            headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'Stripe-Version': STRIPE_VERSION, Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body: body.toString() } : {}) });
    } catch { throw new BillingError(); }
    if (response.status >= 300 && response.status < 400) throw new BillingError();
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result)) throw new BillingError();
    return result as T;
}
export async function validatePrices(env: BillingEnv, transport: typeof fetch) {
    const config = billingConfiguration(env);
    const basic = await stripeRequest<StripePrice>(env, '/prices/' + config.prices.basic, transport);
    const premium = await stripeRequest<StripePrice>(env, '/prices/' + config.prices.premium, transport);
    for (const [price, amount, id, product] of [[basic, 2000, config.prices.basic, config.products.basic], [premium, 4000, config.prices.premium, config.products.premium]] as const) {
        if (price.id !== id || !price.active || price.currency !== 'jpy' || price.unit_amount !== amount || price.livemode !== config.livemode
            // Stripe Tax is disabled. Unspecified prices still charge their fixed
            // JPY amount; Checkout separately disables tax and verifies its total.
            || !['inclusive', 'unspecified'].includes(price.tax_behavior) || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1
            || price.recurring.usage_type !== 'licensed' || stripeId(price.product) !== product) throw new BillingError('billing_price_configuration');
    }
    return config;
}
interface PortalConfiguration {
    id: string; active: boolean; livemode: boolean; features: {
        subscription_update: { enabled: boolean; default_allowed_updates: string[]; proration_behavior: string;
            products?: { product: string; prices: string[] }[]; schedule_at_period_end?: { conditions: { type: string }[] }; billing_cycle_anchor?: string | null };
        subscription_cancel: { enabled: boolean; mode: string };
        payment_method_update: { enabled: boolean }; invoice_history: { enabled: boolean };
    };
}
export class BillingPortalConfigurationError extends BillingError {
    constructor(readonly configuration: 'management' | 'upgrade', readonly fields: string[]) { super('billing_portal_configuration'); }
}
export async function validatePortal(env: BillingEnv, transport: typeof fetch, upgrade = false) {
    const { prices, products, livemode } = billingConfiguration(env);
    const id = upgrade ? env.STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID : env.STRIPE_PORTAL_CONFIGURATION_ID;
    // Stripe omits the catalog without expansion; absence is not an empty catalog.
    const query = new URLSearchParams([
        ['expand[]', 'features.subscription_update.products'],
    ]);
    const portal = await stripeRequest<PortalConfiguration>(env, '/billing_portal/configurations/' + id + (upgrade ? '?' + query : ''), transport);
    const updates = portal.features?.subscription_update, cancel = portal.features?.subscription_cancel;
    const conditions = updates?.schedule_at_period_end?.conditions;
    const checks: [string, boolean][] = [
        ['id', portal.id === id], ['active', portal.active === true], ['livemode', portal.livemode === livemode],
        ['subscription_update.enabled', updates?.enabled === upgrade],
        ['subscription_cancel', cancel?.enabled === true && cancel.mode === 'at_period_end'],
        ['payment_method_update.enabled', portal.features?.payment_method_update?.enabled === true],
        ['invoice_history.enabled', portal.features?.invoice_history?.enabled === true],
    ];
    if (upgrade) checks.push(
        ['subscription_update.proration_behavior', updates?.proration_behavior === 'always_invoice'],
        ['subscription_update.default_allowed_updates', updates?.default_allowed_updates?.length === 1 && updates.default_allowed_updates[0] === 'price'],
        ['subscription_update.products', updates?.products?.length === 1 && updates.products[0].product === products.premium
            && updates.products[0].prices?.length === 1 && updates.products[0].prices[0] === prices.premium],
        ['subscription_update.billing_cycle_anchor', updates?.billing_cycle_anchor == null || updates.billing_cycle_anchor === 'unchanged'],
        // The only upgrade flow is a quantity-one Basic (2000) -> Premium (4000)
        // change with the same currency/interval. A decrease-only rule cannot
        // defer this increase; other scheduling rules remain unsupported.
        ['subscription_update.schedule_at_period_end', conditions === undefined || (Array.isArray(conditions)
            && (conditions.length === 0 || (conditions.length === 1 && conditions[0]?.type === 'decreasing_item_amount')))],
    );
    const fields = checks.filter(([, valid]) => !valid).map(([field]) => field);
    if (fields.length) throw new BillingPortalConfigurationError(upgrade ? 'upgrade' : 'management', fields);
}
export async function billingRpc<T>(env: BillingEnv, name: string, body: object, transport: typeof fetch): Promise<T> {
    let response: Response;
    try {
        response = await transport('https://fgdoqsepihlzfqlqymet.supabase.co/rest/v1/rpc/' + name, {
            method: 'POST', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000),
            headers: { apikey: env.FINDER_BILLING_SUPABASE_SECRET_KEY!, ...(env.FINDER_BILLING_SUPABASE_SECRET_KEY?.startsWith('eyJ') ? { Authorization: 'Bearer ' + env.FINDER_BILLING_SUPABASE_SECRET_KEY } : {}),
                'Content-Type': 'application/json', 'Content-Profile': 'public', Accept: 'application/json' }, body: JSON.stringify(body) });
    } catch { throw new BillingError(); }
    if (response.status >= 300 && response.status < 400) throw new BillingError();
    const result = await response.json().catch(() => null);
    if (!response.ok) {
        const code = ['billing_busy', 'billing_lease_expired', 'billing_existing_membership_review'].includes(result?.message) ? result.message : 'billing_unavailable';
        throw new BillingError(code);
    }
    return result as T;
}
