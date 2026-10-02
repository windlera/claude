import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Store } from './lib/db.js';
import { JobRunner } from './lib/jobs.js';
import { scrapeWebsite, scrapeLinkList } from './lib/enrich.js';
import { seedVerbaende } from './lib/verbaende.js';
import { parseCsv, toCsv, mapImportRow } from './lib/csv.js';
import { CANTONS, ORG_TYPES, ORG_STATUS, LEAD_PHASES, ACTIVITY_TYPES } from './lib/constants.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const EXPORT_COLUMNS = ['id', 'typ', 'name', 'sportarten', 'verband', 'strasse', 'plz', 'ort', 'kanton', 'land', 'telefon', 'email',
  'website', 'facebook', 'instagram', 'linkedin', 'mitglieder', 'gruendungsjahr', 'status', 'tags', 'beschreibung', 'notizen',
  'lat', 'lon', 'quelle', 'created_at', 'updated_at'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readBody(req, limit = 20_000_000) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'Anfrage zu gross');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  const text = await readBody(req);
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Ungültiges JSON'); }
}

function orgFilter(sp) {
  return {
    q: sp.get('q') || '', typ: sp.get('typ') || '', kanton: sp.get('kanton') || '', sport: sp.get('sport') || '',
    status: sp.get('status') || '', hatLeads: sp.get('hatLeads') === '1', ohneKontakt: sp.get('ohneKontakt') === '1',
    sort: sp.get('sort') || 'name', limit: sp.get('limit') || 50, offset: sp.get('offset') || 0,
  };
}

export function createApp(store, runner, { scrape = scrapeWebsite, scrapeList = scrapeLinkList } = {}) {
  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; })}$`);
    routes.push({ method, re, keys, handler });
  };
  const must = (v, what = 'Eintrag') => { if (!v) throw new HttpError(404, `${what} nicht gefunden`); return v; };

  route('GET', '/api/meta', () => ({
    kantone: CANTONS, typen: ORG_TYPES, status: ORG_STATUS, phasen: LEAD_PHASES, aktivitaeten: ACTIVITY_TYPES, ...store.facets(),
  }));
  route('GET', '/api/stats', () => store.stats());

  route('GET', '/api/orgs', ({ sp }) => store.listOrgs(orgFilter(sp)));
  route('POST', '/api/orgs', async ({ req }) => {
    const body = await readJson(req);
    const dup = store.findDuplicate(body);
    if (dup && !body.force) throw new HttpError(409, `Möglicherweise bereits erfasst (ID ${dup})`);
    return store.getOrg(store.createOrg(body, { quelle: body.quelle === 'web' ? 'web' : 'manuell' }));
  });
  route('GET', '/api/orgs/:id', ({ p }) => must(store.getOrgFull(p.id), 'Organisation'));
  route('PUT', '/api/orgs/:id', async ({ req, p }) => must(store.updateOrg(p.id, await readJson(req)), 'Organisation'));
  route('DELETE', '/api/orgs/:id', ({ p }) => ({ ok: must(store.deleteOrg(p.id), 'Organisation') }));
  route('POST', '/api/orgs/:id/release', async ({ req, p }) => must(store.releaseManualField(p.id, (await readJson(req)).field), 'Organisation'));
  route('POST', '/api/orgs/:id/enrich', async ({ p }) => {
    const org = must(store.getOrg(p.id), 'Organisation');
    if (!org.website) throw new HttpError(400, 'Keine Website hinterlegt');
    let found;
    try { found = await scrape(org.website); } catch (e) { throw new HttpError(502, `Website nicht lesbar: ${e.message}`); }
    const result = store.mergeInto(org.id, found.data, { onlyEmpty: true, enriched: true });
    return { result, gefunden: found, org: store.getOrgFull(org.id) };
  });

  route('POST', '/api/scrape-url', async ({ req }) => {
    const { url } = await readJson(req);
    if (!url) throw new HttpError(400, 'URL fehlt');
    let found;
    try { found = await scrape(url); } catch (e) { throw new HttpError(502, `Website nicht lesbar: ${e.message}`); }
    const name = (found.title || '').split(/\s[|–—-]\s/)[0].trim();
    return { ...found, data: { name, ...found.data }, duplikat: store.findDuplicate({ website: found.data.website }) };
  });

  route('POST', '/api/scrape-list', async ({ req }) => {
    const { url } = await readJson(req);
    if (!url) throw new HttpError(400, 'URL fehlt');
    let items;
    try { items = await scrapeList(url); } catch (e) { throw new HttpError(502, `Seite nicht lesbar: ${e.message}`); }
    return items.map((it) => ({ ...it, vorhanden: store.findDuplicate(it) }));
  });
  route('POST', '/api/orgs/bulk', async ({ req }) => {
    const { typ, tags = '', items = [] } = await readJson(req);
    if (!ORG_TYPES[typ]) throw new HttpError(400, 'Ungültiger Typ');
    const counts = { neu: 0, aktualisiert: 0, unveraendert: 0 };
    store.transaction(() => {
      for (const it of items) {
        if (!it?.name) continue;
        const { result } = store.upsertImported({ typ, tags, name: it.name, website: it.website || '' }, { quelle: 'liste' });
        counts[result]++;
      }
    });
    return counts;
  });
  route('POST', '/api/verbaende/seed', () => {
    store.setSetting('verbaende_version', '0');
    return { neu: seedVerbaende(store) };
  });

  route('GET', '/api/export.csv', ({ sp, res }) => {
    const rows = store.allOrgsForExport({ ...orgFilter(sp), limit: undefined, offset: 0 });
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="sport-crm-${new Date().toISOString().slice(0, 10)}.csv"` });
    res.end(toCsv(rows, EXPORT_COLUMNS));
  });
  route('GET', '/api/leads.csv', ({ res }) => {
    const rows = store.listLeads({});
    const cols = ['id', 'titel', 'org_name', 'org_ort', 'phase', 'wert', 'wahrscheinlichkeit', 'kontakt_name', 'verantwortlich', 'naechster_schritt', 'faellig_am', 'quelle', 'notizen', 'created_at', 'updated_at'];
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="leads.csv"' });
    res.end(toCsv(rows, cols));
  });
  route('POST', '/api/import/csv', async ({ req, sp }) => {
    const rows = parseCsv(await readBody(req));
    const defTyp = ORG_TYPES[sp.get('typ')] ? sp.get('typ') : 'verein';
    const counts = { neu: 0, aktualisiert: 0, unveraendert: 0, fehler: 0, meldungen: [] };
    store.transaction(() => {
      rows.forEach((raw, i) => {
        const data = { typ: defTyp, ...mapImportRow(raw) };
        if (!data.name) { counts.fehler++; counts.meldungen.push(`Zeile ${i + 2}: kein Name`); return; }
        const { result } = store.upsertImported(data, { quelle: 'import' });
        counts[result]++;
      });
    });
    return counts;
  });

  route('POST', '/api/contacts', async ({ req }) => ({ id: store.saveContact(await readJson(req)) }));
  route('PUT', '/api/contacts/:id', async ({ req, p }) => ({ id: store.saveContact({ ...(await readJson(req)), id: p.id }) }));
  route('DELETE', '/api/contacts/:id', ({ p }) => ({ ok: must(store.deleteContact(p.id), 'Kontakt') }));

  route('GET', '/api/leads', ({ sp }) => store.listLeads({ phase: sp.get('phase'), q: sp.get('q'), verantwortlich: sp.get('verantwortlich') }));
  route('POST', '/api/leads', async ({ req }) => ({ id: store.saveLead(await readJson(req)) }));
  route('PUT', '/api/leads/:id', async ({ req, p }) => ({ id: must(store.saveLead({ ...(await readJson(req)), id: p.id }), 'Lead') }));
  route('DELETE', '/api/leads/:id', ({ p }) => ({ ok: must(store.deleteLead(p.id), 'Lead') }));

  route('POST', '/api/activities', async ({ req }) => ({ id: store.addActivity(await readJson(req)) }));
  route('DELETE', '/api/activities/:id', ({ p }) => ({ ok: must(store.deleteActivity(p.id), 'Aktivität') }));

  route('GET', '/api/jobs', () => store.listJobs());
  route('GET', '/api/jobs/:id', ({ p }) => must(store.getJob(p.id), 'Job'));
  route('POST', '/api/jobs', async ({ req }) => {
    const { typ, params = {} } = await readJson(req);
    try { return { id: runner.start(typ, params) }; } catch (e) { throw new HttpError(400, e.message); }
  });
  route('POST', '/api/jobs/:id/cancel', ({ p }) => ({ ok: runner.cancel(p.id) }));

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
        if (!r) throw new HttpError(404, 'Unbekannte API-Route');
        const m = url.pathname.match(r.re);
        const p = Object.fromEntries(r.keys.map((k, i) => [k, Number(m[i + 1])]));
        const out = await r.handler({ req, res, p, sp: url.searchParams });
        if (!res.headersSent) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(out ?? {}));
        }
        return;
      }
      const file = path.join(PUBLIC, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(PUBLIC)) throw new HttpError(403, 'Verboten');
      const body = await readFile(file).catch(() => readFile(path.join(PUBLIC, 'index.html')));
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/html; charset=utf-8' });
      res.end(body);
    } catch (e) {
      const status = e.status || (/erforderlich|fehlt/.test(e.message) ? 400 : 500);
      if (status === 500) console.error(e);
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
  };
}

// Case-insensitive compare: on Windows the drive letter casing of argv[1] can differ.
if (path.resolve(process.argv[1] || '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const dbFile = process.env.DB_FILE || path.join(ROOT, 'data', 'crm.db');
  const store = new Store(dbFile);
  const runner = new JobRunner(store);
  const neu = seedVerbaende(store);
  if (neu) console.log(`${neu} nationale Sportverbände in die Datenbank übernommen`);
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  http.createServer(createApp(store, runner)).listen(port, host, () => {
    console.log(`Sport-CRM läuft auf http://${host === '0.0.0.0' ? 'localhost' : host}:${port}  (Datenbank: ${dbFile})`);
  });
}
