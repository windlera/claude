// Extract contact data from club / agency websites (homepage + Kontakt/Impressum pages).
import { fetchPage } from './fetcher.js';
import { hostOf } from './db.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ss', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ecirc: 'ê' };

export function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m);
}

export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/[ \t ]+/g, ' ').replace(/\n\s*/g, '\n');
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : '';
}

export function extractLinks(html, baseUrl) {
  const links = [];
  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = attr(m[0], 'href');
    if (!href) continue;
    let abs;
    try { abs = new URL(href, baseUrl).href; } catch { continue; }
    links.push({ href: abs, raw: href, text: htmlToText(m[1]).trim() });
  }
  return links;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_EXACT = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const BAD_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|^(example|name|vorname|max\.muster|user|test)@|@(example|sentry|domain|email|wixpress|2x)\./i;

/** Undo common obfuscation like "info [at] verein [dot] ch". */
function deobfuscate(text) {
  return text
    .replace(/\s*(\[at\]|\(at\)|\{at\}|\s+at\s+|\[ät\]|\(ät\))\s*/gi, '@')
    .replace(/\s*(\[dot\]|\(dot\)|\{dot\}|\[punkt\]|\(punkt\))\s*/gi, '.');
}

export function extractEmails(html, text) {
  const found = [];
  for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)/gi)) found.push(decodeEntities(decodeURIComponent(m[1])));
  for (const m of deobfuscate(text).matchAll(EMAIL_RE)) found.push(m[0]);
  return [...new Set(found.map((e) => e.trim().toLowerCase().replace(/^\.+|\.+$/g, '')))]
    .filter((e) => EMAIL_EXACT.test(e) && !BAD_EMAIL.test(e));
}

const PHONE_RE = /(?:\+41|0041|\b0)\s?\(?0?\)?\s?[1-9]\d(?:[\s./-]?\d){7}\b/g;

export function normalizePhone(p) {
  let digits = p.replace(/[^\d+]/g, '');
  if (digits.startsWith('0041')) digits = `+41${digits.slice(4)}`;
  else if (digits.startsWith('0')) digits = `+41${digits.slice(1)}`;
  digits = digits.replace(/^\+410/, '+41');
  if (!/^\+41\d{9}$/.test(digits)) return null;
  return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
}

export function extractPhones(html, text) {
  const found = [];
  for (const m of html.matchAll(/href\s*=\s*["']tel:([^"']+)/gi)) found.push(decodeURIComponent(m[1]));
  for (const m of text.matchAll(PHONE_RE)) found.push(m[0]);
  return [...new Set(found.map(normalizePhone).filter(Boolean))];
}

const SOCIAL = {
  facebook: /^https?:\/\/(www\.|m\.|de-de\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\b|policy|privacy)[^?#]+/i,
  instagram: /^https?:\/\/(www\.)?instagram\.com\/(?!p\/|explore|accounts)[^?#]+/i,
  linkedin: /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(company|school|in)\/[^?#]+/i,
};

export function extractSocial(links) {
  const out = {};
  for (const [key, re] of Object.entries(SOCIAL)) {
    const hit = links.find((l) => re.test(l.href));
    if (hit) out[key] = hit.href.match(re)[0].replace(/\/$/, '');
  }
  return out;
}

const CONTACT_PAGE = /kontakt|contact|impressum|imprint|mentions|note-legali|vorstand|comit[eé]|verein\/?$|[uü]ber-uns|about|team/i;

export function findContactPages(links, baseUrl) {
  const host = hostOf(baseUrl);
  const scored = [];
  for (const l of links) {
    if (hostOf(l.href) !== host || /^(mailto|tel|javascript):/i.test(l.raw)) continue;
    const hay = `${l.text} ${new URL(l.href).pathname}`;
    if (!CONTACT_PAGE.test(hay)) continue;
    const score = /impressum|imprint|mentions/i.test(hay) ? 3 : /kontakt|contact/i.test(hay) ? 2 : 1;
    scored.push({ href: l.href.split('#')[0], score });
  }
  const seen = new Set();
  return scored.sort((a, b) => b.score - a.score)
    .filter((s) => !seen.has(s.href) && seen.add(s.href))
    .map((s) => s.href);
}

export function extractMeta(html) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (n) => {
    const tag = metas.find((t) => attr(t, 'name').toLowerCase() === n || attr(t, 'property').toLowerCase() === n);
    return tag ? attr(tag, 'content').trim() : '';
  };
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
  return {
    title: meta('og:site_name') || title,
    description: meta('description') || meta('og:description'),
  };
}

/** Swiss address "Musterstrasse 12, 8000 Zürich" from page text. */
export function extractAddress(text) {
  const re = /([A-ZÄÖÜ][\p{L}.' -]{2,40}?(?:strasse|str\.|gasse|weg|platz|allee|rain|ring|matte|halde|rue|route|chemin|avenue|via|piazza)\s*\d{1,4}[a-z]?)\s*[,\n]\s*(?:CH-)?([1-9]\d{3})\s+([\p{L}][\p{L} .'-]{1,40})/u;
  const m = text.match(re);
  if (!m) return null;
  return { strasse: m[1].trim(), plz: m[2], ort: m[3].split(/\n/)[0].trim() };
}

function pickEmail(emails, website) {
  const host = hostOf(website);
  const own = emails.filter((e) => host && e.endsWith(`@${host}`));
  const pool = own.length ? own : emails;
  return pool.find((e) => /^(info|kontakt|contact|sekretariat|praesident|präsident|verein|office|admin)@/.test(e)) || pool[0] || '';
}

/** Analyse one HTML document. */
export function analyse(html, url) {
  const text = htmlToText(html);
  const links = extractLinks(html, url);
  return {
    links,
    emails: extractEmails(html, text),
    phones: extractPhones(html, text),
    social: extractSocial(links),
    address: extractAddress(text),
    meta: extractMeta(html),
  };
}

/**
 * Crawl homepage + up to `maxPages` contact pages and return proposed field
 * values for the organisation.
 */
export async function scrapeWebsite(website, { maxPages = 3, fetcher = fetchPage, log = () => {} } = {}) {
  const start = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const home = await fetcher(start);
  const results = [analyse(home.html, home.url)];
  for (const page of findContactPages(results[0].links, home.url).slice(0, maxPages)) {
    try {
      const p = await fetcher(page);
      results.push(analyse(p.html, p.url));
    } catch (e) {
      log(`  ${page}: ${e.message}`);
    }
  }
  const emails = [...new Set(results.flatMap((r) => r.emails))];
  const phones = [...new Set(results.flatMap((r) => r.phones))];
  const social = Object.assign({}, ...results.map((r) => r.social).reverse());
  const address = results.slice(1).map((r) => r.address).find(Boolean) || results[0].address;
  const data = {
    website: home.url.replace(/\/$/, ''),
    email: pickEmail(emails, home.url),
    telefon: phones[0] || '',
    facebook: social.facebook || '',
    instagram: social.instagram || '',
    linkedin: social.linkedin || '',
    beschreibung: results[0].meta.description.slice(0, 500),
    ...(address || {}),
  };
  return { data, title: results[0].meta.title, emails, phones, pages: results.length };
}
