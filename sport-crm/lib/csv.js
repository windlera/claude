// Minimal CSV reader/writer (Excel-compatible: semicolon, UTF-8 BOM).

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v !== '')) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${[columns.join(';'), ...rows.map((r) => columns.map((c) => esc(r[c])).join(';'))].join('\r\n')}\r\n`;
}

// Column aliases accepted on import (lower-cased, without spaces/punctuation).
const ALIASES = {
  name: ['name', 'verein', 'vereinsname', 'firma', 'organisation', 'club', 'nom', 'nome'],
  typ: ['typ', 'type', 'art'],
  sportarten: ['sportarten', 'sportart', 'sport', 'sports'],
  verband: ['verband', 'dachverband', 'federation', 'fédération'],
  strasse: ['strasse', 'straße', 'adresse', 'address', 'rue', 'via'],
  plz: ['plz', 'postleitzahl', 'zip', 'npa', 'cap'],
  ort: ['ort', 'stadt', 'gemeinde', 'city', 'localite', 'localité', 'località'],
  kanton: ['kanton', 'canton', 'cantone', 'kt'],
  land: ['land', 'country', 'pays'],
  telefon: ['telefon', 'tel', 'phone', 'telefonnummer', 'téléphone'],
  email: ['email', 'e-mail', 'mail', 'emailadresse'],
  website: ['website', 'webseite', 'homepage', 'url', 'web', 'internet', 'site'],
  facebook: ['facebook'],
  instagram: ['instagram'],
  linkedin: ['linkedin'],
  mitglieder: ['mitglieder', 'members', 'anzahlmitglieder', 'membres'],
  gruendungsjahr: ['gruendungsjahr', 'gründungsjahr', 'gegründet', 'founded'],
  beschreibung: ['beschreibung', 'description'],
  notizen: ['notizen', 'notiz', 'bemerkung', 'bemerkungen', 'notes'],
  tags: ['tags', 'schlagworte'],
  status: ['status'],
};

const key = (s) => s.toLowerCase().replace(/[\s_.]/g, '');

export function mapImportRow(row) {
  const lookup = Object.fromEntries(Object.entries(row).map(([k, v]) => [key(k), v]));
  const out = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const v = lookup[key(n)];
      if (v !== undefined && v !== '') { out[field] = v; break; }
    }
  }
  if (out.kanton) out.kanton = out.kanton.toUpperCase().slice(0, 2);
  if (out.typ) {
    const t = out.typ.toLowerCase();
    out.typ = t.startsWith('agen') ? 'agentur' : t.startsWith('verb') || t.startsWith('fed') ? 'verband' : 'verein';
  }
  if (out.website && !/^https?:\/\//i.test(out.website)) out.website = `https://${out.website}`;
  return out;
}
