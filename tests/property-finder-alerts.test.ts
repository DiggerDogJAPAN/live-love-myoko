import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { handleAlertsRequest, deliverJob, alertsConfigured, type AlertsEnv } from '../server/property-alerts/api';
import { propertyAlertEmail, alertProperties } from '../server/property-alerts/email';
import { FinderHttpError } from '../server/property-finder/errors';
import type { AccountSnapshot } from '../server/auth/account-rpc';
import type { CustomerViewRow } from '../src/lib/property-finder/property-data';
const origin='https://love-live-myoko.com', user='00000000-0000-4000-8000-000000000001', session='00000000-0000-4000-8000-000000000002';
const env: AlertsEnv={ FINDER_AUTH_ENABLED:'enabled',FINDER_AUTH_SITE_ORIGIN:origin,FINDER_SUPABASE_PROJECT_REF:'fgdoqsepihlzfqlqymet',
    FINDER_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_local_only',FINDER_AUTH_COOKIE_SECRET:'synthetic-local-cookie-secret-never-production-1234567890',
    FINDER_ALERTS_ENABLED:'enabled',FINDER_ALERTS_FROM:'Love Live Myoko <noreply@love-live-myoko.com>',RESEND_API_KEY:'re_synthetic_local_only',
    FINDER_ALERTS_SUPABASE_SECRET_KEY:'sb_secret_synthetic_local_only',FINDER_ALERTS_CRON_SECRET:'synthetic-local-cron-secret-never-production-1234567890' };
const snapshot: AccountSnapshot={schemaVersion:2,userId:user,sessionId:session,sessionActive:true,sessionValidUntil:null,accountActive:true,
    role:'administrator',tier:null,status:'inactive',paymentStatus:'unpaid',accessStartsAt:null,paidThrough:null,revokedAt:null,subscriptionActive:false,
    finderAccess:true,savedPropertiesAccess:true,paidAccessEnabled:false,membershipActive:false};
const identity={kind:'customer' as const,userId:user,sessionId:session,tokenExpiresAt:Date.now()+3600000};
const providerUser={id:user,email:'synthetic@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'};
const row: CustomerViewRow={listing_id:'00000000-0000-4000-8000-000000000101',municipality:'Myoko',property_type:'house',transaction_type:'sale',purchase_conditions_ja:null,
    title:'Synthetic only',asking_price_jpy:1500000,location_en:'Taguchi',location_display:'Taguchi',location_ja:'田口',publication_status:'active',availability_status:'active',
    source_attribution:'Source: Myoko Akiya Bank',original_pdf_url:'https://www.city.myoko.niigata.jp/property/123.pdf',thumbnail_url:null,location_needs_review:false,region_en:'Myoko Kogen',region_ja:'妙高高原'};
const job={id:'00000000-0000-4000-8000-000000000201',lease:'00000000-0000-4000-8000-000000000202',userId:user,recipient:providerUser.email,createdAt:new Date().toISOString(),isTest:true,properties:[row]};
const request=(action:string,method='POST',body:object={},headers:Record<string,string>={})=>new Request(origin+'/api/property-alerts/'+action,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Host-llm-access=synthetic-session-only',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
const verify=async()=>identity;
const deps=(transport:typeof fetch, patch:Partial<AccountSnapshot>={})=>({transport,verify,snapshot:async()=>({...snapshot,...patch})});

test('Email includes real projection, yen, original Japanese source links, branding, plain text and safe escaped content',()=>{
    const props=alertProperties([row]);assert.equal(props.length,1);assert.equal(props[0].location,'Myoko Kogen (Taguchi)');
    const mail=propertyAlertEmail(props,origin+'/api/property-alerts/unsubscribe?token=synthetic',true);
    for(const part of ['[TEST]','Love Live Myoko'])assert(mail.subject.includes(part));
    for(const part of ['¥1,500,000','Myoko Kogen (Taguchi)','View Original Property Listing','https://www.city.myoko.niigata.jp/property/123.pdf','Manage Property Alerts','Disable property-alert emails'])assert(mail.html.includes(part));
    assert(mail.html.includes('role="presentation"'));assert(mail.html.includes('@media'));assert(mail.text.includes('https://www.city.myoko.niigata.jp/property/123.pdf'));
    assert(!mail.html.includes('/property/00000000'));
    assert(propertyAlertEmail([{...props[0],source:'<script>unsafe</script>'}],origin).html.includes('&lt;script&gt;'));
    assert.throws(()=>propertyAlertEmail([],origin),/no_safe_properties/);
    for(const original_pdf_url of ['javascript:alert(1)','https://attacker.invalid/property/1','https://www.city.myoko.niigata.jp/','https://user:password@www.city.myoko.niigata.jp/p/1','http://www.city.myoko.niigata.jp/p/1'])assert.equal(alertProperties([{...row,original_pdf_url}]).length,0);
});
test('Anonymous, Basic, unpaid and normal Premium users cannot trigger administrator test emails or arbitrary recipients',async()=>{
    const transport:typeof fetch=async input=>{assert(String(input).endsWith('/auth/v1/user'));return Response.json(providerUser);};
    const anonymous=await handleAlertsRequest(request('test'),env,{verify:async()=>{throw new FinderHttpError(401,'authentication_required');},transport});assert.equal(anonymous.status,401);
    for(const patch of [{role:'customer',savedPropertiesAccess:false},{role:'customer',savedPropertiesAccess:true}] as Partial<AccountSnapshot>[])assert.equal((await handleAlertsRequest(request('test'),env,deps(transport,patch))).status,403);
    assert.equal((await handleAlertsRequest(request('test','POST',{email:'other@example.invalid'}),env,deps(transport))).status,400);
    assert.equal((await handleAlertsRequest(request('test','POST',{}, {'Origin':'https://attacker.invalid'}),env,deps(transport))).status,403);
    assert.equal((await handleAlertsRequest(request('status','GET'),{...env,RESEND_API_KEY:undefined},deps(transport))).status,200);
    assert.equal(alertsConfigured({...env,RESEND_API_KEY:undefined}),false);
    assert.equal((await handleAlertsRequest(request('test'),{...env,RESEND_API_KEY:undefined},deps(transport))).status,503);
});
test('Test email uses the same server Resend infrastructure, own verified recipient, secret-only HTTPS and signed unsubscribe',async()=>{
    const providerBodies:Record<string,unknown>[]=[];let unsubscribes=0;
    const transport:typeof fetch=async(input,init)=>{
        const url=String(input);if(url.endsWith('/auth/v1/user'))return Response.json(providerUser);
        if(url==='https://api.resend.com/emails'){
            assert.equal(init?.redirect,'manual');assert.equal(new Headers(init?.headers).get('Idempotency-Key'),'finder-property-alert/'+job.id);
            const body=JSON.parse(String(init?.body));providerBodies.push(body);assert.deepEqual(body.to,[providerUser.email]);return Response.json({id:'provider-message-id'});
        }
        assert(url.startsWith('https://fgdoqsepihlzfqlqymet.supabase.co/rest/v1/rpc/'));
        assert.equal(new Headers(init?.headers).get('apikey'),env.FINDER_ALERTS_SUPABASE_SECRET_KEY);assert.equal(new Headers(init?.headers).get('Authorization'),null);
        if(url.endsWith('/finder_alert_claim')){assert.deepEqual(JSON.parse(String(init?.body)),{p_test_user:user});return Response.json(job);}
        if(url.endsWith('/finder_alert_complete'))assert.deepEqual(JSON.parse(String(init?.body)).p_listing_ids,[row.listing_id]);
        if(url.endsWith('/finder_alert_unsubscribe'))unsubscribes++;
        return Response.json(true);
    };
    assert.equal((await handleAlertsRequest(request('test'),env,deps(transport))).status,200);
    const unsubscribe=(providerBodies[0].headers as Record<string,string>)['List-Unsubscribe'].slice(1,-1);
    const confirm=await handleAlertsRequest(new Request(unsubscribe),env,{transport});assert.equal(confirm.status,200);assert.equal(unsubscribes,0,'GET/scanner cannot disable alerts');
    const disabled=await handleAlertsRequest(new Request(unsubscribe,{method:'POST'}),env,{transport});assert.equal(disabled.status,200);assert.equal(unsubscribes,1);
    assert.equal((await handleAlertsRequest(new Request(unsubscribe+'x',{method:'POST'}),env,{transport})).status,400);
    await deliverJob(job,env,transport);assert.deepEqual(providerBodies[0],providerBodies[1],'retry keeps the identical payload and provider key');
});
test('Cron endpoint rejects missing/forged credentials and any user-supplied payload, and never sends empty emails',async()=>{
    let calls=0;const transport:typeof fetch=async input=>{calls++;return Response.json(String(input).endsWith('/finder_alert_pending')?false:null);};
    for(const headers of [{},{Authorization:'Bearer forged'}] as Record<string,string>[])assert.equal((await handleAlertsRequest(request('process','POST',{},headers),env,{transport})).status,401);
    assert.equal(calls,0);
    const headers={Authorization:'Bearer '+env.FINDER_ALERTS_CRON_SECRET};
    assert.equal((await handleAlertsRequest(request('process','POST',{userId:user},headers),env,{transport})).status,400);
    const response=await handleAlertsRequest(request('process','POST',{},headers),env,{transport});assert.equal(response.status,200);assert.deepEqual(await response.json(),{processed:0,sent:0,more:false,retryAfterSeconds:0});
});
test('Ambiguous provider failures retain pending delivery; acknowledgement failures can retry safely and logs exclude PII/secrets',async t=>{
    const fails:Record<string,unknown>[]=[];const logs:string[]=[];t.mock.method(console,'warn',(s:string)=>logs.push(s));
    const transport:typeof fetch=async(input,init)=>{
        const url=String(input);if(url.endsWith('/auth/v1/user'))return Response.json(providerUser);
        if(url.endsWith('/finder_alert_claim'))return Response.json(job);
        if(url.endsWith('/finder_alert_dispatch'))return Response.json(true);
        if(url.endsWith('/finder_alert_fail')){fails.push(JSON.parse(String(init?.body)));return Response.json(null);}
        throw Error('PRIVATE token or email must never be logged');
    };
    const response=await handleAlertsRequest(request('test'),env,deps(transport));assert.equal(response.status,503);
    assert.equal(fails[0].p_code,'provider_outcome_unknown');assert(!JSON.stringify(logs).includes('PRIVATE'));assert(!JSON.stringify(logs).includes(providerUser.email));assert(!JSON.stringify(logs).includes(env.RESEND_API_KEY!));
    const routes=JSON.parse(readFileSync('public/_routes.json','utf8'));assert(routes.include.includes('/api/property-alerts/*'));
    const workflow=readFileSync('.github/workflows/myoko-crawler.yml','utf8');assert(workflow.includes('needs: crawl'));assert(workflow.includes("needs.crawl.result == 'success'"));assert(workflow.includes("inputs.source == 'all'"));
});

test('Provider acceptance with a failed database acknowledgement retries the exact provider payload without losing pending properties',async()=>{
    const bodies:string[]=[];let acknowledgements=0;
    const transport:typeof fetch=async(input,init)=>{
        const url=String(input);
        if(url.endsWith('/finder_alert_dispatch'))return Response.json(true);
        if(url==='https://api.resend.com/emails'){bodies.push(String(init?.body));return Response.json({id:'stable-provider-id'});}
        if(url.endsWith('/finder_alert_complete')){acknowledgements++;return acknowledgements===1?Response.json({code:'53300',message:'PRIVATE DATABASE DETAILS'},{status:503}):Response.json(true);}
        throw Error('Unexpected call');
    };
    await assert.rejects(deliverJob(job,env,transport),/alerts_unavailable/);
    assert.equal(await deliverJob(job,env,transport),true);assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);
});
test('Existing legacy service-role key can be reused server-side without creating a new Supabase key',async()=>{
    const legacy='eyJsynthetic_local_only.synthetic_payload.synthetic_signature';
    assert.equal(alertsConfigured({...env,FINDER_ALERTS_SUPABASE_SECRET_KEY:legacy}),true);
    const transport:typeof fetch=async(input,init)=>{assert.equal(new Headers(init?.headers).get('apikey'),legacy);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+legacy);return Response.json(String(input).endsWith('/finder_alert_pending')?false:null);};
    const r=await handleAlertsRequest(request('process','POST',{}, {Authorization:'Bearer '+env.FINDER_ALERTS_CRON_SECRET}),{...env,FINDER_ALERTS_SUPABASE_SECRET_KEY:legacy},{transport});assert.equal(r.status,200);
});

test('Missing operational flag or database migration fails closed and cannot contact Resend',async()=>{
    let workerCalls=0;
    const transport:typeof fetch=async input=>{const url=String(input);if(url.endsWith('/auth/v1/user'))return Response.json(providerUser);assert(url.endsWith('/finder_alert_claim'));workerCalls++;return Response.json({code:'PGRST202',message:'PRIVATE schema catalogue details'},{status:404});};
    assert.equal(alertsConfigured({...env,FINDER_ALERTS_ENABLED:undefined}),false);
    const disabled=await handleAlertsRequest(request('test'),{...env,FINDER_ALERTS_ENABLED:undefined},deps(transport));assert.equal(disabled.status,503);assert.equal(workerCalls,0);
    const missing=await handleAlertsRequest(request('test'),env,deps(transport));assert.equal(missing.status,503);assert.deepEqual(await missing.json(),{code:'alerts_unavailable'});assert.equal(workerCalls,1);
});
