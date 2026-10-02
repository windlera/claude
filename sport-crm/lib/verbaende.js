// Nationale Sportverbände der Schweiz (Startliste, nicht abschliessend – die aktuelle
// Mitgliederliste von Swiss Olympic lässt sich zusätzlich über «Liste von Website» importieren). Wird beim Serverstart einmalig
// importiert; Adressen und Kontakte ergänzt die Website-Auswertung. Websites nur dort
// hinterlegt, wo sie bekannt sind – fehlende bitte manuell nachtragen.
// [Name, Sportart(en), Website]
const LIST = [
  // Dachorganisationen
  ['Swiss Olympic', 'Mehrsparten', 'https://www.swissolympic.ch'],
  ['Swiss Paralympic', 'Behindertensport', 'https://www.swissparalympic.ch'],
  ['PluSport Behindertensport Schweiz', 'Behindertensport', 'https://www.plusport.ch'],
  ['Special Olympics Switzerland', 'Behindertensport', 'https://www.specialolympics.ch'],
  ['Swiss University Sports', 'Hochschulsport', 'https://www.swissuniversitysports.ch'],
  ['SATUS Schweiz', 'Mehrsparten', 'https://www.satus.ch'],

  // Ballsport
  ['Schweizerischer Fussballverband (SFV)', 'Fussball', 'https://www.football.ch'],
  ['Swiss Football League (SFL)', 'Fussball', 'https://www.sfl.ch'],
  ['Swiss Ice Hockey Federation (SIHF)', 'Eishockey', 'https://www.sihf.ch'],
  ['Swiss Unihockey', 'Unihockey', 'https://www.swissunihockey.ch'],
  ['Swiss Volley', 'Volleyball, Beachvolleyball', 'https://www.volleyball.ch'],
  ['Swiss Handball', 'Handball', 'https://www.handball.ch'],
  ['Swiss Basketball', 'Basketball', 'https://www.swiss.basketball'],
  ['Swiss Tennis', 'Tennis', 'https://www.swisstennis.ch'],
  ['Swiss Table Tennis', 'Tischtennis', 'https://www.swisstabletennis.ch'],
  ['Swiss Badminton', 'Badminton', 'https://www.swiss-badminton.ch'],
  ['Swiss Squash', 'Squash', 'https://www.swisssquash.ch'],
  ['Swiss Padel', 'Padel', ''],
  ['Swiss Golf', 'Golf', 'https://www.swissgolf.ch'],
  ['Swiss Hockey (Landhockey)', 'Landhockey', 'https://www.swisshockey.ch'],
  ['Swiss Rugby (Fédération Suisse de Rugby)', 'Rugby', 'https://www.suisserugby.com'],
  ['Swiss American Football Federation (SAFV)', 'American Football', 'https://www.safv.ch'],
  ['Swiss Baseball and Softball Federation', 'Baseball, Softball', ''],
  ['Swiss Cricket', 'Cricket', ''],
  ['Swiss Faustball', 'Faustball', 'https://www.swissfaustball.ch'],
  ['Swiss Ultimate', 'Ultimate Frisbee', 'https://www.swissultimate.ch'],
  ['Swiss Tchoukball', 'Tchoukball', ''],
  ['Swiss Lacrosse', 'Lacrosse', ''],

  // Wintersport
  ['Swiss-Ski', 'Ski, Snowboard, Langlauf, Biathlon, Skispringen', 'https://www.swiss-ski.ch'],
  ['Swiss Curling', 'Curling', 'https://www.curling.ch'],
  ['Swiss Sliding (Bob, Skeleton, Rodeln)', 'Bob, Skeleton, Rodeln', 'https://www.swiss-sliding.ch'],
  ['Swiss Ice Skating', 'Eiskunstlauf, Eisschnelllauf', 'https://www.swissiceskating.ch'],

  // Leichtathletik, Ausdauer, Turnen
  ['Swiss Athletics', 'Leichtathletik', 'https://www.swiss-athletics.ch'],
  ['Schweizerischer Turnverband (STV)', 'Turnen', 'https://www.stv-fsg.ch'],
  ['Swiss Cycling', 'Radsport, Mountainbike', 'https://www.swiss-cycling.ch'],
  ['Swiss Triathlon', 'Triathlon', 'https://www.swisstriathlon.ch'],
  ['Swiss Orienteering', 'OL', 'https://www.swiss-orienteering.ch'],
  ['Schweizer Alpen-Club (SAC)', 'Bergsport, Klettern, Skitouren', 'https://www.sac-cas.ch'],

  // Wassersport
  ['Swiss Aquatics', 'Schwimmen, Wasserball, Wasserspringen, Artistic Swimming', 'https://www.swiss-aquatics.ch'],
  ['Swiss Rowing', 'Rudern', 'https://www.swissrowing.ch'],
  ['Swiss Canoe', 'Kanu', 'https://www.swisscanoe.ch'],
  ['Swiss Sailing', 'Segeln', 'https://www.swiss-sailing.ch'],
  ['Schweizer Unterwasser-Sport-Verband (SUSV)', 'Tauchen', 'https://www.susv.ch'],
  ['Schweizerische Lebensrettungs-Gesellschaft (SLRG)', 'Rettungsschwimmen', 'https://www.slrg.ch'],

  // Kampfsport
  ['Swiss Judo', 'Judo', 'https://www.swissjudo.ch'],
  ['Swiss Karate Federation', 'Karate', ''],
  ['Swiss Taekwondo', 'Taekwondo', ''],
  ['Swiss Boxing', 'Boxen', 'https://www.swissboxing.ch'],
  ['Swiss Wrestling', 'Ringen', ''],
  ['Swiss Fencing', 'Fechten', 'https://www.swiss-fencing.ch'],
  ['Swiss Weightlifting', 'Gewichtheben', ''],

  // Präzision, Denksport, Traditionssport
  ['Schweizer Schiesssportverband (SSV)', 'Schiessen', 'https://www.swissshooting.ch'],
  ['Swiss Archery', 'Bogenschiessen', 'https://www.swissarchery.org'],
  ['Schweizerischer Schachbund (SSB)', 'Schach', 'https://www.swisschess.ch'],
  ['Eidgenössischer Schwingerverband (ESV)', 'Schwingen', 'https://www.esv.ch'],
  ['Eidgenössischer Hornusserverband (EHV)', 'Hornussen', 'https://www.ehv.ch'],
  ['Swiss Minigolf', 'Minigolf', ''],
  ['Fédération Suisse de Pétanque', 'Pétanque', ''],

  // Pferde-, Motor- und Luftsport
  ['Swiss Equestrian (Schweizerischer Verband für Pferdesport)', 'Reitsport', 'https://www.swiss-equestrian.ch'],
  ['Auto Sport Schweiz', 'Motorsport', 'https://www.autosport.ch'],
  ['Swiss Moto (FMS)', 'Motorradsport', 'https://www.swissmoto.org'],
  ['Aero-Club der Schweiz (AeCS)', 'Flugsport, Segelflug, Modellflug', 'https://www.aeroclub.ch'],
  ['Schweizerischer Hängegleiter-Verband (SHV)', 'Gleitschirm, Delta', 'https://www.shv-fsvl.ch'],

];

export const VERBAENDE_VERSION = 1;

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const VERBAENDE = LIST.map(([name, sportarten, website]) => ({
  source_id: `verband:${slug(name)}`,
  data: { typ: 'verband', name, sportarten, website, land: 'CH', tags: 'National' },
}));

/** Import the federation list once per list version. Returns number of new entries. */
export function seedVerbaende(store) {
  if (Number(store.getSetting('verbaende_version') || 0) >= VERBAENDE_VERSION) return 0;
  let neu = 0;
  store.transaction(() => {
    for (const { source_id, data } of VERBAENDE) {
      if (store.upsertImported(data, { quelle: 'verbandsliste', source_id }).result === 'neu') neu++;
    }
    store.setSetting('verbaende_version', String(VERBAENDE_VERSION));
  });
  return neu;
}
