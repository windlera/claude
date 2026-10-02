export const CANTONS = {
  AG: 'Aargau', AI: 'Appenzell Innerrhoden', AR: 'Appenzell Ausserrhoden', BE: 'Bern',
  BL: 'Basel-Landschaft', BS: 'Basel-Stadt', FR: 'Freiburg', GE: 'Genf', GL: 'Glarus',
  GR: 'Graubünden', JU: 'Jura', LU: 'Luzern', NE: 'Neuenburg', NW: 'Nidwalden',
  OW: 'Obwalden', SG: 'St. Gallen', SH: 'Schaffhausen', SO: 'Solothurn', SZ: 'Schwyz',
  TG: 'Thurgau', TI: 'Tessin', UR: 'Uri', VD: 'Waadt', VS: 'Wallis', ZG: 'Zug', ZH: 'Zürich',
};

export const ORG_TYPES = { verein: 'Sportverein', agentur: 'Agentur', verband: 'Verband' };

export const ORG_STATUS = {
  neu: 'Neu', aktiv: 'In Bearbeitung', kunde: 'Kunde', partner: 'Partner', inaktiv: 'Inaktiv',
};

export const LEAD_PHASES = {
  neu: 'Neu', kontaktiert: 'Kontaktiert', qualifiziert: 'Qualifiziert', angebot: 'Angebot',
  verhandlung: 'Verhandlung', gewonnen: 'Gewonnen', verloren: 'Verloren',
};

export const ACTIVITY_TYPES = { notiz: 'Notiz', anruf: 'Anruf', email: 'E-Mail', meeting: 'Meeting', aufgabe: 'Aufgabe' };

// OSM sport=* values → German display names (unknown values are passed through).
export const SPORTS = {
  soccer: 'Fussball', tennis: 'Tennis', ice_hockey: 'Eishockey', field_hockey: 'Landhockey',
  floorball: 'Unihockey', handball: 'Handball', volleyball: 'Volleyball', beachvolleyball: 'Beachvolleyball',
  basketball: 'Basketball', athletics: 'Leichtathletik', running: 'Laufsport', swimming: 'Schwimmen',
  gymnastics: 'Turnen', skiing: 'Ski', 'ski_jumping': 'Skispringen', cross_country_skiing: 'Langlauf',
  climbing: 'Klettern', climbing_adventure: 'Klettern', cycling: 'Radsport', mtb: 'Mountainbike',
  golf: 'Golf', shooting: 'Schiessen', archery: 'Bogenschiessen', curling: 'Curling',
  table_tennis: 'Tischtennis', badminton: 'Badminton', squash: 'Squash', equestrian: 'Reitsport',
  horse_racing: 'Pferderennen', rowing: 'Rudern', canoe: 'Kanu', sailing: 'Segeln', diving: 'Tauchen',
  scuba_diving: 'Tauchen', water_polo: 'Wasserball', rugby_union: 'Rugby', rugby: 'Rugby',
  american_football: 'American Football', baseball: 'Baseball', softball: 'Softball', cricket: 'Cricket',
  boxing: 'Boxen', judo: 'Judo', karate: 'Karate', taekwondo: 'Taekwondo', martial_arts: 'Kampfsport',
  wrestling: 'Ringen', schwingen: 'Schwingen', swiss_wrestling: 'Schwingen', fencing: 'Fechten',
  weightlifting: 'Gewichtheben', fitness: 'Fitness', multi: 'Mehrsparten', skating: 'Eislaufen',
  figure_skating: 'Eiskunstlauf', ice_skating: 'Eislaufen', inline_hockey: 'Inlinehockey',
  roller_skating: 'Rollsport', skateboard: 'Skateboard', bowling: 'Bowling', '9pin': 'Kegeln',
  '10pin': 'Bowling', billiards: 'Billard', chess: 'Schach', orienteering: 'OL',
  hornussen: 'Hornussen', hornuss: 'Hornussen', dog_agility: 'Hundesport', motor: 'Motorsport',
  motocross: 'Motocross', karting: 'Kart', model_aerodrome: 'Modellflug', free_flying: 'Gleitschirm',
  paragliding: 'Gleitschirm', gliding: 'Segelflug', aviation: 'Flugsport', triathlon: 'Triathlon',
  boules: 'Boule', petanque: 'Pétanque', yoga: 'Yoga', dance: 'Tanzsport', padel: 'Padel',
  ultimate: 'Ultimate Frisbee', disc_golf: 'Discgolf', korfball: 'Korbball', faustball: 'Faustball',
  fistball: 'Faustball', bobsleigh: 'Bob', luge: 'Rodeln', biathlon: 'Biathlon', snowboard: 'Snowboard',
  water_ski: 'Wasserski', surfing: 'Surfen', kitesurfing: 'Kitesurfen', windsurfing: 'Windsurfen',
};

export function sportLabel(value) {
  return value
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => SPORTS[s] || s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()))
    .filter((s, i, a) => a.indexOf(s) === i)
    .join(', ');
}

// Fields of an organisation that can be edited / imported.
export const ORG_FIELDS = [
  'typ', 'name', 'sportarten', 'verband', 'strasse', 'plz', 'ort', 'kanton', 'land',
  'telefon', 'email', 'website', 'facebook', 'instagram', 'linkedin', 'mitglieder',
  'gruendungsjahr', 'beschreibung', 'notizen', 'tags', 'status', 'lat', 'lon',
];
