// Import of sports clubs / agencies from OpenStreetMap via the Overpass API.
// Data © OpenStreetMap contributors, ODbL.
import { sportLabel } from './constants.js';
import { postForm } from './fetcher.js';

export const OVERPASS_ENDPOINTS = (process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter')
  .split(',').map((s) => s.trim()).filter(Boolean);

export function buildQuery(kanton, typ = 'verein') {
  const selectors = typ === 'agentur'
    ? [
      'nwr["office"="advertising_agency"]["name"](area.a);',
      'nwr["office"="event_management"]["name"](area.a);',
      'nwr["office"="marketing"]["name"](area.a);',
    ]
    : [
      'nwr["club"="sport"]["name"](area.a);',
      'nwr["leisure"="sports_club"]["name"](area.a);',
      'nwr["club"]["sport"]["name"](area.a);',
      'nwr["office"="association"]["sport"]["name"](area.a);',
    ];
  return `[out:json][timeout:180];
area["ISO3166-2"="CH-${kanton}"]["admin_level"="4"]->.a;
(
  ${selectors.join('\n  ')}
);
out center tags;`;
}

const first = (tags, ...keys) => {
  for (const k of keys) if (tags[k]) return tags[k].split(';')[0].trim();
  return '';
};

function normalizeUrl(url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function socialUrl(value, base) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}${value.replace(/^@/, '')}`;
}

export function mapElement(el, kanton, typ = 'verein') {
  const t = el.tags || {};
  if (!t.name) return null;
  const street = [first(t, 'addr:street', 'addr:place'), first(t, 'addr:housenumber')].filter(Boolean).join(' ');
  return {
    source_id: `osm:${el.type}/${el.id}`,
    data: {
      typ,
      name: t.name.trim(),
      sportarten: t.sport ? sportLabel(t.sport) : '',
      strasse: street,
      plz: first(t, 'addr:postcode'),
      ort: first(t, 'addr:city', 'addr:town', 'addr:village', 'addr:suburb'),
      kanton,
      land: 'CH',
      telefon: first(t, 'phone', 'contact:phone', 'contact:mobile'),
      email: first(t, 'email', 'contact:email').toLowerCase(),
      website: normalizeUrl(first(t, 'website', 'contact:website', 'url')),
      facebook: socialUrl(first(t, 'contact:facebook', 'facebook'), 'https://www.facebook.com/'),
      instagram: socialUrl(first(t, 'contact:instagram', 'instagram'), 'https://www.instagram.com/'),
      beschreibung: t.description || '',
      gruendungsjahr: /^\d{4}$/.test(t.start_date || '') ? t.start_date : undefined,
      lat: el.lat ?? el.center?.lat,
      lon: el.lon ?? el.center?.lon,
    },
  };
}

/** Fetch all elements for one canton. Tries the configured endpoints in turn. */
export async function fetchCanton(kanton, typ = 'verein', log = () => {}) {
  const query = buildQuery(kanton, typ);
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const json = await postForm(endpoint, { data: query });
      const seen = new Set();
      return (json.elements || [])
        .map((el) => mapElement(el, kanton, typ))
        .filter((x) => x && !seen.has(x.source_id) && seen.add(x.source_id));
    } catch (e) {
      lastErr = e;
      log(`  ${new URL(endpoint).host}: ${e.message}`);
    }
  }
  throw lastErr;
}
