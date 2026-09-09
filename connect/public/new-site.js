(() => {
 const root=document.getElementById('new-site');if(!root)return;
 const status=document.getElementById('new-status'),button=document.getElementById('create-button');
 let channel=null,running=false;
 function say(message){status.textContent=message;if(channel)window.opener?.postMessage({type:'pgwpc:status',channel,message},'https://playground.wordpress.net');}
 window.addEventListener('message',event=>{
  if(event.origin!=='https://playground.wordpress.net'||event.source!==window.opener||event.data?.type!=='pgwpc:hello')return;
  if(channel&&channel!==event.data.channel)return;
  channel=event.data.channel;
  if(!running){button.disabled=false;say('Ready. Choose your address, then create that same address in hosting setup.');}
 });
 async function api(action,body){
  const res=await fetch('/api/new-site?action='+action,{method:'POST',headers:{'x-pgwpc-watch':root.dataset.proof,'Content-Type':'application/json'},body:JSON.stringify(body||{})});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Site check failed.');return data;
 }
 document.getElementById('create').addEventListener('submit',async event=>{
  event.preventDefault();if(running||!channel)return;
  running=true;button.disabled=true;
  // Open during the user gesture. The signup tab is isolated from Playground.
  const signup=window.open('about:blank','_blank');
  if(signup)signup.opener=null;
  try{
   const data=await api('prepare',{name:document.getElementById('address').value.trim().toLowerCase()});
   const a=document.createElement('a');a.href=data.signup;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open hosting setup';document.getElementById('signup-link').replaceChildren(a);
   if(signup)signup.location.href=data.signup;
   say('Create '+data.expected+' using the same account. Keep these windows open. We will transfer automatically once its paid hosting is ready.');
   for(let n=0;n<240;n++){
    await new Promise(resolve=>setTimeout(resolve,5000));
    const result=await api('poll');
    if(result.ready){
     sessionStorage.setItem('pgwpc-auto',JSON.stringify({channel,blog:result.blog,exp:Date.now()+120000}));
     location.replace('/?view=transfer');return;
    }
   }
   throw new Error('We could not find the new address with paid hosting within 20 minutes. No transfer was started. If you chose a different address, use the existing-site option.');
  }catch(error){say(error.message);running=false;button.disabled=false;}
 });
})();
