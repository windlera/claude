import { DatabaseSync } from 'node:sqlite';
import { ORG_FIELDS, LEAD_PHASES } from './constants.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organisations (
  id INTEGER PRIMARY KEY,
  typ TEXT NOT NULL DEFAULT 'verein',
  name TEXT NOT NULL,
  sportarten TEXT DEFAULT '',
  verband TEXT DEFAULT '',
  strasse TEXT DEFAULT '',
  plz TEXT DEFAULT '',
  ort TEXT DEFAULT '',
  kanton TEXT DEFAULT '',
  land TEXT DEFAULT 'CH',
  telefon TEXT DEFAULT '',
  email TEXT DEFAULT '',
  website TEXT DEFAULT '',
  facebook TEXT DEFAULT '',
  instagram TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  mitglieder INTEGER,
  gruendungsjahr INTEGER,
  beschreibung TEXT DEFAULT '',
  notizen TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'neu',
  lat REAL,
  lon REAL,
  quelle TEXT NOT NULL DEFAULT 'manuell',
  source_id TEXT UNIQUE,
  manual_fields TEXT NOT NULL DEFAULT '[]',
  enriched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_org_typ ON organisations(typ);
CREATE INDEX IF NOT EXISTS idx_org_kanton ON organisations(kanton);
CREATE INDEX IF NOT EXISTS idx_org_name ON organisations(name);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  vorname TEXT DEFAULT '',
  nachname TEXT DEFAULT '',
  funktion TEXT DEFAULT '',
  email TEXT DEFAULT '',
  telefon TEXT DEFAULT '',
  notizen TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(org_id);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  titel TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'neu',
  wert REAL,
  wahrscheinlichkeit INTEGER,
  verantwortlich TEXT DEFAULT '',
  naechster_schritt TEXT DEFAULT '',
  faellig_am TEXT,
  quelle TEXT DEFAULT '',
  notizen TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(org_id);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  typ TEXT NOT NULL DEFAULT 'notiz',
  text TEXT NOT NULL,
  datum TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_act_org ON activities(org_id);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  typ TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'laeuft',
  fortschritt TEXT DEFAULT '',
  log TEXT NOT NULL DEFAULT '',
  neu INTEGER NOT NULL DEFAULT 0,
  aktualisiert INTEGER NOT NULL DEFAULT 0,
  fehler INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
`;

const INT_FIELDS = new Set(['mitglieder', 'gruendungsjahr', 'wahrscheinlichkeit', 'contact_id', 'org_id', 'lead_id']);
const REAL_FIELDS = new Set(['lat', 'lon', 'wert']);

function normalize(field, value) {
  if (value === undefined) return undefined;
  if (INT_FIELDS.has(field)) {
    if (value === null || value === '') return null;
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (REAL_FIELDS.has(field)) {
    if (value === null || value === '') return null;
    const n = parseFloat(value);
    return Number.isNaN(n) ? null : n;
  }
  if (field === 'faellig_am') return value ? String(value) : null;
  return value === null ? '' : String(value).trim();
}

function isEmpty(v) {
  return v === null || v === undefined || v === '';
}

function plain(row) {
  return row ? { ...row } : row;
}

export class Store {
  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  transaction(fn) {
    this.db.exec('BEGIN');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ---------- Organisationen ----------

  #orgWhere({ q, typ, kanton, sport, status, hatLeads, ohneKontakt } = {}) {
    const where = [];
    const params = [];
    if (q) {
      where.push(`(o.name LIKE ? OR o.ort LIKE ? OR o.plz LIKE ? OR o.email LIKE ? OR o.sportarten LIKE ? OR o.tags LIKE ? OR o.verband LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like, like);
    }
    if (typ) { where.push('o.typ = ?'); params.push(typ); }
    if (kanton) { where.push('o.kanton = ?'); params.push(kanton); }
    if (status) { where.push('o.status = ?'); params.push(status); }
    if (sport) { where.push('o.sportarten LIKE ?'); params.push(`%${sport}%`); }
    if (hatLeads) where.push('EXISTS (SELECT 1 FROM leads l WHERE l.org_id = o.id)');
    if (ohneKontakt) where.push(`o.email = '' AND o.telefon = ''`);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  listOrgs(filter = {}) {
    const { sort = 'name', limit = 50, offset = 0 } = filter;
    const { whereSql, params } = this.#orgWhere(filter);
    const order = {
      name: 'o.name COLLATE NOCASE',
      ort: 'o.ort COLLATE NOCASE, o.name COLLATE NOCASE',
      kanton: 'o.kanton, o.name COLLATE NOCASE',
      neueste: 'o.created_at DESC, o.id DESC',
      geaendert: 'o.updated_at DESC, o.id DESC',
    }[sort] || 'o.name COLLATE NOCASE';
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM organisations o ${whereSql}`).get(...params).n;
    const rows = this.db.prepare(`
      SELECT o.id, o.typ, o.name, o.sportarten, o.plz, o.ort, o.kanton, o.telefon, o.email, o.website,
             o.status, o.quelle, o.updated_at,
             (SELECT COUNT(*) FROM leads l WHERE l.org_id = o.id AND l.phase NOT IN ('gewonnen','verloren')) AS offene_leads,
             (SELECT COUNT(*) FROM contacts c WHERE c.org_id = o.id) AS kontakte
      FROM organisations o ${whereSql}
      ORDER BY ${order}
      LIMIT ? OFFSET ?`).all(...params, Math.min(Number(limit) || 50, 5000), Number(offset) || 0);
    return { total, rows: rows.map(plain) };
  }

  getOrg(id) {
    const org = plain(this.db.prepare('SELECT * FROM organisations WHERE id = ?').get(id));
    if (!org) return null;
    org.manual_fields = JSON.parse(org.manual_fields || '[]');
    return org;
  }

  getOrgFull(id) {
    const org = this.getOrg(id);
    if (!org) return null;
    org.contacts = this.db.prepare('SELECT * FROM contacts WHERE org_id = ? ORDER BY nachname, vorname').all(id).map(plain);
    org.leads = this.db.prepare('SELECT * FROM leads WHERE org_id = ? ORDER BY updated_at DESC').all(id).map(plain);
    org.activities = this.db.prepare(`
      SELECT a.*, l.titel AS lead_titel FROM activities a LEFT JOIN leads l ON l.id = a.lead_id
      WHERE a.org_id = ? ORDER BY a.datum DESC, a.id DESC`).all(id).map(plain);
    return org;
  }

  createOrg(data, { quelle = 'manuell', source_id = null, manual = true } = {}) {
    const fields = ORG_FIELDS.filter((f) => data[f] !== undefined);
    if (isEmpty(normalize('name', data.name))) throw new Error('Name ist erforderlich');
    const values = fields.map((f) => normalize(f, data[f]));
    const manualFields = manual ? fields.filter((f) => !isEmpty(normalize(f, data[f]))) : [];
    const sql = `INSERT INTO organisations (${[...fields, 'quelle', 'source_id', 'manual_fields'].join(', ')})
      VALUES (${[...fields, 1, 2, 3].map(() => '?').join(', ')})`;
    const r = this.db.prepare(sql).run(...values, quelle, source_id, JSON.stringify(manualFields));
    return Number(r.lastInsertRowid);
  }

  /** Manual edit from the UI: every changed field is marked as manually maintained. */
  updateOrg(id, data) {
    const org = this.getOrg(id);
    if (!org) return null;
    const changes = {};
    for (const f of ORG_FIELDS) {
      if (data[f] === undefined) continue;
      const v = normalize(f, data[f]);
      if (v !== org[f]) changes[f] = v;
    }
    if ('name' in changes && isEmpty(changes.name)) throw new Error('Name ist erforderlich');
    const keys = Object.keys(changes);
    if (!keys.length) return org;
    // Workflow fields are never touched by imports, so they need no protection.
    const protect = keys.filter((k) => !['status', 'notizen', 'tags'].includes(k));
    const manual = [...new Set([...org.manual_fields, ...protect])];
    this.db.prepare(`UPDATE organisations SET ${keys.map((k) => `${k} = ?`).join(', ')},
      manual_fields = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(...keys.map((k) => changes[k]), JSON.stringify(manual), id);
    return this.getOrg(id);
  }

  /** Allow a manually protected field to be overwritten by imports again. */
  releaseManualField(id, field) {
    const org = this.getOrg(id);
    if (!org) return null;
    const manual = org.manual_fields.filter((f) => f !== field);
    this.db.prepare('UPDATE organisations SET manual_fields = ? WHERE id = ?').run(JSON.stringify(manual), id);
    return this.getOrg(id);
  }

  deleteOrg(id) {
    return this.db.prepare('DELETE FROM organisations WHERE id = ?').run(id).changes > 0;
  }

  findOrgBySource(sourceId) {
    return this.db.prepare('SELECT id FROM organisations WHERE source_id = ?').get(sourceId)?.id ?? null;
  }

  /** Find a likely duplicate by website domain or name + PLZ. */
  findDuplicate({ name, plz, website }) {
    if (website) {
      const host = hostOf(website);
      if (host) {
        const row = this.db.prepare(`SELECT id FROM organisations WHERE website LIKE ? OR website LIKE ? LIMIT 1`)
          .get(`%://${host}%`, `%://www.${host}%`);
        if (row) return row.id;
      }
    }
    if (name && plz) {
      const row = this.db.prepare('SELECT id FROM organisations WHERE name = ? COLLATE NOCASE AND plz = ? LIMIT 1').get(name, plz);
      if (row) return row.id;
    }
    return null;
  }

  /**
   * Insert or update an organisation coming from an automatic source.
   * Manually maintained fields are never overwritten. With `onlyEmpty`, only
   * empty fields are filled (used for website enrichment).
   * Returns 'neu' | 'aktualisiert' | 'unveraendert'.
   */
  upsertImported(data, { quelle, source_id = null, onlyEmpty = false, matchDuplicates = true } = {}) {
    let id = source_id ? this.findOrgBySource(source_id) : null;
    if (!id && matchDuplicates) id = this.findDuplicate(data);
    if (!id) {
      this.createOrg(data, { quelle, source_id, manual: false });
      return { result: 'neu' };
    }
    return { id, result: this.mergeInto(id, data, { onlyEmpty, source_id }) };
  }

  mergeInto(id, data, { onlyEmpty = false, source_id = null, enriched = false } = {}) {
    const org = this.getOrg(id);
    const changes = {};
    for (const f of ORG_FIELDS) {
      if (data[f] === undefined || ['status', 'notizen', 'tags'].includes(f)) continue;
      if (org.manual_fields.includes(f)) continue;
      const v = normalize(f, data[f]);
      if (isEmpty(v)) continue;
      if (onlyEmpty && !isEmpty(org[f])) continue;
      if (v !== org[f]) changes[f] = v;
    }
    if (source_id && !org.source_id) changes.source_id = source_id;
    const keys = Object.keys(changes);
    const extra = enriched ? `, enriched_at = datetime('now')` : '';
    if (!keys.length) {
      if (enriched) this.db.prepare(`UPDATE organisations SET enriched_at = datetime('now') WHERE id = ?`).run(id);
      return 'unveraendert';
    }
    this.db.prepare(`UPDATE organisations SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now')${extra} WHERE id = ?`)
      .run(...keys.map((k) => changes[k]), id);
    return 'aktualisiert';
  }

  orgsToEnrich({ ids, nurNie = true, typ, kanton, limit = 200 } = {}) {
    const where = [`website != ''`];
    const params = [];
    if (ids?.length) { where.push(`id IN (${ids.map(() => '?').join(',')})`); params.push(...ids.map(Number)); }
    if (nurNie) where.push('enriched_at IS NULL');
    if (typ) { where.push('typ = ?'); params.push(typ); }
    if (kanton) { where.push('kanton = ?'); params.push(kanton); }
    return this.db.prepare(`SELECT id, name, website FROM organisations WHERE ${where.join(' AND ')} ORDER BY id LIMIT ?`)
      .all(...params, Number(limit) || 200).map(plain);
  }

  allOrgsForExport(filter) {
    const { whereSql, params } = this.#orgWhere(filter);
    return this.db.prepare(`SELECT o.* FROM organisations o ${whereSql} ORDER BY o.name COLLATE NOCASE`).all(...params).map((r) => {
      const row = plain(r);
      delete row.manual_fields;
      return row;
    });
  }

  facets() {
    const sports = new Map();
    for (const { sportarten } of this.db.prepare(`SELECT sportarten FROM organisations WHERE sportarten != ''`).all()) {
      for (const s of sportarten.split(',').map((x) => x.trim()).filter(Boolean)) sports.set(s, (sports.get(s) || 0) + 1);
    }
    return {
      sportarten: [...sports.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })),
    };
  }

  // ---------- Kontakte ----------

  saveContact(data) {
    const f = ['org_id', 'vorname', 'nachname', 'funktion', 'email', 'telefon', 'notizen'];
    const v = f.map((k) => normalize(k, data[k] ?? ''));
    if (data.id) {
      this.db.prepare(`UPDATE contacts SET ${f.slice(1).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...v.slice(1), data.id);
      return Number(data.id);
    }
    if (!data.org_id) throw new Error('org_id fehlt');
    return Number(this.db.prepare(`INSERT INTO contacts (${f.join(', ')}) VALUES (${f.map(() => '?').join(', ')})`).run(...v).lastInsertRowid);
  }

  deleteContact(id) {
    return this.db.prepare('DELETE FROM contacts WHERE id = ?').run(id).changes > 0;
  }

  // ---------- Leads ----------

  listLeads({ phase, q, verantwortlich } = {}) {
    const where = [];
    const params = [];
    if (phase) { where.push('l.phase = ?'); params.push(phase); }
    if (verantwortlich) { where.push('l.verantwortlich = ?'); params.push(verantwortlich); }
    if (q) { where.push('(l.titel LIKE ? OR o.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    return this.db.prepare(`
      SELECT l.*, o.name AS org_name, o.typ AS org_typ, o.ort AS org_ort,
             TRIM(COALESCE(c.vorname,'') || ' ' || COALESCE(c.nachname,'')) AS kontakt_name
      FROM leads l JOIN organisations o ON o.id = l.org_id
      LEFT JOIN contacts c ON c.id = l.contact_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE WHEN l.faellig_am IS NULL THEN 1 ELSE 0 END, l.faellig_am, l.updated_at DESC`).all(...params).map(plain);
  }

  saveLead(data) {
    const f = ['org_id', 'contact_id', 'titel', 'phase', 'wert', 'wahrscheinlichkeit', 'verantwortlich',
      'naechster_schritt', 'faellig_am', 'quelle', 'notizen'];
    if (data.id) {
      const old = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(data.id);
      if (!old) return null;
      const keys = f.filter((k) => data[k] !== undefined);
      if (keys.includes('titel') && isEmpty(normalize('titel', data.titel))) throw new Error('Titel ist erforderlich');
      this.db.prepare(`UPDATE leads SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
        .run(...keys.map((k) => normalize(k, data[k])), data.id);
      if (data.phase && data.phase !== old.phase) {
        this.addActivity({ org_id: old.org_id, lead_id: data.id, typ: 'notiz', text: `Phase geändert: ${LEAD_PHASES[old.phase] || old.phase} → ${LEAD_PHASES[data.phase] || data.phase}` });
      }
      return Number(data.id);
    }
    if (!data.org_id) throw new Error('Organisation fehlt');
    if (isEmpty(normalize('titel', data.titel))) throw new Error('Titel ist erforderlich');
    const keys = f.filter((k) => data[k] !== undefined);
    return Number(this.db.prepare(`INSERT INTO leads (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
      .run(...keys.map((k) => normalize(k, data[k]))).lastInsertRowid);
  }

  deleteLead(id) {
    return this.db.prepare('DELETE FROM leads WHERE id = ?').run(id).changes > 0;
  }

  // ---------- Aktivitäten ----------

  addActivity({ org_id, lead_id = null, typ = 'notiz', text, datum }) {
    if (isEmpty(text)) throw new Error('Text ist erforderlich');
    const sql = datum
      ? 'INSERT INTO activities (org_id, lead_id, typ, text, datum) VALUES (?, ?, ?, ?, ?)'
      : 'INSERT INTO activities (org_id, lead_id, typ, text) VALUES (?, ?, ?, ?)';
    const args = [org_id, lead_id || null, typ, String(text).trim()];
    if (datum) args.push(datum);
    return Number(this.db.prepare(sql).run(...args).lastInsertRowid);
  }

  deleteActivity(id) {
    return this.db.prepare('DELETE FROM activities WHERE id = ?').run(id).changes > 0;
  }

  // ---------- Dashboard ----------

  stats() {
    const one = (sql, ...p) => this.db.prepare(sql).get(...p);
    const all = (sql, ...p) => this.db.prepare(sql).all(...p).map(plain);
    return {
      orgs: all('SELECT typ, COUNT(*) AS n FROM organisations GROUP BY typ'),
      mitEmail: one(`SELECT COUNT(*) AS n FROM organisations WHERE email != ''`).n,
      mitWebsite: one(`SELECT COUNT(*) AS n FROM organisations WHERE website != ''`).n,
      total: one('SELECT COUNT(*) AS n FROM organisations').n,
      kantone: all(`SELECT kanton, COUNT(*) AS n FROM organisations WHERE kanton != '' GROUP BY kanton ORDER BY n DESC`),
      pipeline: all(`SELECT phase, COUNT(*) AS n, COALESCE(SUM(wert),0) AS wert FROM leads GROUP BY phase`),
      faellig: all(`
        SELECT l.id, l.titel, l.faellig_am, l.naechster_schritt, l.phase, l.org_id, o.name AS org_name
        FROM leads l JOIN organisations o ON o.id = l.org_id
        WHERE l.faellig_am IS NOT NULL AND l.faellig_am <= date('now', '+7 days') AND l.phase NOT IN ('gewonnen','verloren')
        ORDER BY l.faellig_am LIMIT 20`),
      aktivitaeten: all(`
        SELECT a.*, o.name AS org_name FROM activities a JOIN organisations o ON o.id = a.org_id
        ORDER BY a.datum DESC, a.id DESC LIMIT 10`),
    };
  }

  // ---------- Jobs ----------

  createJob(typ, params) {
    return Number(this.db.prepare('INSERT INTO jobs (typ, params) VALUES (?, ?)').run(typ, JSON.stringify(params)).lastInsertRowid);
  }

  updateJob(id, fields) {
    const keys = Object.keys(fields);
    this.db.prepare(`UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  }

  appendJobLog(id, line) {
    this.db.prepare(`UPDATE jobs SET log = substr(log || ? || char(10), -20000) WHERE id = ?`).run(line, id);
  }

  listJobs(limit = 20) {
    return this.db.prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT ?').all(limit).map(plain);
  }

  getJob(id) {
    return plain(this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
  }

  /** Jobs that were running when the server stopped can never finish. */
  failStaleJobs() {
    this.db.prepare(`UPDATE jobs SET status = 'abgebrochen', finished_at = datetime('now') WHERE status = 'laeuft'`).run();
  }
}

export function hostOf(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}
