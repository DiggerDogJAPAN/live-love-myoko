import { customerProperty, type CustomerViewRow } from '../../src/lib/property-finder/property-data';
import { formatPrice, originalListingUrl, propertyLocation } from '../../src/lib/property-finder/model';
export const ALERT_AREAS = [
    { id: 'myoko', label: 'Myoko' }, { id: 'joetsu', label: 'Joetsu' },
    { id: 'shinano', label: 'Shinano Town / Kurohime' }, { id: 'iizuna', label: 'Iizuna' },
] as const;
const hosts: Record<string, string[]> = {
    'Myoko Akiya Bank': ['www.city.myoko.niigata.jp'], 'Shinano Town Akiya Bank': ['shinanomachi-iju.jp'],
    'Joetsu City Akiya Bank': ['joetsu-akiyabank.jp'], 'Iizuna Town Akiya Bank': ['www.town.iizuna.nagano.jp'],
    'Rakuen Shinshu Akiya Bank (Iizuna)': ['rakuen-akiya.jp'], SUUMO: ['suumo.jp'], Rakusumu: ['www.rakusumu.com'],
};
export function alertProperties(rows: CustomerViewRow[]) {
    return rows.flatMap(row => {
        try {
            const p = customerProperty(row); if (!p?.id) return [];
            const link = originalListingUrl(p); if (!link) return [];
            const url = new URL(link);
            if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname === '/'
                || !hosts[p.sourceName]?.includes(url.hostname) || /[\s<>]/.test(link)) return [];
            return [{ id: p.id, location: propertyLocation(p), price: formatPrice(p.askingPriceJpy), source: p.sourceName, url: url.href,
                municipality: p.municipality || '' }];
        } catch { return []; }
    });
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function propertyAlertEmail(properties: ReturnType<typeof alertProperties>, unsubscribeUrl: string, test = false) {
    if (!properties.length) throw Error('no_safe_properties');
    const areas = [...new Set(properties.map(p => p.municipality))];
    const location = areas.length === 1 ? properties[0].municipality.replace(' Town', '') : '';
    const subject = `${test ? '[TEST] ' : ''}${location ? `New Properties in ${location}` : 'New Properties Matching Your Interests'} — Love Live Myoko`;
    const count = `${properties.length} new ${properties.length === 1 ? 'property' : 'properties'}`;
    const intro = test ? 'This is your administrator test email. These are real current listings; this test does not affect daily notifications.'
        : `We found ${count} matching your selected areas. Explore the original Japanese listings below.`;
    const cards = properties.map(p => `<tr><td style="padding:24px 0;border-bottom:1px solid #e6e6e2"><h2 style="margin:0 0 12px;font:24px/1.3 Georgia,serif;color:#1f2a30">Property in ${escape(p.location)}</h2><p style="margin:0 0 8px;font:20px Georgia,serif;color:#2e6b58">${escape(p.price)}</p><p style="margin:0 0 16px;color:#5f6c72;font-size:14px">Source: ${escape(p.source)}</p><a href="${escape(p.url)}" style="color:#2e6b58;font-weight:600;text-underline-offset:3px">View Original Property Listing →</a></td></tr>`).join('');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title><style>@media(max-width:620px){.wrap{width:100%!important}.content{padding:24px!important}}</style></head><body style="margin:0;background:#f2f4f1;color:#1f2a30;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escape(test ? 'Your Property Alerts test preview' : count+' matching your interests')}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px"><table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #dcdcd8;border-radius:16px"><tr><td style="padding:28px 32px;background:#2e6b58;color:#ffffff;border-radius:16px 16px 0 0"><p style="margin:0 0 12px;font:24px Georgia,serif">Love Live Myoko</p><p style="margin:0;font-size:12px;letter-spacing:2px">PROPERTY FINDER · PREMIUM${test ? ' · TEST' : ''}</p></td></tr><tr><td class="content" style="padding:32px"><h1 style="margin:0 0 16px;font:32px/1.2 Georgia,serif">New possibilities. A place of your own.</h1><p style="margin:0 0 8px;line-height:1.7;color:#5f6c72">${escape(intro)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${cards}</table><p style="margin:24px 0;line-height:1.7;color:#5f6c72;font-size:14px">Please confirm current details, availability and purchase conditions with the original source. Original listing links open the Japanese provider’s website.</p><a href="https://love-live-myoko.com/account/#property-alerts" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#2e6b58;color:#ffffff;text-decoration:none;font-weight:600">Manage Property Alerts</a><p style="margin:28px 0 0;font-size:13px;line-height:1.7;color:#5f6c72">Love Live Myoko · Property Finder<br><a href="${escape(unsubscribeUrl)}" style="color:#2e6b58">Disable property-alert emails</a> · <a href="mailto:info@love-live-myoko.com" style="color:#2e6b58">Contact our local team</a></p></td></tr></table></td></tr></table></body></html>`;
    const text = `${test ? 'ADMINISTRATOR TEST — ' : ''}Love Live Myoko — Property Finder\n\n${intro}\n\n` + properties.map(p => `Property in ${p.location}\n${p.price}\nSource: ${p.source}\nView Original Property Listing: ${p.url}`).join('\n\n')
        + `\n\nConfirm details, availability and conditions with the source.\nManage alerts: https://love-live-myoko.com/account/#property-alerts\nDisable emails: ${unsubscribeUrl}`;
    return { subject, html, text };
}
