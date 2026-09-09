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
function headers() {
  return new Headers({'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
}
function page(title, body, status = 200, extra = [], bridge = false) {
  const h = headers(); h.set('Content-Type','text/html; charset=utf-8');
  for (const value of extra) h.append('Set-Cookie', value);
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} | Playground Connect</title><style>body{font:17px/1.65 system-ui,sans-serif;background:#f0f4f6;color:#142b33;margin:0;padding:8vh 20px}main{max-width:620px;margin:auto;background:white;padding:38px;border-radius:16px;border-top:5px solid #155b4b}h1{font-size:30px;line-height:1.2}h2{font-size:21px;margin:0}section{border:1px solid #d9e4df;border-radius:8px;padding:20px;margin:20px 0}li{padding-left:4px}strong{overflow-wrap:anywhere}a{color:#155b4b}button,.button{display:inline-block;background:#155b4b;color:white;padding:12px 20px;border:0;border-radius:6px;font:inherit;text-decoration:none;cursor:pointer}code{display:block;background:#eef3f1;padding:16px;overflow-wrap:anywhere;font-size:14px}small{color:#52635e}a:focus-visible,button:focus-visible{outline:3px solid #a66b00;outline-offset:4px}</style><main><small>PLAYGROUND TO WORDPRESS.COM</small><h1>${escape(title)}</h1>${body}</main>${bridge ? '<script src="/transfer.js" defer></script>' : ''}</html>`,{status,headers:h});
}
function redirect(path, values = []) {
  const h = headers(); h.set('Location', path);
  for (const value of values) h.append('Set-Cookie', value);
  return new Response(null,{status:303,headers:h});
}
function ready() { return Boolean(env('WPCOM_CLIENT_ID') && env('WPCOM_CLIENT_SECRET') && env('SESSION_SECRET')); }
export default async function handler(req) {
  const url = new URL(req.url);
  const jar = cookies(req);
  if (req.method !== 'GET' && !(req.method === 'POST' && url.pathname === '/disconnect')) return page('Method not allowed','<p>Return to the connection page.</p>',405);
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
    return redirect('/',[cookie('__Host-pgwpc-session','',0)]);
  }
  if (url.pathname === '/') {
    const session = unseal(jar['__Host-pgwpc-session']);
    if (session && url.searchParams.get('view') === 'transfer') return page('Move your Playground site',`<p>Destination: <strong>${escape(session.blog || 'your selected site')}</strong>.</p><p id="status" role="status" aria-live="polite">Open this window using the Move to WordPress.com button in your Playground.</p><progress id="progress" max="100" value="0" hidden style="width:100%"></progress><p id="source"></p><button id="transfer" disabled>Move my site here</button><p><small>This imports the Playground archive into the destination shown above and may replace existing content or settings. Use a new or disposable test site. The source Playground stays intact.</small></p><p><small>Your archive passes through encrypted temporary storage, which is deleted after upload or expires for scheduled cleanup.</small></p><p><a id="review" href="https://wordpress.com/import/${encodeURIComponent(String(session.siteId))}" target="_blank" rel="noopener noreferrer">Check import on WordPress.com</a></p><p><a href="/">Choose a different destination</a></p><form action="/disconnect" method="post"><input type="hidden" name="disconnect_token" value="${escape(seal({purpose:'disconnect',session:createHash('sha256').update(session.token).digest('hex'),exp:Math.min(session.exp,Date.now()+1800000)}))}"><button>Disconnect / choose another site</button></form>`,200,[],true);
    if (!ready()) return page('Finish connecting the app',`<p>Use this exact value in the WordPress.com application’s <strong>Redirect URLs</strong> field:</p><code>${callback()}</code><p>After registering, add the Client ID and Client Secret in this project’s Netlify environment settings. Keep the secret out of the plugin and GitHub.</p><p><a href="https://app.netlify.com/projects/playground-wpcom-connect/configuration/env">Open environment settings</a></p><small>The callback is hosted. WordPress.com sign-in will become available once the app credentials are configured.</small>`);
    if (url.searchParams.get('view') === 'new') return page('Create your destination',`<p>Keep this window and your Playground open while you create a site.</p><p><strong>Before you start:</strong> this version transfers the full Playground archive and needs a WordPress.com plan that supports plugins. Free content-only transfer is not available here yet.</p><ol><li><p><a class="button" href="https://wordpress.com/setup/new-hosted-site" target="_blank" rel="noopener noreferrer">Choose hosting for your site ↗</a></p><p>Choose your hosting plan and finish checkout in the new tab. When your site dashboard appears, return here and connect it below. Your Playground supplies the design and content.</p></li><li><p><a class="button" href="/oauth/wordpress/start">I’ve created my site. Connect it</a></p><p>Sign in with the same account and select your new site. You will review the destination before transferring anything.</p></li></ol><p><a href="/">Back to destination choices</a></p>`);
    return page('Where should your site live?',`<p>Choose a destination for your Playground site. Nothing is uploaded until you confirm the transfer.</p><section><h2>Create a new site</h2><p>We’ll guide you through creating a site on WordPress.com, then connecting it here.</p><a class="button" href="/?view=new">Create a new site</a></section><section><h2>Use an existing site</h2><p>Sign in to WordPress.com and select a site you already own. Use a new or disposable site for testing.</p><a class="button" href="/oauth/wordpress/start">Use an existing site</a></section>${session ? `<section><h2>Already connected</h2><p>${escape(session.blog || 'Your selected site')}</p><a class="button" href="/?view=transfer">Continue with this site</a></section>` : ''}<p><small>Full-site transfer requires a WordPress.com plan that supports plugins. Free content-only transfer is not available in this version.</small></p>`);
  }
  if (url.pathname === '/oauth/wordpress/start') {
    if (!ready()) return redirect('/');
    const state = randomBytes(32).toString('base64url');
    const target = new URL('https://public-api.wordpress.com/oauth2/authorize');
    target.search = new URLSearchParams({client_id:env('WPCOM_CLIENT_ID'),redirect_uri:callback(),response_type:'code',state}).toString();
    return redirect(target.toString(),[cookie('__Host-pgwpc-state',seal({state,exp:Date.now()+600000}),600)]);
  }
  if (url.pathname === '/oauth/wordpress/callback') {
    const clear = cookie('__Host-pgwpc-state','',0);
    const pending = unseal(jar['__Host-pgwpc-state']);
    const state = url.searchParams.get('state') || '';
    if (!pending || Buffer.byteLength(state) !== Buffer.byteLength(pending.state) || !timingSafeEqual(Buffer.from(state),Buffer.from(pending.state))) {
      return page('Start from the connection page','<p>This callback needs a fresh sign-in request from this browser.</p><a href="/">Return to Playground Connect</a>',400,[clear]);
    }
    if (url.searchParams.has('error')) return page('Connection cancelled','<p>Your site has not been changed.</p><a href="/">Try again</a>',400,[clear]);
    const code = url.searchParams.get('code');
    if (!ready() || !code || code.length > 2048) return page('Connection is not ready','<p>Return to the connection page and try again.</p><a href="/">Return</a>',400,[clear]);
    try {
      const response = await fetch('https://public-api.wordpress.com/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:env('WPCOM_CLIENT_ID'),client_secret:env('WPCOM_CLIENT_SECRET'),redirect_uri:callback(),grant_type:'authorization_code',code}),signal:AbortSignal.timeout(20000)});
      const data = await response.json();
      if (!response.ok || typeof data.access_token !== 'string') throw new Error('Token exchange failed');
      const token = seal({token:data.access_token,siteId:data.blog_id,blog:data.blog_url,exp:Date.now()+1800000});
      if (token.length > 3800) throw new Error('Session too large');
      return redirect('/?view=transfer',[clear,cookie('__Host-pgwpc-session',token,1800)]);
    } catch {
      return page('Could not connect','<p>Check the app credentials and exact Redirect URL in your settings, then start again.</p><a href="/">Return</a>',502,[clear]);
    }
  }
  return page('Page not found','<a href="/">Return to Playground Connect</a>',404);
}
export const config = { path: ['/', '/health', '/disconnect', '/oauth/wordpress/start', '/oauth/wordpress/callback'] };
