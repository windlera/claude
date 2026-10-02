import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse, normalizePhone, findContactPages, extractLinks, scrapeWebsite, extractOrgLinks } from '../lib/enrich.js';
import { parseRobots, isAllowed } from '../lib/fetcher.js';
import { parseCsv, toCsv, mapImportRow } from '../lib/csv.js';
import { mapElement, buildQuery } from '../lib/osm.js';
import { sportLabel } from '../lib/constants.js';

const HOME = `<!doctype html><html><head><meta charset="utf-8"><title>FC Beispiel 1920 | Startseite</title>
<meta name="description" content="Der Fussballclub im Herzen von Musterdorf."></head><body>
<nav><a href="/verein/kontakt">Kontakt</a> <a href="/impressum">Impressum</a> <a href="https://andere.ch/kontakt">Extern</a>
<a href="/news">News</a></nav>
<footer>FC Beispiel · Sportweg 5, 8000 Zürich · <a href="mailto:info@fc-beispiel.ch">Mail</a>
<a href="https://www.facebook.com/fcbeispiel/">FB</a> <a href="https://www.facebook.com/sharer/sharer.php?u=x">Teilen</a>
<a href="https://www.instagram.com/fc_beispiel/?hl=de">IG</a> <img src="logo@2x.png"></footer></body></html>`;

const KONTAKT = `<html><body><h1>Kontakt</h1><p>Präsident: Hans Muster<br>Tel. 044 123 45 67<br>
praesident [at] fc-beispiel [dot] ch</p><a href="tel:+41791234567">Mobile</a></body></html>`;

test('analyse extracts emails, phones, social links, address and meta', () => {
  const r = analyse(HOME, 'https://www.fc-beispiel.ch/');
  assert.deepEqual(r.emails, ['info@fc-beispiel.ch']);
  assert.equal(r.social.facebook, 'https://www.facebook.com/fcbeispiel');
  assert.equal(r.social.instagram, 'https://www.instagram.com/fc_beispiel');
  assert.deepEqual(r.address, { strasse: 'Sportweg 5', plz: '8000', ort: 'Zürich' });
  assert.equal(r.meta.title, 'FC Beispiel 1920 | Startseite');
  assert.match(r.meta.description, /Musterdorf/);

  const k = analyse(KONTAKT, 'https://www.fc-beispiel.ch/verein/kontakt');
  assert.deepEqual(k.emails, ['praesident@fc-beispiel.ch']);
  assert.deepEqual(k.phones.sort(), ['+41 44 123 45 67', '+41 79 123 45 67']);
});

test('findContactPages keeps same-host contact pages, impressum first', () => {
  const links = extractLinks(HOME, 'https://www.fc-beispiel.ch/');
  assert.deepEqual(findContactPages(links, 'https://www.fc-beispiel.ch/'), [
    'https://www.fc-beispiel.ch/impressum',
    'https://www.fc-beispiel.ch/verein/kontakt',
  ]);
});

test('normalizePhone handles Swiss formats', () => {
  assert.equal(normalizePhone('044 123 45 67'), '+41 44 123 45 67');
  assert.equal(normalizePhone('+41 (0)31 987 65 43'), '+41 31 987 65 43');
  assert.equal(normalizePhone('0041 79 555 66 77'), '+41 79 555 66 77');
  assert.equal(normalizePhone('12345'), null);
});

test('scrapeWebsite merges homepage and contact pages', async () => {
  const pages = {
    'https://www.fc-beispiel.ch': HOME,
    'https://www.fc-beispiel.ch/impressum': '<p>Impressum: FC Beispiel</p>',
    'https://www.fc-beispiel.ch/verein/kontakt': KONTAKT,
  };
  const fetcher = async (url) => {
    const key = url.replace(/\/$/, '');
    if (!(key in pages)) throw new Error('404');
    return { url, html: pages[key] };
  };
  const r = await scrapeWebsite('www.fc-beispiel.ch', { fetcher });
  assert.equal(r.pages, 3);
  assert.equal(r.data.email, 'info@fc-beispiel.ch');
  assert.equal(r.data.telefon, '+41 79 123 45 67', 'explicit tel: links win');
  assert.equal(r.data.ort, 'Zürich');
  assert.equal(r.data.website, 'https://www.fc-beispiel.ch');
});

test('robots.txt rules', () => {
  const rules = parseRobots(`User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /intern/\nAllow: /intern/kontakt\nDisallow: /*.pdf$\n`);
  assert.equal(isAllowed(rules, '/kontakt'), true);
  assert.equal(isAllowed(rules, '/intern/mitglieder'), false);
  assert.equal(isAllowed(rules, '/intern/kontakt'), true);
  assert.equal(isAllowed(rules, '/doc.pdf'), false);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:\n'), '/x'), true);
  assert.equal(isAllowed(parseRobots('User-agent: SportCRM\nDisallow: /\n'), '/x'), false);
});

test('CSV round trip with semicolons, quotes and aliases', () => {
  const csv = toCsv([{ name: 'TV "Alt"; Bern', plz: '3000', ort: 'Bern' }], ['name', 'plz', 'ort']);
  const rows = parseCsv(csv);
  assert.deepEqual(rows, [{ name: 'TV "Alt"; Bern', plz: '3000', ort: 'Bern' }]);
  const mapped = mapImportRow({ Vereinsname: 'EHC Muster', 'E-Mail': 'a@b.ch', Homepage: 'ehc.ch', Kanton: 'zh', Typ: 'Agentur' });
  assert.deepEqual(mapped, { name: 'EHC Muster', email: 'a@b.ch', website: 'https://ehc.ch', kanton: 'ZH', typ: 'agentur' });
  assert.equal(parseCsv('Name,Ort\n"A, B",Thun\n')[0].Name, 'A, B');
});

test('OSM element mapping', () => {
  const el = {
    type: 'way', id: 42, center: { lat: 47.1, lon: 8.5 },
    tags: { name: 'Tennisclub See', club: 'sport', sport: 'tennis;padel', 'addr:street': 'Seestrasse', 'addr:housenumber': '3',
      'addr:postcode': '6300', 'addr:city': 'Zug', 'contact:website': 'tc-see.ch', 'contact:instagram': 'tcsee', email: 'Info@TC-See.ch' },
  };
  const m = mapElement(el, 'ZG');
  assert.equal(m.source_id, 'osm:way/42');
  assert.deepEqual(m.data, {
    typ: 'verein', name: 'Tennisclub See', sportarten: 'Tennis, Padel', strasse: 'Seestrasse 3', plz: '6300', ort: 'Zug', kanton: 'ZG',
    land: 'CH', telefon: '', email: 'info@tc-see.ch', website: 'https://tc-see.ch', facebook: '', instagram: 'https://www.instagram.com/tcsee',
    beschreibung: '', gruendungsjahr: undefined, lat: 47.1, lon: 8.5,
  });
  assert.equal(mapElement({ type: 'node', id: 1, tags: {} }, 'ZG'), null);
  assert.match(buildQuery('BE'), /ISO3166-2"="CH-BE"/);
  assert.match(buildQuery('BE', 'agentur'), /advertising_agency/);
});

test('sportLabel translates and dedupes', () => {
  assert.equal(sportLabel('soccer;floorball;soccer'), 'Fussball, Unihockey');
  assert.equal(sportLabel('some_new_sport'), 'Some new sport');
});

test('extractOrgLinks turns a directory page into organisations', () => {
  const html = `<a href="https://www.football.ch/">Schweizerischer Fussballverband</a><a href="https://football.ch/kontakt">football.ch</a>
    <a href="/intern">Intern</a><a href="https://shop.swissolympic.ch">Shop</a><a href="https://www.facebook.com/so">FB</a>
    <a href="https://swiss-ski.ch">www.swiss-ski.ch</a><a href="mailto:x@y.ch">Mail</a>`;
  assert.deepEqual(extractOrgLinks(html, 'https://www.swissolympic.ch/verbaende'), [
    { name: 'Schweizerischer Fussballverband', website: 'https://www.football.ch' },
    { name: 'swiss-ski.ch', website: 'https://swiss-ski.ch' },
  ]);
});
