import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../public/hosting.js',import.meta.url),'utf8');
function run(){
 const elements={title:{},message:{}};
 let channel,redirect,timeout;
 class BroadcastChannel{constructor(){channel=this;}postMessage(data){assert.equal(data.type,'ready');}close(){}}
 vm.runInNewContext(code,{document:{getElementById:id=>elements[id]},location:{hash:'#12345678-1234-1234-1234-123456789abc',replace:url=>redirect=url},BroadcastChannel,URL,setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>{}});
 return {send:data=>channel.onmessage({data}),elements,get redirect(){return redirect;},timeout:()=>timeout()};
}
let r=run();r.send({type:'error',message:'You already have this site.'});assert.equal(r.elements.message.textContent,'You already have this site.');assert.equal(r.redirect,undefined);
r=run();r.send({type:'go',url:'https://wordpress.com/setup/new-hosted-site?new=example'});assert.match(r.redirect,/wordpress.com/);
r=run();r.send({type:'go',url:'https://example.org/'});assert.equal(r.redirect,undefined);assert.match(r.elements.message.textContent,/invalid/);
r=run();r.timeout();assert.match(r.elements.message.textContent,/timed out/);
console.log('PASS: hosting handoff shows preparation errors/timeouts, redirects on success and rejects foreign destinations.');
