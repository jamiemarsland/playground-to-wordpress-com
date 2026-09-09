export function siteHost(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
}
export function createdAt(value) {
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  return Date.parse(value);
}
export function selectNewSite(sites, expected, started) {
  const matches = sites.filter(site => siteHost(site.URL) === expected);
  if (matches.length > 1) throw new Error('More than one destination matched. Automatic transfer stopped.');
  if (!matches.length) return null;
  const site = matches[0];
  if (!Number.isFinite(createdAt(site.options?.created_at)) || createdAt(site.options.created_at) < started)
    throw new Error('This address belongs to an older site. Automatic transfer stopped.');
  if (site.jetpack && !site.is_wpcom_atomic) throw new Error('The destination is not hosted on WordPress.com.');
  if (!site.capabilities?.manage_options) throw new Error('Administrator access is required.');
  if (!site.plan || site.plan.is_free !== false) return null;
  return site;
}
export async function listSites(token) {
  const response = await fetch('https://public-api.wordpress.com/rest/v1.1/me/sites?site_visibility=all&options=created_at&fields=ID,URL,plan,capabilities,options,jetpack,is_wpcom_atomic', {
    headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('Could not check your sites. Please reconnect and try again.');
  const data = await response.json();
  if (!Array.isArray(data.sites)) throw new Error('WordPress.com returned an unexpected site list.');
  return data.sites;
}
