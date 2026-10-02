import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Store } from '../lib/db.js';
import { JobRunner } from '../lib/jobs.js';
import { createApp } from '../server.js';

let server;
let base;
let store;
let runner;

const osmFetch = async (kanton) => (kanton === 'ZH' ? [
  { source_id: 'osm:node/1', data: { typ: 'verein', name: 'FC Zürich-Nord', sportarten: 'Fussball', plz: '8050', ort: 'Zürich', kanton: 'ZH', website: 'https://fczn.ch' } },
  { source_id: 'osm:node/2', data: { typ: 'verein', name: 'Unihockey Tigers', sportarten: 'Unihockey', plz: '8400', ort: 'Winterthur', kanton: 'ZH' } },
] : []);
const scrape = async (url) => ({ data: { website: url, email: 'info@fczn.ch', telefon: '+41 44 000 00 00', ort: 'Überschrieben?' }, title: 'FC Zürich-Nord | Home', emails: ['info@fczn.ch'], phones: [], pages: 1 });

async function call(method, path, json) {
  const res = await fetch(base + path, {
    method, headers: json ? { 'Content-Type': 'application/json' } : {}, body: json ? JSON.stringify(json) : undefined,
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

before(async () => {
  store = new Store(':memory:');
  runner = new JobRunner(store, { osmFetch, scrape });
  server = http.createServer(createApp(store, runner, { scrape }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); store.close(); });

test('OSM import job, re-import respects manual edits, enrichment fills only empty fields', async () => {
  const job = await call('POST', '/api/jobs', { typ: 'osm', params: { kantone: ['ZH', 'BE'] } });
  assert.equal(job.status, 200);
  await runner.idle();
  const j = await call('GET', `/api/jobs/${job.body.id}`);
  assert.equal(j.body.status, 'fertig');
  assert.equal(j.body.neu, 2);

  let list = await call('GET', '/api/orgs?kanton=ZH&sort=ort');
  assert.equal(list.body.total, 2);
  const fc = list.body.rows.find((r) => r.name === 'FC Zürich-Nord');

  // manual edit of the name → protected from re-import
  const upd = await call('PUT', `/api/orgs/${fc.id}`, { name: 'FC Zürich Nord (manuell)', status: 'aktiv' });
  assert.deepEqual(upd.body.manual_fields, ['name']);
  await call('POST', '/api/jobs', { typ: 'osm', params: { kantone: ['ZH'] } });
  await runner.idle();
  const org = await call('GET', `/api/orgs/${fc.id}`);
  assert.equal(org.body.name, 'FC Zürich Nord (manuell)');
  assert.equal(org.body.status, 'aktiv');
  list = await call('GET', '/api/orgs');
  assert.equal(list.body.total, 2, 're-import must not duplicate');

  // enrichment: fills email/phone but keeps existing ort
  const e = await call('POST', `/api/orgs/${fc.id}/enrich`);
  assert.equal(e.body.result, 'aktualisiert');
  assert.equal(e.body.org.email, 'info@fczn.ch');
  assert.equal(e.body.org.ort, 'Zürich');
  assert.ok(e.body.org.enriched_at);

  // release protection → next import overwrites the name again
  await call('POST', `/api/orgs/${fc.id}/release`, { field: 'name' });
  await call('POST', '/api/jobs', { typ: 'osm', params: { kantone: ['ZH'] } });
  await runner.idle();
  assert.equal((await call('GET', `/api/orgs/${fc.id}`)).body.name, 'FC Zürich-Nord');
});

test('manual organisations, duplicates, contacts, leads, activities, stats', async () => {
  const bad = await call('POST', '/api/orgs', { name: '' });
  assert.equal(bad.status, 400);
  const ag = await call('POST', '/api/orgs', { typ: 'agentur', name: 'Sportmarketing AG', website: 'https://smag.ch', kanton: 'BE', plz: '3000' });
  assert.equal(ag.status, 200);
  const dup = await call('POST', '/api/orgs', { name: 'SMAG', website: 'http://www.smag.ch/kontakt' });
  assert.equal(dup.status, 409);
  const forced = await call('POST', '/api/orgs', { name: 'SMAG', website: 'http://www.smag.ch/kontakt', force: true });
  assert.equal(forced.status, 200);

  const c = await call('POST', '/api/contacts', { org_id: ag.body.id, vorname: 'Anna', nachname: 'Muster', funktion: 'CEO' });
  const lead = await call('POST', '/api/leads', { org_id: ag.body.id, contact_id: c.body.id, titel: 'Partnerschaft 2027', wert: 25000, faellig_am: '2000-01-01' });
  assert.equal(lead.status, 200);
  assert.equal((await call('POST', '/api/leads', { org_id: ag.body.id, titel: ' ' })).status, 400);
  await call('PUT', `/api/leads/${lead.body.id}`, { phase: 'angebot' });
  await call('POST', '/api/activities', { org_id: ag.body.id, typ: 'anruf', text: 'Erstgespräch geführt' });

  const full = await call('GET', `/api/orgs/${ag.body.id}`);
  assert.equal(full.body.contacts.length, 1);
  assert.equal(full.body.leads[0].phase, 'angebot');
  assert.equal(full.body.activities.length, 2, 'phase change is logged automatically');

  const leads = await call('GET', '/api/leads?q=Sportmarketing');
  assert.equal(leads.body[0].kontakt_name, 'Anna Muster');

  const stats = await call('GET', '/api/stats');
  assert.equal(stats.body.faellig.length, 1);
  assert.ok(stats.body.pipeline.find((p) => p.phase === 'angebot').wert === 25000);

  const meta = await call('GET', '/api/meta');
  assert.ok(meta.body.sportarten.some((s) => s.name === 'Fussball'));

  assert.equal((await call('DELETE', `/api/orgs/${forced.body.id}`)).status, 200);
  assert.equal((await call('GET', `/api/orgs/${forced.body.id}`)).status, 404);
});

test('CSV import and export', async () => {
  const csv = 'Vereinsname;PLZ;Ort;Kanton;E-Mail;Sportart\nSchwingklub Emmental;3550;Langnau;BE;info@sk-emme.ch;Schwingen\n;;;;;\nSchwingklub Emmental;3550;Langnau;BE;neu@sk-emme.ch;Schwingen\n';
  const r = await fetch(`${base}/api/import/csv?typ=verein`, { method: 'POST', body: csv });
  const body = await r.json();
  assert.equal(body.neu, 1);
  assert.equal(body.aktualisiert, 1, 'second row matches name + PLZ');

  const exp = await fetch(`${base}/api/export.csv?kanton=BE&typ=verein`);
  const text = await exp.text();
  assert.match(exp.headers.get('content-type'), /text\/csv/);
  assert.match(text, /Schwingklub Emmental;Schwingen/);
  assert.match(text, /neu@sk-emme\.ch/);
});

test('scrape-url proposes data and static files are served', async () => {
  const r = await call('POST', '/api/scrape-url', { url: 'https://fczn.ch' });
  assert.equal(r.body.data.name, 'FC Zürich-Nord');
  assert.ok(r.body.duplikat);
  const html = await fetch(`${base}/`);
  assert.match(await html.text(), /Sport-CRM/);
  const traversal = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.doesNotMatch(await traversal.text(), /"sport-crm"/);
});
