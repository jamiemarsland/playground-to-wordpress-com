(() => {
 const title=document.getElementById('title'),message=document.getElementById('message');
 const fail=text=>{title.textContent='Hosting setup could not continue';message.textContent=text;};
 const id=location.hash.slice(1);
 if(!/^[a-f0-9-]{36}$/.test(id)||typeof BroadcastChannel==='undefined'){fail('Return to the transfer window and start again.');return;}
 const channel=new BroadcastChannel('pgwpc-hosting-'+id);
 const timer=setTimeout(()=>{fail('The connection check timed out. Return to the transfer window to see its status or retry.');channel.close();},35000);
 channel.onmessage=event=>{
  const data=event.data;
  if(data?.type==='error'){clearTimeout(timer);fail(data.message||'Return to the transfer window and try again.');channel.close();}
  if(data?.type==='go'){
   try{
    const target=new URL(data.url);
    if(target.origin!=='https://wordpress.com'||target.pathname!=='/setup/new-hosted-site'||target.username||target.password)throw new Error();
    clearTimeout(timer);channel.close();location.replace(target.href);
   }catch{clearTimeout(timer);fail('The hosting address was invalid. Return to the transfer window.');channel.close();}
  }
 };
 channel.postMessage({type:'ready'});
})();
