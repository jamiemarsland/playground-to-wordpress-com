import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
import { getStore, getDeployStore } from '@netlify/blobs';
import { env, key, origin, cookies, unseal } from '../wordpress.mts';

export const CHUNK = 2 * 1024 * 1024;
export const MAX = 104857000;
export function storage(context) {
  return context.deploy.context === 'production'
    ? getStore({name:'pgwpc-transfers',consistency:'strong'})
    : getDeployStore({name:'pgwpc-transfers',consistency:'strong'});
}
export function owner(session) { return createHmac('sha256',key()).update(session.token + ':' + session.siteId).digest('hex'); }
export function csrf(session) { return createHmac('sha256',key()).update('csrf:' + session.token).digest('hex'); }
export function encrypt(bytes) {
  const iv=randomBytes(12), c=createCipheriv('aes-256-gcm',key(),iv);
  const data=Buffer.concat([c.update(bytes),c.final()]);
  return new Uint8Array(Buffer.concat([iv,c.getAuthTag(),data])).buffer;
}
export function decrypt(bytes) {
  const b=Buffer.from(bytes),c=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));
  c.setAuthTag(b.subarray(12,28)); return Buffer.concat([c.update(b.subarray(28)),c.final()]);
}
export function response(data,status=200) { return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}); }
export function authenticate(req) {
  const session=unseal(cookies(req)['__Host-pgwpc-session']);
  if (!session?.token || !/^\d+$/.test(String(session.siteId))) return null;
  return session;
}
export async function wp(session,suffix,body) {
  const res=await fetch(`https://public-api.wordpress.com/rest/v1.1/sites/${encodeURIComponent(session.siteId)}${suffix}`,{
    method:body?'POST':'GET',headers:{Authorization:`Bearer ${session.token}`},body,signal:AbortSignal.timeout(45000)
  });
  let data; try { data=await res.json(); } catch { throw new Error('WordPress.com returned an unreadable response. Check the import there before retrying.'); }
  if (!res.ok || data?.error) {
    const code=String(data?.error || res.status).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
    throw new Error(`WordPress.com rejected this request (${code}). Check the destination plan and app permissions. No automatic retry was made.`);
  }
  return data;
}
export function terminal(state) { return ['importSuccess','importFailure','importStopped','importExpired','disabled','importer-upload-failure'].includes(state); }
export async function preflight(session) {
  const site=await wp(session,'');
  if (site.plan?.is_free === true || site.plan?.product_slug === 'free_plan') throw new Error('This destination is on a free plan. WordPress.com requires a plugin-enabled plan for Playground ZIP imports. No archive has been sent.');
  const current=await wp(session,'/imports/');
  if (current?.importId && !terminal(current.importStatus)) throw new Error('This destination already has an unfinished import. Review it on WordPress.com before starting another.');
  return {name:site.name || session.blog,siteId:session.siteId,blog:session.blog};
}
export async function cleanChunks(store,job) {
  for(let start=0;start<job.chunks;start+=8) await Promise.all(Array.from({length:Math.min(8,job.chunks-start)},(_,n)=>store.delete(`chunks/${job.id}/${start+n}`)));
}
export async function loadJob(store,id,session) {
  if(!/^[a-f0-9]{32}$/.test(id || '')) throw new Error('Invalid transfer reference.');
  const job=await store.get('jobs/'+id,{type:'json'});
  if(!job || job.owner!==owner(session) || job.exp<Date.now()) throw new Error('This transfer has expired or belongs to another connection.');
  return job;
}
export function publicJob(job) {
  const remote=job.remote || {};
  return {id:job.id,phase:job.phase,state:remote.importStatus || null,importId:remote.importId || null,
    message:job.message || (remote.errorData?.description ? String(remote.errorData.description).slice(0,600) : ''),
    complete:remote.importStatus==='importSuccess',failed:['importFailure','importStopped','importExpired','disabled','importer-upload-failure'].includes(remote.importStatus)};
}
export async function handleTransfer(req,store,session) {
  const url=new URL(req.url),action=url.searchParams.get('action');
  if(action==='prepare') {
    const input=await req.json();
    if(!Number.isInteger(input.size)||input.size<4||input.size>MAX) return response({error:'Archive must be smaller than 100 MB.'},400);
    await preflight(session);
    const id=randomBytes(16).toString('hex');
    const job={id,owner:owner(session),siteId:session.siteId,size:input.size,chunks:Math.ceil(input.size/CHUNK),exp:Date.now()+3600000,phase:'uploading'};
    await store.setJSON('jobs/'+id,job);return response({id,chunkSize:CHUNK,chunks:job.chunks});
  }
  const job=await loadJob(store,url.searchParams.get('id'),session);
  if(action==='chunk') {
    const index=Number(url.searchParams.get('index'));
    if(job.phase!=='uploading'||!Number.isInteger(index)||index<0||index>=job.chunks) return response({error:'Invalid upload chunk.'},409);
    if(Number(req.headers.get('content-length'))>CHUNK) return response({error:'Chunk too large.'},413);
    const bytes=await req.arrayBuffer();
    const expected=Math.min(CHUNK,job.size-index*CHUNK);
    if(bytes.byteLength!==expected) return response({error:'Chunk length mismatch.'},400);
    // Chunks are immutable. A retry can never replace data being imported.
    await store.set(`chunks/${job.id}/${index}`,encrypt(Buffer.from(bytes)),{onlyIfNew:true});
    return response({received:index});
  }
  if(action==='finish') {
    if(job.phase!=='uploading') return response(publicJob(job));
    const lock=await store.setJSON('locks/'+job.id,{exp:job.exp},{onlyIfNew:true});
    if(!lock.modified) return response({error:'This transfer is already being submitted. Check its status; do not start another.'},409);
    job.phase='sending';await store.setJSON('jobs/'+job.id,job);
    let submitted=false;
    try {
      await preflight(session);
      const parts=[];
      for(let start=0;start<job.chunks;start+=8) {
        const group=await Promise.all(Array.from({length:Math.min(8,job.chunks-start)},async(_,n)=>{
          const value=await store.get(`chunks/${job.id}/${start+n}`,{type:'arrayBuffer'});
          if(!value) throw new Error('An archive chunk is missing. Start a fresh transfer.');return decrypt(value);
        }));parts.push(...group);
      }
      if(parts[0][0]!==80||parts[0][1]!==75) throw new Error('The archive is not a ZIP file.');
      const form=new FormData();
      form.set('import',new Blob(parts,{type:'application/zip'}),'wordpress-playground.zip');
      form.set('importStatus',JSON.stringify({importerId:'local-generated-id-'+job.id,siteId:session.siteId,type:'wordpress',importStatus:'importer-ready-for-upload'}));
      // Starting is separate, after the server has recognised a Playground archive.
      submitted=true;job.remote=await wp(session,'/imports/new',form);
      if(!job.remote?.importId) throw new Error('WordPress.com did not return an import reference. Check its importer before trying again.');
      job.phase='accepted';await store.setJSON('jobs/'+job.id,job);
    } catch(error) {
      job.phase=submitted?'needs-review':'failed';job.message=error.message;
      await store.setJSON('jobs/'+job.id,job);
    } finally { await cleanChunks(store,job); }
    return response(publicJob(job));
  }
  if(action==='status') return response(publicJob(job));
  if(action==='advance') {
    if(!job.remote?.importId) return response(publicJob(job));
    const remote=await wp(session,'/imports/');
    if(String(remote?.importId)!==String(job.remote.importId)) return response({error:'The destination importer now refers to a different job. Review it on WordPress.com.'},409);
    job.remote=remote;
    if(remote.importStatus==='uploadSuccess') {
      if(remote.importerFileType!=='playground') {
        job.phase='needs-review';job.message='WordPress.com did not recognise this as a Playground archive. Review the upload on WordPress.com.';
      } else {
        const lock=await store.setJSON('start-locks/'+job.id,{exp:job.exp},{onlyIfNew:true});
        if(lock.modified) {
          const form=new FormData();form.set('importStatus',JSON.stringify({importerId:remote.importId,siteId:session.siteId,type:remote.type || 'wordpress',importStatus:'importing',...(remote.customData ? {customData:remote.customData}: {})}));
          try {job.remote=await wp(session,'/imports/'+encodeURIComponent(remote.importId),form);job.phase='importing';}
          catch(error){job.phase='needs-review';job.message=error.message;}
        } else if(job.phase!=='importing') {job.phase='needs-review';job.message='Import start was already requested. Check WordPress.com rather than starting it twice.';}
      }
    }
    if(terminal(job.remote.importStatus)) job.phase=job.remote.importStatus==='importSuccess'?'complete':'failed';
    await store.setJSON('jobs/'+job.id,job);return response(publicJob(job));
  }
  return response({error:'Unknown transfer action.'},400);
}
