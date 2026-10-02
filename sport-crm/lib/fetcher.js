// Polite HTTP fetching: identifies itself, respects robots.txt, rate-limits per host.

export const USER_AGENT = 'SportCRM/1.0 (+Vereinsdaten-Pflege; Kontakt über Website-Betreiber)';
const UA_TOKEN = 'sportcrm';

const lastHit = new Map();
const robotsCache = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle(host, minDelayMs) {
  const wait = (lastHit.get(host) || 0) + minDelayMs - Date.now();
  lastHit.set(host, Math.max(Date.now(), (lastHit.get(host) || 0) + minDelayMs));
  if (wait > 0) await sleep(wait);
}

/** Parse robots.txt into the rule list that applies to us. */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current) continue;
      if (key === 'disallow' || key === 'allow') current.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && UA_TOKEN.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules).filter((r) => r.path !== '' || r.allow);
}

function ruleMatches(rulePath, path) {
  const anchored = rulePath.endsWith('$');
  const pattern = rulePath.replace(/\$$/, '').split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(path);
}

export function isAllowed(rules, path) {
  let best = null;
  for (const r of rules) {
    if (!r.path || !ruleMatches(r.path, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

async function robotsFor(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let rules = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000), redirect: 'follow',
    });
    if (res.ok) rules = parseRobots(await res.text());
  } catch {
    // no robots.txt reachable → no restrictions
  }
  robotsCache.set(origin, rules);
  return rules;
}

/**
 * Fetch a page as text. Returns { url, status, html } or throws.
 * Options: minDelayMs (per host), maxBytes, respectRobots.
 */
export async function fetchPage(url, { minDelayMs = 1500, maxBytes = 1_500_000, respectRobots = true, timeoutMs = 15000 } = {}) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error(`Ungültiges Protokoll: ${u.protocol}`);
  if (respectRobots) {
    const rules = await robotsFor(u.origin);
    if (!isAllowed(rules, u.pathname + u.search)) throw new Error(`robots.txt verbietet ${u.pathname}`);
  }
  await throttle(u.host, minDelayMs);
  const res = await fetch(u, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'de-CH,de;q=0.9,fr;q=0.7,it;q=0.6,en;q=0.5' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (type && !/html|xml|text/i.test(type)) throw new Error(`Kein HTML (${type})`);
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
    if (size > maxBytes) { reader.cancel(); break; }
  }
  const buf = Buffer.concat(chunks);
  const charset = (type.match(/charset=([\w-]+)/i) || [])[1] || (buf.subarray(0, 2048).toString('latin1').match(/charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
  let html;
  try {
    html = new TextDecoder(charset.toLowerCase()).decode(buf);
  } catch {
    html = new TextDecoder('utf-8').decode(buf);
  }
  return { url: res.url || u.href, status: res.status, html };
}

/** POST helper for APIs like Overpass (no robots check, still throttled). */
export async function postForm(url, body, { minDelayMs = 2000, timeoutMs = 200000 } = {}) {
  const u = new URL(url);
  await throttle(u.host, minDelayMs);
  const res = await fetch(u, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200).replace(/<[^>]+>/g, ' ').trim()}`);
  }
  return res.json();
}
