(() => {
  const button = document.getElementById('pgwpc-connect');
  if (!button) return;
  const status = document.getElementById('pgwpc-transfer-status');
  const host = 'https://playground-wpcom-connect.netlify.app';
  let popup, timer, channel, exporting = false;
  button.addEventListener('click', () => {
    channel = crypto.randomUUID();
    popup = window.open(host, 'pgwpc-transfer', 'width=760,height=850');
    if (!popup) { status.textContent = 'Allow pop-ups for Playground, then click Connect again.'; return; }
    clearInterval(timer);
    const started = Date.now();
    const hello = () => {
      if (popup.closed || Date.now() - started > 1800000) { clearInterval(timer); return; }
      popup.postMessage({type:'pgwpc:hello',channel,title:button.dataset.title},host);
    };
    timer = setInterval(hello,1000); hello();
    status.textContent = 'Choose your destination in the connection window. If sign-in opens a separate tab, return here and click Connect again.';
  });
  window.addEventListener('message', async event => {
    if (event.origin !== host || event.source !== popup || event.data?.channel !== channel) return;
    if (event.data.type === 'pgwpc:status') { status.textContent = String(event.data.message || '').slice(0,500); return; }
    if (event.data.type !== 'pgwpc:export' || exporting) return;
    exporting = true; status.textContent = 'Preparing your Playground archive…';
    try {
      const form = new FormData(); form.set('action','pgwpc_export'); form.set('_wpnonce',button.dataset.nonce);
      const response = await fetch(button.dataset.exportUrl,{method:'POST',body:form,credentials:'same-origin'});
      if (!response.ok || !response.headers.get('content-type')?.includes('application/zip')) throw new Error('The site export failed. Try Playground’s built-in export to check this site can be exported.');
      const file = await response.blob();
      if (file.size > 104857000) throw new Error('This archive exceeds the 100 MB import limit. Reduce its size before trying again.');
      const magic = new Uint8Array(await file.slice(0,4).arrayBuffer());
      if (magic[0] !== 80 || magic[1] !== 75) throw new Error('The export did not produce a valid ZIP.');
      popup.postMessage({type:'pgwpc:archive',channel,file},host);
      status.textContent = 'Archive prepared. Follow transfer progress in the connection window.';
    } catch(error) {
      status.textContent = error.message;
      popup.postMessage({type:'pgwpc:error',channel,message:error.message},host);
    } finally { exporting = false; }
  });
})();
