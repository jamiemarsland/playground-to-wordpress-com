import { storage, encrypt, decrypt } from './_shared/transfer-core.mts';
import { listSites, newSites, hasPaidPlan } from './_shared/new-site.mts';
import { randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';

export function env(key) { return Netlify.env.get(key); }
export function origin() { return 'https://playground-wpcom-connect.netlify.app'; }
function callback() { return origin() + '/oauth/wordpress/callback'; }
export function key() {
  const secret = env('SESSION_SECRET');
  if (!secret || secret.length < 32) throw new Error('Missing session key');
  return createHash('sha256').update(secret).digest();
}
export function seal(data) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function unseal(value) {
  try {
    if (!value || value.length > 6000) return null;
    const bytes = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}
export function cookies(req) {
  return Object.fromEntries((req.headers.get('cookie') || '').split(';').map(x => x.trim().split(/=(.*)/s)).filter(x => x[0]).map(x => [x[0], x[1]]));
}
function cookie(name, value, age) { return `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`; }
function escape(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function destinationLink(value) {
  const label=escape(value || 'your selected site');
  try {
    const url=new URL(value);
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) return label;
    return `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  } catch { return label; }
}
function headers() {
  return new Headers({'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
}
function page(title, body, status = 200, extra = [], bridge = false) {
  const h = headers(); h.set('Content-Type','text/html; charset=utf-8');
  for (const value of extra) h.append('Set-Cookie', value);
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} | Playground Connect</title><style>:root{--wp-blue:#3858e9;--wp-blue-dark:#1d35b4;--ink:#101517;--muted:#50575e;--line:#dcdcde}body{font:16px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;background:#f6f7f7;color:var(--ink);margin:0;padding:7vh 20px}main{max-width:620px;margin:auto;background:#fff;padding:40px;border-radius:12px;border:1px solid var(--line)}small.kick{display:block;font-size:11px;letter-spacing:.16em;font-weight:700;text-transform:uppercase;color:var(--muted)}h1{font-size:30px;line-height:1.15;font-weight:700;letter-spacing:-.02em;margin:12px 0 18px}h2{font-size:19px;font-weight:700;margin:0 0 8px}p,li{color:var(--muted)}p strong{color:var(--ink)}section{border:1px solid var(--line);border-radius:8px;padding:22px;margin:22px 0}li{padding-left:4px}strong{overflow-wrap:anywhere}a{color:var(--wp-blue)}button,.button{display:inline-block;background:var(--wp-blue);color:#fff;padding:12px 22px;border:0;border-radius:4px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}button:hover,.button:hover{background:var(--wp-blue-dark)}button:disabled{background:#dcdcde;color:#646970;cursor:not-allowed}button:disabled:hover{background:#dcdcde}code{display:block;background:#f6f7f7;border:1px solid var(--line);border-radius:4px;padding:16px;overflow-wrap:anywhere;font-size:13px}small{color:#787c82}progress{width:100%;height:8px;border-radius:999px;overflow:hidden}a:focus-visible,button:focus-visible{outline:2px solid var(--wp-blue);outline-offset:3px}</style><main><small class="kick">PUT YOUR SITE ONLINE</small><h1>${escape(title)}</h1>${body}</main>${bridge ? '<script src="/transfer.js" defer></script>' : ''}</html>`,{status,headers:h});
}
function redirect(path, values = []) {
  const h = headers(); h.set('Location', path);
  for (const value of values) h.append('Set-Cookie', value);
  return new Response(null,{status:303,headers:h});
}
function ready() { return Boolean(env('WPCOM_CLIENT_ID') && env('WPCOM_CLIENT_SECRET') && env('SESSION_SECRET')); }
export default async function handler(req, context, getStorage = storage) {
  const url = new URL(req.url);
  const jar = cookies(req);
  if (req.method !== 'GET' && !(req.method === 'POST' && ['/disconnect','/api/new-site'].includes(url.pathname))) return page('Method not allowed','<p>Return to the connection page.</p>',405);
  if (url.pathname === '/health') return new Response(JSON.stringify({status:'ok',oauthConfigured:ready()}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if (url.pathname === '/disconnect') {
    if (req.method !== 'POST') return page('Request rejected','<p>Use the disconnect button on this site.</p><a href="/">Return to connection</a>',403);
    const session = unseal(jar['__Host-pgwpc-session']);
    if (session) {
      const form = await req.formData().catch(() => null);
      const proof = unseal(form?.get('disconnect_token'));
      const fingerprint = createHash('sha256').update(session.token).digest('hex');
      if (proof?.purpose !== 'disconnect' || proof.session !== fingerprint) return page('Request rejected','<p>This form expired. Return to the connection page and try again.</p><a href="/">Return to connection</a>',403);
    }
    return redirect('/',[cookie('__Host-pgwpc-session','',0),cookie('__Host-pgwpc-account','',0),cookie('__Host-pgwpc-watch','',0)]);
  }
  if (url.pathname === '/new-site' || url.pathname === '/api/new-site') {
    const account = unseal(jar['__Host-pgwpc-account']);
    if (!account) return page('Sign in again','<p>Your connection expired.</p><a href="/?view=new">Restart</a>',401);
    const proof = seal({purpose:'watch',flow:account.flow,exp:account.exp});
    if (url.pathname === '/new-site') return page('Create your new site',`<div id="new-site" data-proof="${escape(proof)}"><p>We will detect the site created during this setup, including any address WordPress.com assigns. Create only one site during this transfer.</p><form id="create"><label for="address">Suggested site name</label><p><input id="address" required pattern="[a-z0-9][a-z0-9-]{2,50}" maxlength="51" placeholder="my-playground-site" autocomplete="off"></p><p><label><input id="consent" type="checkbox" required> Automatically import my Playground into this new site when hosting is ready.</label></p><button id="create-button" disabled>Choose hosting and move my site</button></form><p id="new-status" role="status">Waiting for your Playground. Keep this window and Playground open.</p><p id="signup-link"></p><p><a href="/">Cancel and return</a></p></div><script src="/new-site.js?v=site-ids-1" defer></script>`);
    const json = (body,status=200,values=[]) => { const h=headers();h.set('Content-Type','application/json');for(const v of values)h.append('Set-Cookie',v);return new Response(JSON.stringify(body),{status,headers:h}); };
    if (req.method !== 'POST') return json({error:'Use the setup form.'},405);
    const submitted = unseal(req.headers.get('x-pgwpc-watch'));
    if (submitted?.purpose !== 'watch' || submitted.flow !== account.flow) return json({error:'Setup expired. Restart from Playground.'},403);
    try {
      if (url.searchParams.get('action') === 'prepare') {
        const body = await req.json();
        if (typeof body.name !== 'string' || !/^[a-z0-9][a-z0-9-]{2,50}$/.test(body.name)) return json({error:'Enter a valid site address.'},400);
        const sites = await listSites(account.token);
        const baselineId=randomBytes(16).toString('hex');
        const baseline={ids:sites.map(s=>String(s.ID)),flow:account.flow,exp:account.exp};
        await getStorage(context).set('baselines/'+baselineId,encrypt(Buffer.from(JSON.stringify(baseline))),{metadata:{exp:account.exp}});
        const watch=seal({baselineId,started:Date.now(),flow:account.flow,exp:account.exp});
        const signup=new URL('https://wordpress.com/setup/new-hosted-site');
        signup.searchParams.set('showDomainStep','true');signup.searchParams.set('new',body.name);
        return json({signup:signup.toString()},200,[cookie('__Host-pgwpc-watch',watch,1800)]);
      }
      const watch=unseal(jar['__Host-pgwpc-watch']);
      if (!watch || watch.flow!==account.flow) return json({error:'Start hosting setup from this window first.'},400);
      let baseline=watch.baseline;
      if(watch.baselineId){
        if(!/^[a-f0-9]{32}$/.test(watch.baselineId))throw new Error('Invalid setup reference.');
        const bytes=await getStorage(context).get('baselines/'+watch.baselineId,{type:'arrayBuffer'});
        if(!bytes)throw new Error('Setup has expired. Restart the new-site flow.');
        const saved=JSON.parse(decrypt(bytes).toString());
        if(saved.flow!==account.flow || saved.exp<=Date.now())throw new Error('Setup has expired or belongs to another connection.');
        baseline=saved.ids;
      }
      if(!Array.isArray(baseline))return json({error:'Restart the new-site flow, or connect your already-created site using the existing-site option.'},409);
      const currentSites=await listSites(account.token);
      const candidates=newSites(currentSites,baseline,watch.started);
      const body=await req.json();
      const requested=body.siteId ? String(body.siteId) : watch.selected;
      if(requested && !candidates.some(s=>String(s.ID)===requested))return json({error:'The selected site is no longer a valid new destination.'},409);
      const choices=candidates.map(s=>({id:String(s.ID),url:s.URL}));
      if(!requested && candidates.length && (candidates.length>1 || watch.needsChoice)){
        const updated=seal({...watch,needsChoice:true});
        return json({waiting:true,choices,message:'Several new sites appeared. Choose the destination for your Playground.'},200,[cookie('__Host-pgwpc-watch',updated,1800)]);
      }
      const site=requested ? candidates.find(s=>String(s.ID)===requested) : candidates[0];
      if(!site){
        const unseen=currentSites.filter(s=>!baseline.includes(String(s.ID)));
        return json({waiting:true,message:unseen.length
          ? 'Found '+unseen.length+' new site(s), but creation date, hosting or administrator access is not confirmed yet. No import has started.'
          : 'Checked '+currentSites.length+' sites. Waiting for a new site ID to appear in this account. No import has started.'});
      }
      if(!hasPaidPlan(site)){
        const updated=seal({...watch,...(requested ? {selected:String(site.ID)} : {})});
        return json({waiting:true,message:'Found '+site.URL+'. Waiting for paid hosting to be ready…'},200,[cookie('__Host-pgwpc-watch',updated,1800)]);
      }
      const token=seal({token:account.token,siteId:site.ID,blog:site.URL,exp:account.exp});
      if(token.length>3800)throw new Error('Session too large.');
      return json({ready:true,blog:site.URL},200,[cookie('__Host-pgwpc-session',token,1800)]);
    } catch(error) { return json({error:error.message || 'Could not check the destination.'},400); }
  }
  if (url.pathname === '/') {
    const session = unseal(jar['__Host-pgwpc-session']);
    if (session && url.searchParams.get('view') === 'transfer') return page('Send your site to WordPress.com',`<p>Destination: <strong id="destination">${destinationLink(session.blog)}</strong>.</p><p id="status" role="status" aria-live="polite">Start from the Move to WordPress.com button on your site, and this window will pick it up.</p><progress id="progress" max="100" value="0" hidden style="width:100%"></progress><p id="source"></p><button id="transfer" disabled>Send my site here</button><section id="done" hidden><h2>Your site is live</h2><p>It is on WordPress.com now. Have a look through your pages, pictures and design before you share the address.</p><p><a class="button" id="done-open" href="${escape(session.blog || '')}" target="_blank" rel="noopener noreferrer">Open my site</a></p><p><small>The site you copied from is untouched, and still open in the other window.</small></p></section><p><small>Whatever is on the site above can be replaced, so send it to a new or spare site. The one you are copying from is left exactly as it is.</small></p><p><small>Your site passes through locked temporary storage on the way, and is deleted once it arrives.</small></p><p><a id="review" href="https://wordpress.com/import/${encodeURIComponent(String(session.siteId))}" target="_blank" rel="noopener noreferrer">See how it is going on WordPress.com</a></p><p><a href="/">Choose a different destination</a></p><form action="/disconnect" method="post"><input type="hidden" name="disconnect_token" value="${escape(seal({purpose:'disconnect',session:createHash('sha256').update(session.token).digest('hex'),exp:Math.min(session.exp,Date.now()+1800000)}))}"><button>Disconnect / choose another site</button></form>`,200,[],true);
    if (!ready()) return page('Finish connecting the app',`<p>Use this exact value in the WordPress.com application’s <strong>Redirect URLs</strong> field:</p><code>${callback()}</code><p>After registering, add the Client ID and Client Secret in this project’s Netlify environment settings. Keep the secret out of the plugin and GitHub.</p><p><a href="https://app.netlify.com/projects/playground-wpcom-connect/configuration/env">Open environment settings</a></p><small>The callback is hosted. WordPress.com sign-in will become available once the app credentials are configured.</small>`);
    if (url.searchParams.get('view') === 'new') return page('Create and move your site',`<p>This newer way watches for your new WordPress.com site and sends everything across on its own, once the site is ready.</p><p>Sign in first. WordPress.com will ask for access across your account so we can find the new site. We compare your sites before and after signup to find the new destination.</p><p>Full-site transfer requires a paid plan with plugin support.</p><a class="button" href="/oauth/wordpress/start?mode=new">Sign in to create and move</a><p><a href="/">Back</a></p>`);
    return page('Where should your site live?',`<p>Choose where it should go. Nothing is sent until you say so.</p><section><h2>Create a new site</h2><p>We’ll guide you through creating a site on WordPress.com, then connecting it here.</p><a class="button" href="/?view=new">Create a new site</a></section><section><h2>Use an existing site</h2><p>Sign in to WordPress.com and select a site you already own. Use a new or disposable site for testing.</p><a class="button" href="/oauth/wordpress/start">Use an existing site</a></section>${session ? `<section><h2>Already connected</h2><p>${escape(session.blog || 'Your selected site')}</p><a class="button" href="/?view=transfer">Continue with this site</a></section>` : ''}<p><small>Full-site transfer requires a WordPress.com plan that supports plugins. Free content-only transfer is not available in this version.</small></p>`);
  }
  if (url.pathname === '/oauth/wordpress/start') {
    if (!ready()) return redirect('/');
    const state = randomBytes(32).toString('base64url');
    const mode = url.searchParams.get('mode') === 'new' ? 'new' : 'existing';
    const target = new URL('https://public-api.wordpress.com/oauth2/authorize');
    target.search = new URLSearchParams({client_id:env('WPCOM_CLIENT_ID'),redirect_uri:callback(),response_type:'code',state}).toString();
    if (mode === 'new') target.searchParams.set('scope','global');
    return redirect(target.toString(),[cookie('__Host-pgwpc-state',seal({state,mode,exp:Date.now()+600000}),600)]);
  }
  if (url.pathname === '/oauth/wordpress/callback') {
    const clear = cookie('__Host-pgwpc-state','',0);
    const pending = unseal(jar['__Host-pgwpc-state']);
    const state = url.searchParams.get('state') || '';
    if (!pending || Buffer.byteLength(state) !== Buffer.byteLength(pending.state) || !timingSafeEqual(Buffer.from(state),Buffer.from(pending.state))) {
      return page('Start from the connection page','<p>This needs a fresh sign-in from this browser.</p><a href="/">Start again</a>',400,[clear]);
    }
    if (url.searchParams.has('error')) return page('Connection cancelled','<p>Your site has not been changed.</p><a href="/">Try again</a>',400,[clear]);
    const code = url.searchParams.get('code');
    if (!ready() || !code || code.length > 2048) return page('Connection is not ready','<p>Return to the connection page and try again.</p><a href="/">Return</a>',400,[clear]);
    try {
      const response = await fetch('https://public-api.wordpress.com/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:env('WPCOM_CLIENT_ID'),client_secret:env('WPCOM_CLIENT_SECRET'),redirect_uri:callback(),grant_type:'authorization_code',code}),signal:AbortSignal.timeout(20000)});
      const data = await response.json();
      if (!response.ok || typeof data.access_token !== 'string') throw new Error('Token exchange failed');
      if (pending.mode === 'new') {
        if (!String(data.scope || '').split(/[ ,]+/).includes('global')) throw new Error('Account-wide permission was not granted');
        const account = seal({token:data.access_token,flow:randomBytes(16).toString('hex'),exp:Date.now()+1800000});
        if (account.length > 3800) throw new Error('Session too large');
        return redirect('/new-site',[clear,cookie('__Host-pgwpc-account',account,1800),cookie('__Host-pgwpc-session','',0)]);
      }
      const token = seal({token:data.access_token,siteId:data.blog_id,blog:data.blog_url,exp:Date.now()+1800000});
      if (token.length > 3800) throw new Error('Session too large');
      return redirect('/?view=transfer',[clear,cookie('__Host-pgwpc-session',token,1800)]);
    } catch {
      return page('Could not connect','<p>Check the app credentials and exact Redirect URL in your settings, then start again.</p><a href="/">Return</a>',502,[clear]);
    }
  }
  return page('Page not found','<a href="/">Start again</a>',404);
}
export const config = { path: ['/', '/new-site', '/api/new-site', '/health', '/disconnect', '/oauth/wordpress/start', '/oauth/wordpress/callback'] };
