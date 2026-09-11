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
      document.getElementById('source').textContent='Sending: '+String(data.title||'Your site').slice(0,200);
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
  // A browser slows timers right down in a tab nobody is looking at, and
  // people look away — at WordPress.com, mostly, to watch their site arrive.
  // So the wait ends early the moment the tab comes back, and the line keeps
  // a running clock, because an indeterminate bar and a fixed sentence look
  // identical to something that has died.
  function waitOrWake(ms) {
    return new Promise(resolve => {
      let done=false;
      const finish=()=>{ if(done)return; done=true; clearTimeout(timer); document.removeEventListener('visibilitychange',wake); resolve(); };
      const wake=()=>{ if(!document.hidden) finish(); };
      const timer=setTimeout(finish,ms);
      document.addEventListener('visibilitychange',wake);
    });
  }
  const spell=ms=>{ const s=Math.round(ms/1000); return s<60?s+'s':Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s'; };
  async function watch(id) {
    const began=Date.now();
    for(let n=0;n<360;n++) {
      const job=await api('advance',id);
      if(job.complete){progress.hidden=true;say('Your site is live on WordPress.com.');finish();return;}
      if(job.failed||['failed','needs-review'].includes(job.phase))throw new Error(job.message||'WordPress.com stopped this import. Open its importer to review the result.');
      if(!job.importId)throw new Error('The upload result is not confirmed. Check the import on WordPress.com before starting another transfer.');
      const doing=job.state==='uploadProcessing'?'WordPress.com is unpacking it':'WordPress.com is setting your site up';
      say(doing+'… '+spell(Date.now()-began)+'. You can watch it on WordPress.com; this keeps checking either way.');
      await waitOrWake(5000);
    }
    progress.hidden=true;
    say('This is taking longer than expected. Open “See how it is going on WordPress.com” to check — your site may well be there. Do not send it again.');
  }
  async function upload(file) {
    try {
      say('Getting ready…');const job=await api('prepare',null,JSON.stringify({size:file.size}));
      progress.hidden=false;
      for(let i=0;i<job.chunks;i++) {
        await api('chunk',job.id,file.slice(i*job.chunkSize,(i+1)*job.chunkSize),'&index='+i);
        progress.value=Math.round((i+1)/job.chunks*100);say('Sending your site: '+progress.value+'%');
      }
      progress.removeAttribute('value');say('Handing it to WordPress.com…');
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
    if(busy)return;
    if(!source){say('This window is not linked to your site yet. Go back to it, open Move to WordPress.com and click Connect and send my site.');return;}
    if(!csrf){say('Still getting ready — give it a moment and try again.');return;}
    busy=true;waiting=true;button.disabled=true;say('Packing your site up…');
    source.postMessage({type:'pgwpc:export',channel},sourceOrigin);
    setTimeout(()=>{if(waiting){waiting=false;say('Your site has not arrived. Keep its tab open, and start again from Move to WordPress.com.');}},180000);
  });
  fetch('/api/connection').then(async res=>{
    const data=await res.json();if(!res.ok||data.error)throw new Error(data.error||'Connection check failed.');
    csrf=data.csrf;
    say(source?'Ready. Check where it is going, then click Send my site here.':'Open this window from your site: go to Move to WordPress.com and click Connect and send my site.');
    button.disabled=!source;
    maybeStart();
  }).catch(error=>say(error.message));
})();
