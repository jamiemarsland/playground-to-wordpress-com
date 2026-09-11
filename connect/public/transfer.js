(() => {
  const button=document.getElementById('transfer'), status=document.getElementById('status'),progress=document.getElementById('progress');
  if(!button)return;
  let source=null,sourceOrigin=null,channel=null,csrf=null,busy=false,waiting=false;
  const say=message=>{status.textContent=message;if(source)source.postMessage({type:'pgwpc:status',channel,message},sourceOrigin);};
  let automatic=null;
  try { automatic=JSON.parse(sessionStorage.getItem('pgwpc-auto')); } catch {}
  function maybeStart() {
    if(!automatic || !source || !csrf || busy)return;
    const intent=automatic;automatic=null;sessionStorage.removeItem('pgwpc-auto');
    if(intent.exp>Date.now() && intent.channel===channel && intent.blog===document.getElementById('destination')?.textContent) button.click();
  }
  const allowed=value=>value==='https://playground.wordpress.net';
  window.addEventListener('message',async event=>{
    if(!allowed(event.origin)||event.source!==window.opener)return;
    const data=event.data;
    if(data?.type==='pgwpc:hello'&&!busy) {
      if(channel&&channel!==data.channel)return;
      source=event.source;sourceOrigin=event.origin;channel=data.channel;
      document.getElementById('source').textContent='Source: '+String(data.title||'Your Playground').slice(0,200);
      if(csrf)button.disabled=false;
      maybeStart();
      return;
    }
    if(event.source!==source||data?.channel!==channel)return;
    if(data.type==='pgwpc:error'){waiting=false;busy=false;say(String(data.message));return;}
    if(data.type==='pgwpc:archive'&&waiting&&data.file instanceof Blob){waiting=false;await upload(data.file);}
  });
  async function api(action,id,body,extra='') {
    const res=await fetch('/api/transfer?action='+action+(id?'&id='+encodeURIComponent(id):'')+extra,{method:'POST',headers:{'x-pgwpc-csrf':csrf},body});
    const data=await res.json();if(!res.ok||data.error)throw new Error(data.error||'Transfer request failed.');return data;
  }
  // the end of the journey deserves more than a sentence: show the two doors
  // anyone wants next, and take away the button that would do it all again
  function finish() {
    const done=document.getElementById('done');
    if(done)done.hidden=false;
    button.hidden=true;
    const review=document.getElementById('review');
    if(review)review.parentElement.hidden=true;
    if(done&&done.scrollIntoView)done.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function watch(id) {
    for(let n=0;n<180;n++) {
      const job=await api('advance',id);
      if(job.complete){progress.hidden=true;say('Your site has moved to WordPress.com.');finish();return;}
      if(job.failed||['failed','needs-review'].includes(job.phase))throw new Error(job.message||'WordPress.com stopped this import. Open its importer to review the result.');
      if(!job.importId)throw new Error('The upload result is not confirmed. Check the import on WordPress.com before starting another transfer.');
      say(job.state==='uploadProcessing'?'WordPress.com is processing the archive…':'WordPress.com is importing your site…');
      await new Promise(resolve=>setTimeout(resolve,5000));
    }
    say('The import is still running. Use “Check import on WordPress.com” to follow it. Do not start another transfer.');
  }
  async function upload(file) {
    try {
      say('Preparing secure upload…');const job=await api('prepare',null,JSON.stringify({size:file.size}));
      progress.hidden=false;
      for(let i=0;i<job.chunks;i++) {
        await api('chunk',job.id,file.slice(i*job.chunkSize,(i+1)*job.chunkSize),'&index='+i);
        progress.value=Math.round((i+1)/job.chunks*100);say('Uploading your archive: '+progress.value+'%');
      }
      progress.removeAttribute('value');say('Sending the archive to WordPress.com…');
      let result;
      try{result=await api('finish',job.id);}catch(error){
        // Never repeat a possibly accepted upload after a network failure.
        result=await api('status',job.id);
        if(!result.importId)throw new Error('The upload result is uncertain. Check WordPress.com before trying again.');
      }
      if(['failed','needs-review'].includes(result.phase))throw new Error(result.message||'The transfer needs review on WordPress.com.');
      await watch(job.id);
    }catch(error){progress.hidden=true;say(error.message);}
  }
  button.addEventListener('click',()=>{
    if(!source||!csrf||busy)return;
    busy=true;waiting=true;button.disabled=true;say('Preparing your Playground archive…');
    source.postMessage({type:'pgwpc:export',channel},sourceOrigin);
    setTimeout(()=>{if(waiting){waiting=false;say('The archive has not arrived. Keep Playground open and check its export status. Reopen this connection window to try again.');}},180000);
  });
  fetch('/api/connection').then(async res=>{
    const data=await res.json();if(!res.ok||data.error)throw new Error(data.error||'Connection check failed.');
    csrf=data.csrf;
    say(source?'Ready. Check the destination above, then click Move my site here.':'Return to Playground and click Connect and move my site to link this window.');
    button.disabled=!source;
    maybeStart();
  }).catch(error=>say(error.message));
})();
