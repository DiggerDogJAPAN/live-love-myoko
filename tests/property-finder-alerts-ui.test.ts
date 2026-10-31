import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, test } from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AccountDetails } from '../src/lib/auth/types';
let Section: ComponentType<{account:AccountDetails}>, validate: typeof import('../src/components/property-alerts/PropertyAlerts')['validatePreferences'];
before(async()=>{const require=createRequire(`${process.cwd()}/package.json`);require.extensions['.css']=m=>{m.exports={};};const alertsModule=await import('../src/components/property-alerts/PropertyAlerts');Section=alertsModule.default;validate=alertsModule.validatePreferences;});
const account:AccountDetails={user:{id:'synthetic',email:'private@example.invalid',name:'Private',verified:true},role:'customer',membership:{tier:'basic',status:'inactive',paidThrough:null,active:false},sessionExpiresAt:Date.now()+3600000,finderAccess:false,savedPropertiesAccess:false,paidAccessEnabled:false};
test('Basic/unpaid customers see only Premium explanation; administrators load their own preferences without leaking account details',()=>{
    for(const tier of [null,'basic','premium'] as const){const html=renderToStaticMarkup(createElement(Section,{account:{...account,membership:{...account.membership,tier}}}));assert(html.includes('Property Alerts are included with Premium membership.'));assert(!/<input|<form|Send Test Email|checkout|private@example/.test(html));}
    const html=renderToStaticMarkup(createElement(Section,{account:{...account,role:'administrator',savedPropertiesAccess:true}}));assert(html.includes('Loading your alert preferences'));assert(html.includes('id="property-alerts"'));assert(!html.includes('private@example.invalid'));assert(!/immediate|frequency|<select/i.test(html));
});
test('Preferences use four stable area identifiers, persist server state and reject enabled empty or malformed selections',()=>{
    assert.deepEqual(validate({enabled:true,areas:['myoko','joetsu','shinano','iizuna'],deliveryNeedsReview:false}).areas,['myoko','joetsu','shinano','iizuna']);
    assert.equal(validate({enabled:false,areas:[],deliveryNeedsReview:false}).enabled,false);
    for(const data of [{enabled:true,areas:[],deliveryNeedsReview:false},{enabled:true,areas:['myoko','myoko'],deliveryNeedsReview:false},{enabled:true,areas:['Myoko Kogen'],deliveryNeedsReview:false},{enabled:'true',areas:['myoko'],deliveryNeedsReview:false}])assert.throws(()=>validate(data));
});
