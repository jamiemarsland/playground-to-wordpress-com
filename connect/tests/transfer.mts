import assert from 'node:assert/strict';
import { handleTransfer,preflight,csrf,CHUNK,encrypt,decrypt } from '../netlify/functions/_shared/transfer-core.mts';
import transfer from '../netlify/functions/transfer.mts';
import { seal } from '../netlify/functions/wordpress.mts';
globalThis.Netlify={env:{get:k=>k==='SESSION_SECRET'?'test'.repeat(16):undefined}};
const session={token:'private-token',siteId:123,blog:'https://test.wordpress.com',exp:Date.now()+3600000};
const other={...session,token:'different-user'};
class MemoryStore {
  data=new Map();
  async setJSON(k,v,o={}){if(o.onlyIfNew&&this.data.has(k))return{modified:false};this.data.set(k,structuredClone(v));return{modified:true};}
  async set(k,v,o={}){return this.setJSON(k,v,o);}
  async get(k){return this.data.get(k)??null;}
  async delete(k){this.data.delete(k);}
}
const store=new MemoryStore();let mode='empty',uploads=0,starts=0;
globalThis.fetch=async(url,opts)=>{
  assert.equal(opts.headers.Authorization,'Bearer private-token');
  if(url.endsWith('/sites/123'))return Response.json({name:'Test site',plan:{is_free:mode==='free'}});
  if(url.endsWith('/imports/new')){
    uploads++;assert.equal(opts.body.get('import').size,10);
    const order=JSON.parse(opts.body.get('importStatus'));assert.equal(order.type,'wordpress');assert.equal(order.siteId,123);
    mode='uploaded';return Response.json({importId:44,siteId:123,importStatus:'uploadSuccess',importerFileType:'playground',type:'wordpress'});
  }
  if(url.endsWith('/imports/44')){
    starts++;assert.equal(JSON.parse(opts.body.get('importStatus')).importStatus,'importing');
    mode='done';return Response.json({importId:44,siteId:123,importStatus:'importing',importerFileType:'playground'});
  }
  if(url.endsWith('/imports/'))return Response.json(mode==='empty'||mode==='free'?[]:{importId:44,importStatus:mode==='done'?'importSuccess':'uploadSuccess',importerFileType:'playground'});
  throw new Error('Unexpected API request '+url);
};
function req(action,id='',body=null,index='') {return new Request('https://playground-wpcom-connect.netlify.app/api/transfer?action='+action+'&id='+id+index,{method:'POST',body});}
let r=await transfer(req('prepare','',JSON.stringify({size:10})),{});assert.equal(r.status,401);
r=await transfer(new Request('https://playground-wpcom-connect.netlify.app/api/transfer?action=prepare',{method:'POST',headers:{cookie:'__Host-pgwpc-session='+seal(session),origin:'https://evil.example','x-pgwpc-csrf':csrf(session)},body:'{}'}),{});assert.equal(r.status,403);
mode='free';await assert.rejects(()=>preflight(session),/free plan/);mode='empty';
let job=await (await handleTransfer(req('prepare','',JSON.stringify({size:10})),store,session)).json();
await assert.rejects(()=>handleTransfer(req('status',job.id),store,other),/another connection/);
const bytes=Buffer.from('PKabcdefgh');assert.deepEqual(decrypt(encrypt(bytes)),bytes);
r=await handleTransfer(req('chunk',job.id,bytes,'&index=1'),store,session);assert.equal(r.status,409);
r=await handleTransfer(req('chunk',job.id,bytes,'&index=0'),store,session);assert.equal(r.status,200);
await handleTransfer(req('chunk',job.id,Buffer.from('XXabcdefgh'),'&index=0'),store,session);
assert.deepEqual(decrypt(await store.get('chunks/'+job.id+'/0')),bytes);
const results=await Promise.all([handleTransfer(req('finish',job.id),store,session),handleTransfer(req('finish',job.id),store,session)]);
assert.equal(uploads,1);assert.equal(await store.get('chunks/'+job.id+'/0'),null);
await handleTransfer(req('advance',job.id),store,session);assert.equal(starts,1);
const done=await (await handleTransfer(req('advance',job.id),store,session)).json();assert.equal(done.complete,true);assert.equal(uploads,1);
await handleTransfer(req('finish',job.id),store,session);assert.equal(uploads,1);
console.log('PASS: auth, CSRF, free-plan rejection, ownership, encrypted chunks, immutable retries, duplicate finish, cleanup, API upload, import start and confirmed completion.');
mode='empty';
const missing=await (await handleTransfer(req('prepare','',JSON.stringify({size:10})),store,session)).json();
const failed=await (await handleTransfer(req('finish',missing.id),store,session)).json();assert.equal(failed.phase,'failed');assert.equal(uploads,1);
mode='empty';const uncertain=await (await handleTransfer(req('prepare','',JSON.stringify({size:10})),store,session)).json();
await handleTransfer(req('chunk',uncertain.id,bytes,'&index=0'),store,session);
const oldFetch=globalThis.fetch;globalThis.fetch=async(url,opts)=>{if(url.endsWith('/imports/new')){uploads++;throw new Error('Connection interrupted after request sent.');}return oldFetch(url,opts);};
const unknown=await (await handleTransfer(req('finish',uncertain.id),store,session)).json();assert.equal(unknown.phase,'needs-review');assert.equal(uploads,2);
await handleTransfer(req('finish',uncertain.id),store,session);assert.equal(uploads,2);assert.equal(await store.get('chunks/'+uncertain.id+'/0'),null);
console.log('PASS: missing chunks cannot submit; uncertain uploads are not retried and temporary chunks are removed.');
