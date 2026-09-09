import assert from 'node:assert/strict';
import handler,{seal} from '../netlify/functions/wordpress.mts';
globalThis.Netlify={env:{get:()=> 'test'.repeat(16)}};
const base='https://playground-wpcom-connect.netlify.app';
const session={token:'test-token',siteId:123,exp:Date.now()+60000};
const cookie='__Host-pgwpc-session='+seal(session);
const page=await handler(new Request(base,{headers:{cookie}}));
const html=await page.text();
const token=html.match(/name="disconnect_token" value="([^"]+)"/)[1];
for(const origin of [null,'null',base]){
 const headers={cookie};if(origin!==null)headers.origin=origin;
 const r=await handler(new Request(base+'/disconnect',{method:'POST',headers,body:new URLSearchParams({disconnect_token:token})}));
 assert.equal(r.status,303);assert.match(r.headers.get('set-cookie'),/__Host-pgwpc-session=;.*Max-Age=0/);
}
for(const value of ['', 'invalid',seal({purpose:'disconnect',session:'other',exp:Date.now()+60000})]){
 const r=await handler(new Request(base+'/disconnect',{method:'POST',headers:{cookie,origin:base},body:new URLSearchParams({disconnect_token:value})}));assert.equal(r.status,403);
}
assert.equal((await handler(new Request(base+'/disconnect',{headers:{cookie}}))).status,403);
console.log('PASS: legitimate disconnect with missing/null/normal Origin; forged and cross-session forms rejected; GET rejected.');
