export function siteHost(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
}
export function createdAt(value) {
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  return Date.parse(value);
}
export function newSites(sites, baseline, started) {
  const old = new Set(baseline.map(String));
  return sites.filter(site => !old.has(String(site.ID))
    && Number.isSafeInteger(Number(site.ID)) && Number(site.ID)>0
    && Number.isFinite(createdAt(site.options?.created_at))
    && createdAt(site.options.created_at) >= Math.floor(started/1000)*1000
    && (!site.jetpack || site.is_wpcom_atomic)
    && site.capabilities?.manage_options);
}
export async function listSites(token) {
  const sites=[];
  for(let page=1;page<=50;page++){
    const response = await fetch('https://public-api.wordpress.com/rest/v1.3/me/sites?site_visibility=all&options=created_at&fields=ID,URL,plan,capabilities,options,jetpack,is_wpcom_atomic&page='+page+'&per_page=100', {
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('Could not check your sites. Please reconnect and try again.');
    const data=await response.json();
    if(!Array.isArray(data.sites)||!Number.isSafeInteger(data.total)||data.total<0)
      throw new Error('WordPress.com returned an incomplete site list.');
    sites.push(...data.sites);
    if(sites.length===data.total){
      if(new Set(sites.map(s=>String(s.ID))).size!==sites.length)throw new Error('Site list changed during checking. Please retry.');
      return sites;
    }
    if(!data.sites.length||sites.length>data.total)break;
  }
  throw new Error('Could not read the complete site list. No automatic transfer was started.');
}
