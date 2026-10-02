// Background import jobs (run one after another, progress stored in the DB).
import { CANTONS } from './constants.js';
import { fetchCanton } from './osm.js';
import { scrapeWebsite } from './enrich.js';

export class JobRunner {
  constructor(store, { osmFetch = fetchCanton, scrape = scrapeWebsite } = {}) {
    this.store = store;
    this.osmFetch = osmFetch;
    this.scrape = scrape;
    this.queue = [];
    this.running = null;
    this.cancelled = new Set();
    store.failStaleJobs();
  }

  start(typ, params) {
    if (!['osm', 'enrich'].includes(typ)) throw new Error(`Unbekannter Job-Typ: ${typ}`);
    if (typ === 'osm') {
      const kantone = (params.kantone?.length ? params.kantone : Object.keys(CANTONS)).filter((k) => CANTONS[k]);
      if (!kantone.length) throw new Error('Keine gültigen Kantone gewählt');
      params = { kantone, typ: params.typ === 'agentur' ? 'agentur' : 'verein' };
    }
    const id = this.store.createJob(typ, params);
    this.store.updateJob(id, { status: 'wartet' });
    this.queue.push({ id, typ, params });
    this.#next();
    return id;
  }

  cancel(id) {
    const job = this.store.getJob(id);
    if (!job || !['laeuft', 'wartet'].includes(job.status)) return false;
    this.cancelled.add(Number(id));
    const idx = this.queue.findIndex((j) => j.id === Number(id));
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      this.store.updateJob(id, { status: 'abgebrochen', finished_at: new Date().toISOString() });
    }
    return true;
  }

  /** Resolves when the queue is empty (used by tests). */
  async idle() {
    while (this.running || this.queue.length) await this.running;
  }

  #next() {
    if (this.running || !this.queue.length) return;
    const job = this.queue.shift();
    this.running = this.#run(job).finally(() => {
      this.running = null;
      this.#next();
    });
  }

  async #run({ id, typ, params }) {
    const log = (line) => this.store.appendJobLog(id, line);
    const counts = { neu: 0, aktualisiert: 0, fehler: 0 };
    this.store.updateJob(id, { status: 'laeuft' });
    try {
      if (typ === 'osm') await this.#runOsm(id, params, counts, log);
      else await this.#runEnrich(id, params, counts, log);
      const status = this.cancelled.has(id) ? 'abgebrochen' : 'fertig';
      this.store.updateJob(id, { status, ...counts, finished_at: new Date().toISOString() });
      log(`${status === 'fertig' ? 'Fertig' : 'Abgebrochen'}: ${counts.neu} neu, ${counts.aktualisiert} aktualisiert, ${counts.fehler} Fehler`);
    } catch (e) {
      log(`Abbruch: ${e.message}`);
      this.store.updateJob(id, { status: 'fehler', ...counts, finished_at: new Date().toISOString() });
    } finally {
      this.cancelled.delete(id);
    }
  }

  async #runOsm(id, { kantone, typ }, counts, log) {
    for (const [i, kanton] of kantone.entries()) {
      if (this.cancelled.has(id)) return;
      this.store.updateJob(id, { fortschritt: `${i + 1}/${kantone.length} (${kanton})` });
      let items;
      try {
        items = await this.osmFetch(kanton, typ, log);
      } catch (e) {
        counts.fehler++;
        log(`${kanton}: Fehler – ${e.message}`);
        continue;
      }
      let neu = 0;
      let akt = 0;
      this.store.transaction(() => {
        for (const { source_id, data } of items) {
          const { result } = this.store.upsertImported(data, { quelle: 'osm', source_id });
          if (result === 'neu') neu++;
          else if (result === 'aktualisiert') akt++;
        }
      });
      counts.neu += neu;
      counts.aktualisiert += akt;
      this.store.updateJob(id, counts);
      log(`${kanton}: ${items.length} gefunden, ${neu} neu, ${akt} aktualisiert`);
    }
  }

  async #runEnrich(id, params, counts, log) {
    const orgs = this.store.orgsToEnrich(params);
    log(`${orgs.length} Websites werden analysiert`);
    for (const [i, org] of orgs.entries()) {
      if (this.cancelled.has(id)) return;
      this.store.updateJob(id, { fortschritt: `${i + 1}/${orgs.length}` });
      try {
        const { data } = await this.scrape(org.website, { log });
        // Website enrichment only fills empty fields, never overwrites existing data.
        const r = this.store.mergeInto(org.id, data, { onlyEmpty: true, enriched: true });
        if (r === 'aktualisiert') counts.aktualisiert++;
        log(`${org.name}: ${r === 'aktualisiert' ? 'ergänzt' : 'nichts Neues'}`);
      } catch (e) {
        counts.fehler++;
        this.store.mergeInto(org.id, {}, { enriched: true });
        log(`${org.name}: ${e.message}`);
      }
      this.store.updateJob(id, counts);
    }
  }
}
