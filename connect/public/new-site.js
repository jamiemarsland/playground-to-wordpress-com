(() => {
 const root=document.getElementById('new-site');if(!root)return;
 const status=document.getElementById('new-status'),button=document.getElementById('create-button');
 let channel=null,running=false;
 function say(message){status.textContent=message;if(channel)window.opener?.postMessage({type:'pgwpc:status',channel,message},'https://playground.wordpress.net');}
 window.addEventListener('message',event=>{
  if(event.origin!=='https://playground.wordpress.net'||event.source!==window.opener||event.data?.type!=='pgwpc:hello')return;
  if(channel&&channel!==event.data.channel)return;
  channel=event.data.channel;
  if(!running){button.disabled=false;say('Ready. Choose a suggested name, then create your new site.');}
 });
 async function api(action,body){
  const res=await fetch('/api/new-site?action='+action,{method:'POST',headers:{'x-pgwpc-watch':root.dataset.proof,'Content-Type':'application/json'},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(30000)});
  const data=await res.json().catch(()=>{throw new Error('The connection service did not return a valid response. Please retry.');});if(!res.ok)throw new Error(data.error||'Site check failed.');return data;
 }
 document.getElementById('create').addEventListener('submit',async event=>{
  event.preventDefault();if(running||!channel)return;
  running=true;button.disabled=true;
  // A real loading page receives progress even if preparation fails.
  const handoffId=crypto.randomUUID();
  const handoff=new BroadcastChannel('pgwpc-hosting-'+handoffId);
  let handoffState={type:'waiting'};
  handoff.onmessage=event=>{if(event.data?.type==='ready')handoff.postMessage(handoffState);};
  const loadingUrl='/hosting.html#'+handoffId;
  window.open(loadingUrl,'_blank','noopener,noreferrer');
  const fallback=document.createElement('a');fallback.href=loadingUrl;fallback.target='_blank';fallback.rel='noopener noreferrer';fallback.textContent='Open hosting setup if the tab did not open';document.getElementById('signup-link').replaceChildren(fallback);
  say('Recording your existing sites…');
  try{
   const data=await api('prepare',{name:document.getElementById('address').value.trim().toLowerCase()});
   const a=document.createElement('a');a.href=data.signup;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open hosting setup';document.getElementById('signup-link').replaceChildren(a);
   handoffState={type:'go',url:data.signup};handoff.postMessage(handoffState);
   say('Create your site using the same account. Keep these windows open. We will detect its assigned address and transfer when paid hosting is ready.');
   for(let n=0;n<240;n++){
    await new Promise(resolve=>setTimeout(resolve,5000));
    let result=await api('poll');
    if(result.choices){
     say(result.message);
     const box=document.createElement('div');
     document.getElementById('signup-link').replaceChildren(box);
     const selected=await new Promise(resolve=>{
      for(const choice of result.choices){
       const pick=document.createElement('button');pick.type='button';pick.textContent='Use '+choice.url;
       pick.addEventListener('click',()=>{box.replaceChildren();resolve(choice.id);},{once:true});box.append(pick);
      }
     });
     result=await api('poll',{siteId:selected});
    }
    if(result.message)say(result.message);
    if(result.ready){
     sessionStorage.setItem('pgwpc-auto',JSON.stringify({channel,blog:result.blog,exp:Date.now()+120000}));
     location.replace('/?view=transfer');return;
    }
   }
   throw new Error('We could not find a new site with paid hosting within 20 minutes. No transfer was started. You can connect the site using the existing-site option.');
  }catch(error){handoffState={type:'error',message:error.message};handoff.postMessage(handoffState);say(error.message);running=false;button.disabled=false;}
 });
})();
