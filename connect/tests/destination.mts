import assert from 'node:assert/strict';
import handler,{seal} from '../netlify/functions/wordpress.mts';
globalThis.Netlify={env:{get:()=> 'test'.repeat(16)}};
const base='https://playground-wpcom-connect.netlify.app';
const cookie='__Host-pgwpc-session='+seal({token:'test-token',blog:'https://example.wordpress.com',siteId:123,exp:Date.now()+60000});
for(const headers of [{},{cookie}]){
 const html=await (await handler(new Request(base,{headers}))).text();
 assert.match(html,/Create a new site/);assert.match(html,/Use an existing site/);
 assert.doesNotMatch(html,/id="transfer"/);
 if(headers.cookie)assert.match(html,/Continue with this site/);
}
const guide=await (await handler(new Request(base+'/?view=new',{headers:{cookie}}))).text();
assert.match(guide,/https:\/\/wordpress.com\/start\//);
assert.match(guide,/target="_blank" rel="noopener noreferrer"/);
assert.match(guide,/Free content-only transfer is not available/);
assert.match(guide,/I’ve created my site/);
const start=await handler(new Request(base+'/oauth/wordpress/start'));
const target=new URL(start.headers.get('location'));
assert.equal(target.hostname,'public-api.wordpress.com');
const state=target.searchParams.get('state');
const stateCookie=start.headers.get('set-cookie').split(';')[0];
globalThis.fetch=async()=>Response.json({access_token:'new-token',blog_id:456,blog_url:'https://new.wordpress.com'});
const callback=await handler(new Request(base+'/oauth/wordpress/callback?code=test&state='+state,{headers:{cookie:stateCookie}}));
assert.equal(callback.headers.get('location'),'/?view=transfer');
const transfer=await (await handler(new Request(base+'/?view=transfer',{headers:{cookie}}))).text();
assert.match(transfer,/id="transfer"/);assert.match(transfer,/src="\/transfer.js"/);
console.log('PASS: destination choices, guided creation, session continuation and OAuth return to transfer.');
