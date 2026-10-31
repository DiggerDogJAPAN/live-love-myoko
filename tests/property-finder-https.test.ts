import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleAuthRequest } from '../server/auth/api';
import { loadAccountSnapshot } from '../server/auth/account-rpc';
import { FinderHttpError } from '../server/property-finder/errors';
import { fetchFinderProperties } from '../src/lib/property-finder/client';
import { searchProperties, initialFilters } from '../src/lib/property-finder/search';

const origin='https://love-live-myoko.com', project='fgdoqsepihlzfqlqymet';
const env={FINDER_AUTH_ENABLED:'enabled',FINDER_SUPABASE_PROJECT_REF:project,FINDER_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_only',FINDER_AUTH_COOKIE_SECRET:'synthetic-signing-secret-never-used-in-production-0123456789',FINDER_CUSTOMER_ACCESS:'disabled'};
const user='00000000-0000-4000-8000-000000000001', sid='00000000-0000-4000-8000-000000000002';
const identity={kind:'customer' as const,userId:user,sessionId:sid,tokenExpiresAt:Date.now()+3600000};
const snapshot={schemaVersion:2,userId:user,sessionId:sid,sessionActive:true,sessionValidUntil:null,accountActive:true,role:'administrator',subscriptionActive:false,tier:null,status:'inactive',paymentStatus:'unpaid',accessStartsAt:null,paidThrough:null,revokedAt:null,finderAccess:true,savedPropertiesAccess:true,paidAccessEnabled:false,membershipActive:false};
const providerUser={id:user,email:'synthetic@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',user_metadata:{full_name:'Synthetic',role:'administrator'}};
const request=()=>new Request(origin+'/api/auth/session',{headers:{Cookie:'__Host-llm-access=synthetic-existing-token'}});

test('Account session uses the existing JWT for Supabase account RPC and Auth user HTTPS; administrator needs no membership or SQL connection',async()=>{
    const urls:string[]=[];
    const response=await handleAuthRequest(request(),env,{verify:async()=>identity,transport:async(input,init)=>{
        const url=String(input);urls.push(url); assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-existing-token');
        assert.equal(new Headers(init?.headers).get('apikey'),env.FINDER_SUPABASE_PUBLISHABLE_KEY); assert.equal(init?.redirect,'manual');assert.equal(init?.cache,'no-store');
        if(url.endsWith('/rest/v1/rpc/finder_account')){assert.equal(init?.body,'{}');return Response.json(snapshot);}
        assert(url.endsWith('/auth/v1/user'));return Response.json(providerUser);
    }});
    assert.equal(response.status,200);const account=await response.json();assert.equal(account.role,'administrator');assert.equal(account.finderAccess,true);assert.equal(account.savedPropertiesAccess,true);assert.equal(account.membership.tier,null);assert.equal(account.paidAccessEnabled,false);
    assert.equal(urls.length,2);assert.match(response.headers.get('Cache-Control')!,/private, no-store/);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
});
test('PostgreSQL account permissions stay authoritative; user metadata cannot promote an unpaid account',async()=>{
    const response=await handleAuthRequest(request(),env,{verify:async()=>identity,transport:async input=>Response.json(String(input).endsWith('/finder_account')?{...snapshot,role:'customer',finderAccess:false,savedPropertiesAccess:false}:providerUser)});
    assert.equal(response.status,200);const account=await response.json();assert.equal(account.role,'customer');assert.equal(account.finderAccess,false);assert.equal(account.savedPropertiesAccess,false);
});
test('Missing, forged or Access-only credentials cannot reach the account RPC',async()=>{
    let reads=0;
    for(const headers of [{},{'Cf-Access-Jwt-Assertion':'forged','Cookie':'CF_Authorization=forged'},{Authorization:'Bearer forged'}] as Record<string,string>[]){
        const response=await handleAuthRequest(new Request(origin+'/api/auth/session',{headers}),env,{verify:async()=>{throw new FinderHttpError(401,'authentication_required');},transport:async()=>{reads++;return Response.json(snapshot);}});
        assert.equal(response.status,401);
    }
    assert.equal(reads,0);
});
test('Account RPC failures log only stage, upstream status and sanitized SQLSTATE; never upstream messages, tokens or private rows',async t=>{
    const logs:string[]=[];t.mock.method(console,'warn',(line:string)=>logs.push(line));
    const response=await handleAuthRequest(request(),env,{verify:async()=>identity,transport:async()=>Response.json({code:'53300',message:'postgresql://private-password private-account@invalid'},{status:503})});
    assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:'authentication_unavailable'});
    const event=JSON.parse(logs[0]);assert.equal(event.stage,'account_rpc');assert.equal(event.databaseCode,'53300');assert.equal(event.upstreamStatus,503);assert(!/private-password|synthetic-existing-token|private-account/.test(logs.join('')));
});
test('Account RPC rejects mismatched subjects, missing permission fields, malformed responses, redirects and provider outages',async()=>{
    for(const value of [{...snapshot,userId:sid},{...snapshot,finderAccess:undefined},[],null]){
        await assert.rejects(loadAccountSnapshot(env,identity,'synthetic-existing-token',async()=>Response.json(value)),e=>(e as FinderHttpError).code==='authentication_unavailable');
    }
    await assert.rejects(loadAccountSnapshot(env,identity,'synthetic-existing-token',async()=>new Response(null,{status:302,headers:{Location:'https://attacker.invalid'}})));
    await assert.rejects(loadAccountSnapshot(env,identity,'synthetic-existing-token',async()=>{throw new Error('private network diagnostic');}),e=>(e as FinderHttpError).code==='authentication_unavailable');
});
const row={listing_id:user,title:'Synthetic',asking_price_jpy:1500000,location_en:'Taguchi',location_ja:'田口',location_display:'Taguchi',publication_status:'active',availability_status:'active',source_attribution:'Source: Myoko Akiya Bank',original_pdf_url:'https://www.city.myoko.niigata.jp/property/123.pdf',thumbnail_url:'https://www.city.myoko.niigata.jp/fs/123/property.jpg',location_needs_review:false,region_en:'Myoko Kogen',region_ja:'妙高高原',municipality:'Myoko',property_type:'house',transaction_type:'sale',purchase_conditions_ja:null};
const bridge={accessToken:'synthetic-existing-token',supabaseOrigin:`https://${project}.supabase.co`,publishableKey:env.FINDER_SUPABASE_PUBLISHABLE_KEY};
test('Finder calls direct authenticated RPC and preserves listing projection, images, labels, price filters, sorting and source links',async t=>{
    const calls:string[]=[];
    t.mock.method(globalThis,'fetch',async(input:string,init:RequestInit)=>{
        const url=String(input);calls.push(url);
        if(url==='/api/auth/supabase-access')return Response.json(bridge);
        assert.equal(url,bridge.supabaseOrigin+'/rest/v1/rpc/finder_properties');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');assert.equal(init.body,'{}');
        assert.equal(new Headers(init.headers).get('Authorization'),'Bearer '+bridge.accessToken);
        return Response.json({rows:[row,{...row,listing_id:sid,asking_price_jpy:2500000}],count:2});
    });
    const properties=await fetchFinderProperties();assert.equal(properties.length,2);assert.equal(properties[0].title,'Property in Myoko Kogen (Taguchi)');assert.equal(properties[0].thumbnail?.src,row.thumbnail_url);assert.equal(properties[0].originalListingUrl,row.original_pdf_url);
    assert.equal(searchProperties(properties,{...initialFilters,maxPrice:'2000000'}).length,1);assert.equal(searchProperties(properties,{...initialFilters,area:'Myoko Kogen (Taguchi)'}).length,2);
    assert.equal(searchProperties(properties,{...initialFilters,sort:'price-desc'})[0].askingPriceJpy,2500000);assert(calls.every(url=>!url.includes('/api/property-finder')));
});
test('Finder transport fails closed on denied, malformed, oversized and mismatched-count responses',async t=>{
    for(const value of [{rows:[row],count:2},{rows:new Array(501).fill(row),count:501},{}]){
        t.mock.method(globalThis,'fetch',async(input:string)=>Response.json(String(input).startsWith('/api/')?bridge:value));await assert.rejects(fetchFinderProperties());
    }
    t.mock.method(globalThis,'fetch',async(input:string)=>String(input).startsWith('/api/')?Response.json(bridge):Response.json({message:'active_membership_required'},{status:403}));
    await assert.rejects(fetchFinderProperties(),/active_membership_required/);
});
