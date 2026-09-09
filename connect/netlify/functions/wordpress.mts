import { randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';

function env(key) { return Netlify.env.get(key); }
function origin() { return 'https://playground-wpcom-connect.netlify.app'; }
function callback() { return origin() + '/oauth/wordpress/callback'; }
function key() {
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
function cookies(req) {
  return Object.fromEntries((req.headers.get('cookie') || '').split(';').map(x => x.trim().split(/=(.*)/s)).filter(x => x[0]).map(x => [x[0], x[1]]));
}
function cookie(name, value, age) { return `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`; }
function escape(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function headers() {
  return new Headers({'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
}
function page(title, body, status = 200, extra = []) {
  const h = headers(); h.set('Content-Type','text/html; charset=utf-8');
  for (const value of extra) h.append('Set-Cookie', value);
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} | Playground Connect</title><style>body{font:17px/1.65 system-ui,sans-serif;background:#f0f4f6;color:#142b33;margin:0;padding:8vh 20px}main{max-width:620px;margin:auto;background:white;padding:38px;border-radius:16px;border-top:5px solid #155b4b}h1{font-size:30px;line-height:1.2}a{color:#155b4b}button,.button{display:inline-block;background:#155b4b;color:white;padding:12px 20px;border:0;border-radius:6px;font:inherit;text-decoration:none;cursor:pointer}code{display:block;background:#eef3f1;padding:16px;overflow-wrap:anywhere;font-size:14px}small{color:#52635e}a:focus-visible,button:focus-visible{outline:3px solid #a66b00;outline-offset:4px}</style><main><small>PLAYGROUND TO WORDPRESS.COM</small><h1>${escape(title)}</h1>${body}</main></html>`,{status,headers:h});
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
    if (req.method !== 'POST' || req.headers.get('origin') !== origin()) return page('Request rejected','<p>Use the disconnect button on this site.</p>',403);
    return redirect('/',[cookie('__Host-pgwpc-session','',0)]);
  }
  if (url.pathname === '/') {
    const session = unseal(jar['__Host-pgwpc-session']);
    if (session) return page('WordPress.com is connected',`<p>Connected to <strong>${escape(session.blog || 'your selected site')}</strong>.</p><p>Sign-in is complete. Automatic site transfer is not enabled yet; no content has been uploaded.</p><form action="/disconnect" method="post"><button>Disconnect</button></form>`);
    if (!ready()) return page('Finish connecting the app',`<p>Use this exact value in the WordPress.com application’s <strong>Redirect URLs</strong> field:</p><code>${callback()}</code><p>After registering, add the Client ID and Client Secret in this project’s Netlify environment settings. Keep the secret out of the plugin and GitHub.</p><p><a href="https://app.netlify.com/projects/playground-wpcom-connect/configuration/env">Open environment settings</a></p><small>The callback is hosted. WordPress.com sign-in will become available once the app credentials are configured.</small>`);
    return page('Connect WordPress.com','<p>Sign in and choose the site you want to connect. This step does not upload or publish anything.</p><a class="button" href="/oauth/wordpress/start">Connect WordPress.com</a>');
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
      return redirect('/',[clear,cookie('__Host-pgwpc-session',token,1800)]);
    } catch {
      return page('Could not connect','<p>Check the app credentials and exact Redirect URL in your settings, then start again.</p><a href="/">Return</a>',502,[clear]);
    }
  }
  return page('Page not found','<a href="/">Return to Playground Connect</a>',404);
}
export const config = { path: ['/', '/health', '/disconnect', '/oauth/wordpress/start', '/oauth/wordpress/callback'] };
