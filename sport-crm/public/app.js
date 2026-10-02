// Sport-CRM frontend (no build step, plain ES modules).

const view = document.getElementById('view');
const modalRoot = document.getElementById('modal-root');
let META = null;
let pollTimer = null;

// ---------- helpers ----------

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chf = (n) => (n == null || n === '' ? '–' : `CHF ${Number(n).toLocaleString('de-CH', { maximumFractionDigits: 0 })}`);
const date = (s) => (s ? new Date(s.replace(' ', 'T') + (s.length > 10 && !s.endsWith('Z') ? 'Z' : '')).toLocaleDateString('de-CH') : '');
const today = () => new Date().toISOString().slice(0, 10);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
const link = (u, label) => (safeUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label || u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : '');

async function api(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.headers || {}) } };
  if (opts.json !== undefined) {
    init.body = JSON.stringify(opts.json);
    init.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Fehler ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show${isError ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.className = ''; }, isError ? 5000 : 2500);
}

const options = (obj, selected, empty) =>
  (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
  Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}"${k === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');

function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}

function openModal(html, { narrow = false } = {}) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal${narrow ? ' narrow' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const backdrop = modalRoot.firstElementChild;
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeModal(); });
  backdrop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
  backdrop.querySelector('input, select, textarea')?.focus();
  return backdrop.querySelector('.modal');
}
function closeModal() { modalRoot.innerHTML = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function confirmDialog(text) {
  return new Promise((resolve) => {
    const m = openModal(`<h2>Bestätigen</h2><p>${esc(text)}</p>
      <div class="modal-foot"><button data-close>Abbrechen</button><button class="primary" id="ok">Löschen</button></div>`, { narrow: true });
    m.querySelector('#ok').addEventListener('click', () => { closeModal(); resolve(true); });
    m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => resolve(false)));
  });
}

// ---------- router ----------

const routes = [
  [/^\/$/, renderDashboard],
  [/^\/orgs$/, renderOrgs],
  [/^\/orgs\/(\d+)$/, renderOrg],
  [/^\/leads$/, renderLeads],
  [/^\/import$/, renderImport],
];

async function router() {
  clearInterval(pollTimer);
  closeModal();
  const [path, query = ''] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(query);
  const navKey = path === '/' ? 'dashboard' : path === '/orgs' ? (params.get('typ') || 'orgs') : path.split('/')[1];
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try {
        META = await api('/api/meta');
        await fn(params, ...m.slice(1));
      } catch (e) {
        view.innerHTML = `<div class="card empty">${esc(e.message)}</div>`;
      }
      return;
    }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', router);

function setQuery(params) {
  const [path] = location.hash.slice(1).split('?');
  const qs = new URLSearchParams([...params].filter(([, v]) => v !== '' && v !== null)).toString();
  history.replaceState(null, '', `#${path}${qs ? `?${qs}` : ''}`);
}

// ---------- dashboard ----------

async function renderDashboard() {
  const s = await api('/api/stats');
  const byTyp = Object.fromEntries(s.orgs.map((r) => [r.typ, r.n]));
  const pipe = Object.fromEntries(s.pipeline.map((r) => [r.phase, r]));
  const offen = s.pipeline.filter((r) => !['gewonnen', 'verloren'].includes(r.phase));
  const maxK = Math.max(1, ...s.kantone.map((k) => k.n));
  view.innerHTML = `
    <div class="page-head"><h1>Übersicht</h1>
      <div class="actions"><button class="primary" id="new-org">+ Organisation</button><button id="new-lead">+ Lead</button></div></div>
    <div class="grid kpis">
      <div class="card kpi"><div class="lbl">Sportvereine</div><div class="val">${(byTyp.verein || 0).toLocaleString('de-CH')}</div></div>
      <div class="card kpi"><div class="lbl">Agenturen</div><div class="val">${(byTyp.agentur || 0).toLocaleString('de-CH')}</div></div>
      <div class="card kpi"><div class="lbl">Verbände</div><div class="val">${(byTyp.verband || 0).toLocaleString('de-CH')}</div></div>
      <div class="card kpi"><div class="lbl">Mit E-Mail</div><div class="val">${s.total ? Math.round((s.mitEmail / s.total) * 100) : 0}%</div><div class="muted small">${s.mitEmail} von ${s.total}</div></div>
      <div class="card kpi"><div class="lbl">Offene Leads</div><div class="val">${offen.reduce((a, r) => a + r.n, 0)}</div><div class="muted small">${chf(offen.reduce((a, r) => a + r.wert, 0))}</div></div>
      <div class="card kpi"><div class="lbl">Gewonnen</div><div class="val">${pipe.gewonnen?.n || 0}</div><div class="muted small">${chf(pipe.gewonnen?.wert || 0)}</div></div>
    </div>
    <div class="grid two">
      <div class="card"><h2>Fällige Leads (nächste 7 Tage)</h2>
        ${s.faellig.length ? s.faellig.map((l) => `<div class="list-item">
          <a href="#/orgs/${l.org_id}"><strong>${esc(l.titel)}</strong></a> · ${esc(l.org_name)}
          <div class="small ${l.faellig_am < today() ? '' : 'muted'}" style="${l.faellig_am < today() ? 'color:var(--accent)' : ''}">
            ${date(l.faellig_am)} – ${esc(l.naechster_schritt || META.phasen[l.phase])}</div></div>`).join('') : '<div class="empty">Keine fälligen Leads</div>'}
      </div>
      <div class="card"><h2>Lead-Pipeline</h2>
        ${Object.entries(META.phasen).map(([k, v]) => `<div class="bar"><span style="width:100px">${esc(v)}</span>
          <span class="pill ${k}">${pipe[k]?.n || 0}</span><span class="n">${chf(pipe[k]?.wert || 0)}</span></div>`).join('')}
      </div>
      <div class="card"><h2>Organisationen pro Kanton</h2>
        ${s.kantone.length ? s.kantone.map((k) => `<div class="bar"><a class="l" href="#/orgs?kanton=${esc(k.kanton)}">${esc(k.kanton)}</a>
          <span class="b" style="width:${Math.max(2, (k.n / maxK) * 260)}px"></span><span class="n">${k.n}</span></div>`).join('')
          : '<div class="empty">Noch keine Daten. <a href="#/import">Jetzt Vereine sammeln →</a></div>'}
      </div>
      <div class="card"><h2>Letzte Aktivitäten</h2>
        ${s.aktivitaeten.length ? s.aktivitaeten.map((a) => `<div class="list-item"><span class="pill">${esc(META.aktivitaeten[a.typ] || a.typ)}</span>
          <a href="#/orgs/${a.org_id}">${esc(a.org_name)}</a> <span class="muted small">${date(a.datum)}</span><div>${esc(a.text)}</div></div>`).join('')
          : '<div class="empty">Noch keine Aktivitäten</div>'}
      </div>
    </div>`;
  view.querySelector('#new-org').addEventListener('click', () => orgForm({}));
  view.querySelector('#new-lead').addEventListener('click', () => leadForm({}));
}

// ---------- organisation list ----------

async function renderOrgs(params) {
  const f = {
    q: params.get('q') || '', typ: params.get('typ') || '', kanton: params.get('kanton') || '', sport: params.get('sport') || '',
    status: params.get('status') || '', sort: params.get('sort') || 'name', offset: Number(params.get('offset')) || 0,
    ohneKontakt: params.get('ohneKontakt') || '', hatLeads: params.get('hatLeads') || '',
  };
  const title = f.typ ? { verein: 'Sportvereine', agentur: 'Agenturen', verband: 'Verbände' }[f.typ] : 'Alle Organisationen';
  view.innerHTML = `
    <div class="page-head"><h1>${esc(title)}</h1><span class="sub" id="count"></span>
      <div class="actions">
        <button id="export">CSV exportieren</button>
        <button id="from-url">Aus Website erfassen</button>
        <button class="primary" id="new">+ Neu</button>
      </div></div>
    <form class="filters" id="filters">
      <input type="search" name="q" placeholder="Suche: Name, Ort, PLZ, E-Mail, Sport …" value="${esc(f.q)}">
      <select name="typ">${options(META.typen, f.typ, 'Alle Typen')}</select>
      <select name="kanton">${options(Object.fromEntries(Object.entries(META.kantone).map(([k, v]) => [k, `${k} – ${v}`])), f.kanton, 'Alle Kantone')}</select>
      <select name="sport"><option value="">Alle Sportarten</option>${META.sportarten.slice(0, 150).map((s) => `<option${s.name === f.sport ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <select name="status">${options(META.status, f.status, 'Alle Status')}</select>
      <select name="sort">${options({ name: 'Sortierung: Name', ort: 'Ort', kanton: 'Kanton', neueste: 'Neueste', geaendert: 'Zuletzt geändert' }, f.sort)}</select>
      <label class="check"><input type="checkbox" name="ohneKontakt" value="1"${f.ohneKontakt ? ' checked' : ''}> ohne E-Mail/Tel.</label>
      <label class="check"><input type="checkbox" name="hatLeads" value="1"${f.hatLeads ? ' checked' : ''}> mit Leads</label>
    </form>
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Typ</th><th>Sportart</th><th>Ort</th><th>Kt.</th><th>Kontakt</th><th>Status</th><th>Leads</th></tr></thead>
      <tbody id="rows"><tr><td colspan="8" class="empty">Laden …</td></tr></tbody></table></div>
    <div class="pager" id="pager"></div>`;

  const form = view.querySelector('#filters');
  const limit = 50;
  const load = async () => {
    const fd = formData(form);
    Object.assign(f, fd, { ohneKontakt: fd.ohneKontakt ? '1' : '', hatLeads: fd.hatLeads ? '1' : '' });
    const qs = new URLSearchParams({ ...f, limit });
    setQuery(new URLSearchParams(Object.entries(f).filter(([k, v]) => v && !(k === 'sort' && v === 'name') && !(k === 'offset' && v === 0))));
    const { total, rows } = await api(`/api/orgs?${qs}`);
    view.querySelector('#count').textContent = `${total.toLocaleString('de-CH')} Einträge`;
    view.querySelector('#rows').innerHTML = rows.length ? rows.map((o) => `
      <tr class="clickable" data-id="${o.id}">
        <td><strong>${esc(o.name)}</strong>${o.website ? `<div class="small muted">${esc(o.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</div>` : ''}</td>
        <td><span class="pill ${esc(o.typ)}">${esc(META.typen[o.typ] || o.typ)}</span></td>
        <td class="small">${esc(o.sportarten)}</td>
        <td class="nowrap">${esc([o.plz, o.ort].filter(Boolean).join(' '))}</td>
        <td>${esc(o.kanton)}</td>
        <td class="small">${esc(o.email)}${o.email && o.telefon ? '<br>' : ''}${esc(o.telefon)}</td>
        <td><span class="pill ${esc(o.status)}">${esc(META.status[o.status] || o.status)}</span></td>
        <td>${o.offene_leads ? `<span class="pill aktiv">${o.offene_leads}</span>` : ''}</td>
      </tr>`).join('') : `<tr><td colspan="8" class="empty">Keine Einträge gefunden. <a href="#/import">Daten sammeln</a> oder <a href="#" id="empty-new">neu erfassen</a>.</td></tr>`;
    view.querySelector('#empty-new')?.addEventListener('click', (e) => { e.preventDefault(); orgForm({ typ: f.typ || 'verein' }); });
    const pages = Math.ceil(total / limit);
    const page = Math.floor(f.offset / limit) + 1;
    view.querySelector('#pager').innerHTML = pages > 1 ? `<span>Seite ${page} von ${pages}</span>
      <span><button id="prev"${page <= 1 ? ' disabled' : ''}>← Zurück</button> <button id="next"${page >= pages ? ' disabled' : ''}>Weiter →</button></span>` : '';
    view.querySelector('#prev')?.addEventListener('click', () => { f.offset = Math.max(0, f.offset - limit); load(); });
    view.querySelector('#next')?.addEventListener('click', () => { f.offset += limit; load(); });
  };
  let t;
  form.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { f.offset = 0; load(); }, e.target.type === 'search' ? 250 : 0); });
  form.addEventListener('submit', (e) => e.preventDefault());
  view.querySelector('#rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr && !e.target.closest('a')) location.hash = `#/orgs/${tr.dataset.id}`;
  });
  view.querySelector('#new').addEventListener('click', () => orgForm({ typ: f.typ || 'verein', kanton: f.kanton }));
  view.querySelector('#from-url').addEventListener('click', () => urlCaptureDialog(f.typ || 'verein'));
  view.querySelector('#export').addEventListener('click', () => {
    const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && k !== 'offset'));
    location.href = `/api/export.csv?${qs}`;
  });
  await load();
}

// ---------- organisation form ----------

function orgForm(org, { onSaved } = {}) {
  const v = (k) => esc(org[k] ?? '');
  const m = openModal(`
    <h2>${org.id ? 'Organisation bearbeiten' : 'Neue Organisation'}</h2>
    <form id="org-form" class="form-grid">
      <label class="wide">Name *<input name="name" required value="${v('name')}"></label>
      <label>Typ<select name="typ">${options(META.typen, org.typ || 'verein')}</select></label>
      <label>Status<select name="status">${options(META.status, org.status || 'neu')}</select></label>
      <label>Sportart(en)<input name="sportarten" value="${v('sportarten')}" placeholder="z.B. Fussball, Unihockey" list="sport-list"></label>
      <label>Verband<input name="verband" value="${v('verband')}" placeholder="z.B. SFV, Swiss Unihockey"></label>
      <label class="wide">Strasse<input name="strasse" value="${v('strasse')}"></label>
      <label>PLZ<input name="plz" value="${v('plz')}" inputmode="numeric" maxlength="4"></label>
      <label>Ort<input name="ort" value="${v('ort')}"></label>
      <label>Kanton<select name="kanton">${options(META.kantone, org.kanton || '', '–')}</select></label>
      <label>Telefon<input name="telefon" value="${v('telefon')}" type="tel"></label>
      <label>E-Mail<input name="email" value="${v('email')}" type="email"></label>
      <label>Website<input name="website" value="${v('website')}" placeholder="https://"></label>
      <label>Facebook<input name="facebook" value="${v('facebook')}"></label>
      <label>Instagram<input name="instagram" value="${v('instagram')}"></label>
      <label>LinkedIn<input name="linkedin" value="${v('linkedin')}"></label>
      <label>Mitglieder<input name="mitglieder" value="${v('mitglieder')}" type="number" min="0"></label>
      <label>Gründungsjahr<input name="gruendungsjahr" value="${v('gruendungsjahr')}" type="number" min="1800" max="2100"></label>
      <label>Tags<input name="tags" value="${v('tags')}" placeholder="kommagetrennt"></label>
      <label class="wide">Beschreibung<textarea name="beschreibung">${v('beschreibung')}</textarea></label>
      <label class="wide">Interne Notizen<textarea name="notizen">${v('notizen')}</textarea></label>
      <datalist id="sport-list">${META.sportarten.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist>
    </form>
    <div class="modal-foot"><button data-close>Abbrechen</button><button class="primary" id="save">Speichern</button></div>`);
  const form = m.querySelector('#org-form');
  const save = async () => {
    if (!form.reportValidity()) return;
    const data = formData(form);
    try {
      let saved;
      if (org.id) saved = await api(`/api/orgs/${org.id}`, { method: 'PUT', json: data });
      else saved = await api('/api/orgs', { method: 'POST', json: { ...data, quelle: org.quelle } });
      closeModal();
      toast('Gespeichert');
      if (onSaved) onSaved(saved);
      else location.hash = `#/orgs/${saved.id}`;
    } catch (e) {
      if (e.status === 409) {
        const id = e.message.match(/ID (\d+)/)?.[1];
        const mm = openModal(`<h2>Mögliches Duplikat</h2><p>${esc(e.message)}.</p>
          <div class="modal-foot"><a class="btn" href="#/orgs/${id}">Bestehenden öffnen</a><button class="primary" id="force">Trotzdem anlegen</button></div>`, { narrow: true });
        mm.querySelector('#force').addEventListener('click', () => {
          api('/api/orgs', { method: 'POST', json: { ...data, quelle: org.quelle, force: true } })
            .then((saved) => { closeModal(); toast('Gespeichert'); if (onSaved) onSaved(saved); else location.hash = `#/orgs/${saved.id}`; })
            .catch((err) => toast(err.message, true));
        });
      } else toast(e.message, true);
    }
  };
  m.querySelector('#save').addEventListener('click', () => save());
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
}

function urlCaptureDialog(typ) {
  const m = openModal(`<h2>Organisation aus Website erfassen</h2>
    <p class="muted">Die Website (inkl. Kontakt- und Impressum-Seite) wird gelesen und die gefundenen Angaben als Vorschlag ins Formular übernommen.</p>
    <form id="u"><label>Website-Adresse<input name="url" placeholder="https://www.fc-beispiel.ch" required></label></form>
    <div class="modal-foot"><button data-close>Abbrechen</button><button class="primary" id="go">Website lesen</button></div>`, { narrow: true });
  const go = async () => {
    const form = m.querySelector('#u');
    if (!form.reportValidity()) return;
    const btn = m.querySelector('#go');
    btn.disabled = true;
    btn.textContent = 'Lese Website …';
    try {
      const r = await api('/api/scrape-url', { method: 'POST', json: { url: form.url.value.trim() } });
      if (r.duplikat) toast(`Hinweis: Diese Website ist bereits bei ID ${r.duplikat} erfasst`, true);
      orgForm({ typ, quelle: 'web', ...r.data });
    } catch (e) {
      toast(e.message, true);
      btn.disabled = false;
      btn.textContent = 'Website lesen';
    }
  };
  m.querySelector('#go').addEventListener('click', go);
  m.querySelector('#u').addEventListener('submit', (e) => { e.preventDefault(); go(); });
}

// ---------- organisation detail ----------

async function renderOrg(_params, id) {
  const o = await api(`/api/orgs/${id}`);
  const manual = new Set(o.manual_fields);
  const fact = (label, key, html) => {
    const val = html ?? esc(o[key]);
    if (!val) return '';
    const lock = manual.has(key) ? ` <span class="pill manual" data-release="${key}" title="Manuell gepflegt – wird von Importen nicht überschrieben. Klicken, um den Schutz aufzuheben.">manuell</span>` : '';
    return `<dt>${label}</dt><dd>${val}${lock}</dd>`;
  };
  const addr = [o.strasse, [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>');
  const contactsById = Object.fromEntries(o.contacts.map((c) => [c.id, c]));
  view.innerHTML = `
    <div class="page-head">
      <div><a href="#/orgs?typ=${esc(o.typ)}" class="small">← ${esc(META.typen[o.typ] || 'Organisationen')}</a>
        <h1>${esc(o.name)}</h1>
        <div class="chips" style="margin-top:6px"><span class="pill ${esc(o.typ)}">${esc(META.typen[o.typ])}</span>
          <span class="pill ${esc(o.status)}">${esc(META.status[o.status])}</span>
          ${o.tags ? o.tags.split(',').map((t) => `<span class="pill">${esc(t.trim())}</span>`).join('') : ''}</div></div>
      <div class="actions">
        ${o.website ? '<button id="enrich" title="Website lesen und leere Felder ergänzen">Web-Daten ergänzen</button>' : ''}
        <button id="edit" class="primary">Bearbeiten</button><button id="del" class="danger">Löschen</button></div>
    </div>
    <div class="detail">
      <div class="grid">
        <div class="card"><h2>Stammdaten</h2><dl class="facts">
          ${fact('Sportart(en)', 'sportarten')}${fact('Verband', 'verband')}
          ${fact('Adresse', 'strasse', addr)}${fact('Kanton', 'kanton', o.kanton ? esc(`${o.kanton} – ${META.kantone[o.kanton] || ''}`) : '')}
          ${fact('Telefon', 'telefon', o.telefon ? `<a href="tel:${esc(o.telefon.replace(/\s/g, ''))}">${esc(o.telefon)}</a>` : '')}
          ${fact('E-Mail', 'email', o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : '')}
          ${fact('Website', 'website', link(o.website))}${fact('Facebook', 'facebook', link(o.facebook))}
          ${fact('Instagram', 'instagram', link(o.instagram))}${fact('LinkedIn', 'linkedin', link(o.linkedin))}
          ${fact('Mitglieder', 'mitglieder')}${fact('Gegründet', 'gruendungsjahr')}
          ${fact('Beschreibung', 'beschreibung')}${fact('Notizen', 'notizen', o.notizen ? esc(o.notizen).replace(/\n/g, '<br>') : '')}
          ${o.lat ? `<dt>Karte</dt><dd><a href="https://www.openstreetmap.org/?mlat=${o.lat}&mlon=${o.lon}#map=17/${o.lat}/${o.lon}" target="_blank" rel="noopener">auf Karte zeigen</a></dd>` : ''}
          <dt>Quelle</dt><dd class="muted small">${esc(o.quelle)}${o.source_id?.startsWith('osm:') ? ` · <a href="https://www.openstreetmap.org/${esc(o.source_id.slice(4))}" target="_blank" rel="noopener">OSM-Objekt</a>` : ''}
            · erfasst ${date(o.created_at)} · geändert ${date(o.updated_at)}${o.enriched_at ? ` · Web gelesen ${date(o.enriched_at)}` : ''}</dd>
        </dl></div>
        <div class="card"><div class="section-head"><h2>Leads</h2><button id="add-lead" class="small">+ Lead</button></div>
          ${o.leads.length ? o.leads.map((l) => `<div class="list-item" data-lead="${l.id}">
            <div style="display:flex;gap:8px;align-items:center"><strong>${esc(l.titel)}</strong><span class="pill ${esc(l.phase)}">${esc(META.phasen[l.phase])}</span>
              <span class="muted small" style="margin-left:auto">${chf(l.wert)}</span><button class="small" data-edit-lead="${l.id}">Bearbeiten</button></div>
            <div class="small muted">${[l.naechster_schritt, l.faellig_am && `fällig ${date(l.faellig_am)}`, l.verantwortlich, contactsById[l.contact_id] && `Kontakt: ${contactsById[l.contact_id].vorname} ${contactsById[l.contact_id].nachname}`].filter(Boolean).map(esc).join(' · ')}</div>
          </div>`).join('') : '<div class="muted">Noch keine Leads</div>'}
        </div>
        <div class="card"><div class="section-head"><h2>Aktivitäten</h2></div>
          <form id="act-form" style="display:grid;grid-template-columns:120px 1fr auto;gap:8px;margin-bottom:10px">
            <select name="typ">${options(META.aktivitaeten, 'notiz')}</select>
            <input name="text" placeholder="Notiz, Anruf, E-Mail festhalten …" required>
            <button class="primary">Erfassen</button>
            ${o.leads.length ? `<select name="lead_id" style="grid-column:1/-1">${options(Object.fromEntries(o.leads.map((l) => [l.id, `Lead: ${l.titel}`])), '', 'ohne Lead-Bezug')}</select>` : ''}
          </form>
          <div class="timeline">${o.activities.map((a) => `<div class="list-item">
            <span class="small muted">${date(a.datum)}</span>
            <div><span class="pill">${esc(META.aktivitaeten[a.typ] || a.typ)}</span> ${a.lead_titel ? `<span class="small muted">${esc(a.lead_titel)}</span>` : ''}<div>${esc(a.text)}</div></div>
            <button class="link small" data-del-act="${a.id}" title="Löschen">✕</button></div>`).join('') || '<div class="muted">Noch keine Aktivitäten</div>'}</div>
        </div>
      </div>
      <div class="card"><div class="section-head"><h2>Ansprechpersonen</h2><button id="add-contact" class="small">+ Kontakt</button></div>
        ${o.contacts.length ? o.contacts.map((c) => `<div class="list-item">
          <div style="display:flex;gap:6px"><strong>${esc(`${c.vorname} ${c.nachname}`.trim() || '(ohne Name)')}</strong>
            <span style="margin-left:auto"><button class="small" data-edit-contact="${c.id}">Bearbeiten</button></span></div>
          ${c.funktion ? `<div class="muted small">${esc(c.funktion)}</div>` : ''}
          ${c.email ? `<div><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}
          ${c.telefon ? `<div><a href="tel:${esc(c.telefon.replace(/\s/g, ''))}">${esc(c.telefon)}</a></div>` : ''}
          ${c.notizen ? `<div class="small">${esc(c.notizen)}</div>` : ''}</div>`).join('') : '<div class="muted">Noch keine Kontakte erfasst</div>'}
      </div>
    </div>`;

  const reload = () => renderOrg(_params, id);
  view.querySelector('#edit').addEventListener('click', () => orgForm(o, { onSaved: reload }));
  view.querySelector('#del').addEventListener('click', async () => {
    if (!(await confirmDialog(`«${o.name}» inkl. Kontakten, Leads und Aktivitäten löschen?`))) return;
    await api(`/api/orgs/${o.id}`, { method: 'DELETE' });
    toast('Gelöscht');
    location.hash = `#/orgs?typ=${o.typ}`;
  });
  view.querySelector('#enrich')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Lese Website …';
    try {
      const r = await api(`/api/orgs/${o.id}/enrich`, { method: 'POST' });
      const g = r.gefunden;
      openModal(`<h2>Ergebnis Website-Analyse</h2>
        <p>${r.result === 'aktualisiert' ? 'Leere Felder wurden ergänzt.' : 'Keine neuen Angaben für leere Felder gefunden.'} Bestehende Daten wurden nicht überschrieben.</p>
        <dl class="facts"><dt>Seiten gelesen</dt><dd>${g.pages}</dd>
          <dt>E-Mails</dt><dd>${g.emails.map(esc).join('<br>') || '–'}</dd>
          <dt>Telefon</dt><dd>${g.phones.map(esc).join('<br>') || '–'}</dd>
          <dt>Social Media</dt><dd>${[g.data.facebook, g.data.instagram, g.data.linkedin].filter(Boolean).map((u) => link(u)).join('<br>') || '–'}</dd>
          <dt>Adresse</dt><dd>${esc([g.data.strasse, g.data.plz, g.data.ort].filter(Boolean).join(', ')) || '–'}</dd></dl>
        <div class="modal-foot"><button class="primary" data-close>OK</button></div>`, { narrow: true });
      modalRoot.querySelector('[data-close]').addEventListener('click', reload);
    } catch (err) {
      toast(err.message, true);
      e.target.disabled = false;
      e.target.textContent = 'Web-Daten ergänzen';
    }
  });
  view.querySelectorAll('[data-release]').forEach((el) => el.addEventListener('click', async () => {
    await api(`/api/orgs/${o.id}/release`, { method: 'POST', json: { field: el.dataset.release } });
    toast('Feld wird bei künftigen Importen wieder aktualisiert');
    reload();
  }));
  view.querySelector('#add-contact').addEventListener('click', () => contactForm({ org_id: o.id }, reload));
  view.querySelectorAll('[data-edit-contact]').forEach((b) => b.addEventListener('click', () => contactForm(contactsById[b.dataset.editContact], reload)));
  view.querySelector('#add-lead').addEventListener('click', () => leadForm({ org_id: o.id, org_name: o.name }, { contacts: o.contacts, onSaved: reload }));
  view.querySelectorAll('[data-edit-lead]').forEach((b) => b.addEventListener('click', () => {
    const l = o.leads.find((x) => x.id === Number(b.dataset.editLead));
    leadForm({ ...l, org_name: o.name }, { contacts: o.contacts, onSaved: reload });
  }));
  view.querySelector('#act-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/activities', { method: 'POST', json: { ...formData(e.target), org_id: o.id } });
      reload();
    } catch (err) { toast(err.message, true); }
  });
  view.querySelectorAll('[data-del-act]').forEach((b) => b.addEventListener('click', async () => {
    await api(`/api/activities/${b.dataset.delAct}`, { method: 'DELETE' });
    reload();
  }));
}

function contactForm(c, onSaved) {
  const v = (k) => esc(c[k] ?? '');
  const m = openModal(`<h2>${c.id ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}</h2>
    <form id="cf" class="form-grid">
      <label>Vorname<input name="vorname" value="${v('vorname')}"></label>
      <label>Nachname<input name="nachname" value="${v('nachname')}"></label>
      <label class="wide">Funktion<input name="funktion" value="${v('funktion')}" placeholder="z.B. Präsident, Sponsoring, Geschäftsführer"></label>
      <label>E-Mail<input name="email" type="email" value="${v('email')}"></label>
      <label>Telefon<input name="telefon" type="tel" value="${v('telefon')}"></label>
      <label class="wide">Notizen<textarea name="notizen">${v('notizen')}</textarea></label>
    </form>
    <div class="modal-foot">${c.id ? '<button class="danger" id="del" style="margin-right:auto">Löschen</button>' : ''}<button data-close>Abbrechen</button><button class="primary" id="save">Speichern</button></div>`);
  m.querySelector('#save').addEventListener('click', async () => {
    const data = formData(m.querySelector('#cf'));
    try {
      await api(c.id ? `/api/contacts/${c.id}` : '/api/contacts', { method: c.id ? 'PUT' : 'POST', json: { ...data, org_id: c.org_id } });
      closeModal();
      onSaved();
    } catch (e) { toast(e.message, true); }
  });
  m.querySelector('#del')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Kontakt löschen?'))) return;
    await api(`/api/contacts/${c.id}`, { method: 'DELETE' });
    onSaved();
  });
}

// ---------- leads ----------

async function leadForm(l, { contacts = [], onSaved } = {}) {
  const v = (k) => esc(l[k] ?? '');
  const m = openModal(`<h2>${l.id ? 'Lead bearbeiten' : 'Neuer Lead'}</h2>
    <form id="lf" class="form-grid">
      <label class="wide">Organisation *${l.org_id
        ? `<input value="${v('org_name')}" disabled>`
        : `<input id="org-search" placeholder="Verein / Agentur suchen …" autocomplete="off" required><input type="hidden" name="org_id">
           <div id="org-results" class="card" style="padding:4px;display:none;max-height:200px;overflow:auto"></div>`}</label>
      <label class="wide">Titel *<input name="titel" required value="${v('titel')}" placeholder="z.B. Trikotsponsoring 2027"></label>
      <label>Phase<select name="phase">${options(META.phasen, l.phase || 'neu')}</select></label>
      <label>Wert (CHF)<input name="wert" type="number" min="0" step="100" value="${v('wert')}"></label>
      <label>Wahrscheinlichkeit (%)<input name="wahrscheinlichkeit" type="number" min="0" max="100" value="${v('wahrscheinlichkeit')}"></label>
      <label>Ansprechperson<select name="contact_id" id="contact-sel">${options(Object.fromEntries(contacts.map((c) => [String(c.id), `${c.vorname} ${c.nachname}`.trim()])), l.contact_id ? String(l.contact_id) : '', '–')}</select></label>
      <label>Verantwortlich<input name="verantwortlich" value="${v('verantwortlich')}"></label>
      <label>Quelle<input name="quelle" value="${v('quelle')}" placeholder="z.B. Messe, Empfehlung, Kaltakquise"></label>
      <label class="wide">Nächster Schritt<input name="naechster_schritt" value="${v('naechster_schritt')}"></label>
      <label>Fällig am<input name="faellig_am" type="date" value="${v('faellig_am')}"></label>
      <label class="wide">Notizen<textarea name="notizen">${v('notizen')}</textarea></label>
    </form>
    <div class="modal-foot">${l.id ? '<button class="danger" id="del" style="margin-right:auto">Löschen</button>' : ''}<button data-close>Abbrechen</button><button class="primary" id="save">Speichern</button></div>`);
  const form = m.querySelector('#lf');
  const search = m.querySelector('#org-search');
  if (search) {
    const results = m.querySelector('#org-results');
    let t;
    search.addEventListener('input', () => {
      form.org_id.value = '';
      clearTimeout(t);
      t = setTimeout(async () => {
        if (search.value.trim().length < 2) { results.style.display = 'none'; return; }
        const { rows } = await api(`/api/orgs?${new URLSearchParams({ q: search.value.trim(), limit: 12 })}`);
        results.style.display = 'block';
        results.innerHTML = rows.map((o) => `<div class="list-item" style="cursor:pointer;padding:6px" data-id="${o.id}" data-name="${esc(o.name)}">
          <strong>${esc(o.name)}</strong> <span class="muted small">${esc([o.plz, o.ort].filter(Boolean).join(' '))}</span></div>`).join('') || '<div class="muted small" style="padding:6px">Nichts gefunden</div>';
      }, 200);
    });
    results.addEventListener('click', async (e) => {
      const it = e.target.closest('[data-id]');
      if (!it) return;
      form.org_id.value = it.dataset.id;
      search.value = it.dataset.name;
      results.style.display = 'none';
      const org = await api(`/api/orgs/${it.dataset.id}`);
      m.querySelector('#contact-sel').innerHTML = options(Object.fromEntries(org.contacts.map((c) => [String(c.id), `${c.vorname} ${c.nachname}`.trim()])), '', '–');
    });
  }
  m.querySelector('#save').addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    const data = formData(form);
    if (!l.org_id && !data.org_id) { toast('Bitte eine Organisation aus der Liste wählen', true); return; }
    try {
      await api(l.id ? `/api/leads/${l.id}` : '/api/leads', { method: l.id ? 'PUT' : 'POST', json: { ...data, org_id: l.org_id || data.org_id } });
      closeModal();
      toast('Lead gespeichert');
      if (onSaved) onSaved(); else router();
    } catch (e) { toast(e.message, true); }
  });
  m.querySelector('#del')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Lead «${l.titel}» löschen?`))) return;
    await api(`/api/leads/${l.id}`, { method: 'DELETE' });
    if (onSaved) onSaved(); else router();
  });
}

async function renderLeads(params) {
  const q = params.get('q') || '';
  const mode = params.get('ansicht') || 'board';
  view.innerHTML = `<div class="page-head"><h1>Leads</h1><span class="sub" id="sum"></span>
    <div class="actions"><input type="search" id="q" placeholder="Lead oder Organisation suchen" value="${esc(q)}" style="width:240px">
      <button id="toggle">${mode === 'board' ? 'Listenansicht' : 'Board-Ansicht'}</button>
      <button id="csv">CSV</button><button class="primary" id="new">+ Lead</button></div></div><div id="leads"></div>`;
  const load = async () => {
    const qv = view.querySelector('#q').value.trim();
    setQuery(new URLSearchParams({ q: qv, ansicht: mode === 'board' ? '' : mode }));
    const leads = await api(`/api/leads?${new URLSearchParams({ q: qv })}`);
    const open = leads.filter((l) => !['gewonnen', 'verloren'].includes(l.phase));
    const weighted = open.reduce((a, l) => a + (l.wert || 0) * ((l.wahrscheinlichkeit ?? 50) / 100), 0);
    view.querySelector('#sum').textContent = `${open.length} offen · gewichtet ${chf(weighted)}`;
    const box = view.querySelector('#leads');
    const overdue = (l) => l.faellig_am && l.faellig_am < today() && !['gewonnen', 'verloren'].includes(l.phase);
    if (mode === 'board') {
      box.innerHTML = `<div class="kanban">${Object.entries(META.phasen).map(([k, label]) => {
        const items = leads.filter((l) => l.phase === k);
        return `<div class="kcol" data-phase="${k}"><h3><span>${esc(label)}</span><span class="muted">${items.length} · ${chf(items.reduce((a, l) => a + (l.wert || 0), 0))}</span></h3>
          ${items.map((l) => `<div class="kcard${overdue(l) ? ' overdue' : ''}" draggable="true" data-id="${l.id}">
            <div class="t">${esc(l.titel)}</div><div class="small"><a href="#/orgs/${l.org_id}">${esc(l.org_name)}</a></div>
            <div class="small muted">${[chf(l.wert), l.faellig_am && date(l.faellig_am)].filter(Boolean).map(esc).join(' · ')}</div></div>`).join('')}</div>`;
      }).join('')}</div>`;
      box.querySelectorAll('.kcard').forEach((c) => {
        c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', c.dataset.id));
        c.addEventListener('click', (e) => { if (!e.target.closest('a')) editLead(leads.find((l) => l.id === Number(c.dataset.id))); });
      });
      box.querySelectorAll('.kcol').forEach((col) => {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
        col.addEventListener('dragleave', () => col.classList.remove('over'));
        col.addEventListener('drop', async (e) => {
          e.preventDefault();
          col.classList.remove('over');
          const id = e.dataTransfer.getData('text/plain');
          await api(`/api/leads/${id}`, { method: 'PUT', json: { phase: col.dataset.phase } });
          load();
        });
      });
    } else {
      box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Lead</th><th>Organisation</th><th>Phase</th><th>Wert</th><th>%</th><th>Nächster Schritt</th><th>Fällig</th><th>Verantwortlich</th></tr></thead>
        <tbody>${leads.map((l) => `<tr class="clickable" data-id="${l.id}"><td><strong>${esc(l.titel)}</strong></td>
          <td><a href="#/orgs/${l.org_id}">${esc(l.org_name)}</a></td><td><span class="pill ${esc(l.phase)}">${esc(META.phasen[l.phase])}</span></td>
          <td class="nowrap">${chf(l.wert)}</td><td>${esc(l.wahrscheinlichkeit ?? '')}</td><td>${esc(l.naechster_schritt)}</td>
          <td class="nowrap" style="${overdue(l) ? 'color:var(--accent);font-weight:600' : ''}">${date(l.faellig_am)}</td><td>${esc(l.verantwortlich)}</td></tr>`).join('')
          || '<tr><td colspan="8" class="empty">Noch keine Leads</td></tr>'}</tbody></table></div>`;
      box.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => {
        if (!e.target.closest('a')) editLead(leads.find((l) => l.id === Number(tr.dataset.id)));
      }));
    }
  };
  const editLead = async (l) => {
    const org = await api(`/api/orgs/${l.org_id}`);
    leadForm(l, { contacts: org.contacts, onSaved: load });
  };
  let t;
  view.querySelector('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  view.querySelector('#toggle').addEventListener('click', () => {
    location.hash = `#/leads?${new URLSearchParams({ q: view.querySelector('#q').value, ansicht: mode === 'board' ? 'liste' : 'board' })}`;
  });
  view.querySelector('#csv').addEventListener('click', () => { location.href = '/api/leads.csv'; });
  view.querySelector('#new').addEventListener('click', () => leadForm({}, { onSaved: load }));
  await load();
}

// ---------- import ----------

async function renderImport() {
  view.innerHTML = `
    <div class="page-head"><h1>Daten sammeln</h1></div>
    <div class="grid two">
      <div class="card">
        <h2>1. Vereine aus OpenStreetMap importieren</h2>
        <p class="muted">Lädt alle in OpenStreetMap erfassten Sportvereine (bzw. Werbe-, Marketing- und Eventagenturen) pro Kanton mit Adresse,
          Sportart, Website, Telefon und E-Mail. Erneutes Ausführen aktualisiert bestehende Einträge; manuell gepflegte Felder bleiben unverändert.</p>
        <form id="osm">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <label class="check"><input type="radio" name="typ" value="verein" checked> Sportvereine</label>
            <label class="check"><input type="radio" name="typ" value="agentur"> Agenturen</label>
            <span style="margin-left:auto"><button type="button" class="small" id="all">Alle</button> <button type="button" class="small" id="none">Keine</button></span>
          </div>
          <div class="kanton-grid">${Object.entries(META.kantone).map(([k, v]) => `<label class="check"><input type="checkbox" name="k" value="${k}" checked> ${k} – ${esc(v)}</label>`).join('')}</div>
          <button class="primary">Import starten</button>
        </form>
      </div>
      <div class="card">
        <h2>2. Websites auswerten</h2>
        <p class="muted">Besucht die Websites der erfassten Organisationen (Startseite, Kontakt, Impressum) und ergänzt <strong>nur leere Felder</strong>:
          E-Mail, Telefon, Adresse, Facebook, Instagram, LinkedIn. robots.txt wird respektiert, pro Website wird höchstens alle 1,5&nbsp;s eine Seite abgerufen.</p>
        <form id="enrich" class="form-grid">
          <label>Typ<select name="typ">${options(META.typen, '', 'Alle')}</select></label>
          <label>Kanton<select name="kanton">${options(META.kantone, '', 'Alle')}</select></label>
          <label>Max. Anzahl<input name="limit" type="number" value="200" min="1" max="5000"></label>
          <label class="check wide"><input type="checkbox" name="nurNie" checked> nur noch nie ausgewertete Websites</label>
          <div class="wide"><button class="primary">Auswertung starten</button></div>
        </form>
        <h2 style="margin-top:24px">3. Einzelne Website erfassen</h2>
        <p class="muted">Neuen Verein oder Agentur direkt über die Website-Adresse anlegen.</p>
        <button id="url">Aus Website erfassen …</button>
      </div>
      <div class="card">
        <h2>4. CSV / Excel-Liste importieren</h2>
        <p class="muted">z.B. Mitgliederlisten von Verbänden oder eigene Listen. Erkannte Spalten: Name, Typ, Sportart, Verband, Strasse, PLZ, Ort, Kanton,
          Telefon, E-Mail, Website, Mitglieder, Notizen, Tags … (Excel: «Speichern unter → CSV»). Duplikate werden über Website oder Name+PLZ erkannt.</p>
        <form id="csv" class="form-grid">
          <label>Typ (falls keine Spalte «Typ»)<select name="typ">${options(META.typen, 'verein')}</select></label>
          <label>Datei<input type="file" name="file" accept=".csv,text/csv" required></label>
          <div class="wide"><button class="primary">Importieren</button> <a class="btn" href="/api/export.csv">Alle Daten als CSV exportieren</a></div>
        </form>
        <div id="csv-result"></div>
      </div>
      <div class="card"><div class="section-head"><h2>Import-Verlauf</h2><button class="small" id="refresh">Aktualisieren</button></div><div id="jobs"></div></div>
    </div>`;

  const osm = view.querySelector('#osm');
  view.querySelector('#all').addEventListener('click', () => osm.querySelectorAll('[name=k]').forEach((c) => { c.checked = true; }));
  view.querySelector('#none').addEventListener('click', () => osm.querySelectorAll('[name=k]').forEach((c) => { c.checked = false; }));
  osm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kantone = [...osm.querySelectorAll('[name=k]:checked')].map((c) => c.value);
    if (!kantone.length) { toast('Bitte mindestens einen Kanton wählen', true); return; }
    try {
      await api('/api/jobs', { method: 'POST', json: { typ: 'osm', params: { kantone, typ: osm.typ.value } } });
      toast('Import gestartet');
      loadJobs();
    } catch (err) { toast(err.message, true); }
  });
  view.querySelector('#enrich').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    try {
      await api('/api/jobs', { method: 'POST', json: { typ: 'enrich', params: d } });
      toast('Website-Auswertung gestartet');
      loadJobs();
    } catch (err) { toast(err.message, true); }
  });
  view.querySelector('#url').addEventListener('click', () => urlCaptureDialog('verein'));
  view.querySelector('#csv').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = e.target.file.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    try {
      const r = await api(`/api/import/csv?typ=${e.target.typ.value}`, { method: 'POST', body: text, headers: { 'Content-Type': 'text/csv' } });
      view.querySelector('#csv-result').innerHTML = `<p><strong>${r.neu}</strong> neu, <strong>${r.aktualisiert}</strong> aktualisiert, ${r.unveraendert} unverändert, ${r.fehler} Fehler</p>
        ${r.meldungen.length ? `<pre class="log">${esc(r.meldungen.slice(0, 50).join('\n'))}</pre>` : ''}`;
      META = await api('/api/meta');
    } catch (err) { toast(err.message, true); }
  });

  const jobsBox = view.querySelector('#jobs');
  const openLogs = new Set();
  const loadJobs = async () => {
    const jobs = await api('/api/jobs');
    const label = { laeuft: 'läuft', wartet: 'wartet', fertig: 'fertig', fehler: 'Fehler', abgebrochen: 'abgebrochen' };
    jobsBox.innerHTML = jobs.length ? jobs.map((j) => {
      const p = JSON.parse(j.params);
      const what = j.typ === 'osm' ? `OSM-Import ${p.typ === 'agentur' ? 'Agenturen' : 'Vereine'} (${p.kantone.length === 26 ? 'ganze Schweiz' : p.kantone.join(', ')})` : 'Website-Auswertung';
      return `<div class="list-item"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <strong>${esc(what)}</strong><span class="pill ${j.status === 'fertig' ? 'gewonnen' : j.status === 'laeuft' ? 'aktiv' : ''}">${esc(label[j.status] || j.status)} ${esc(j.status === 'laeuft' ? j.fortschritt : '')}</span>
        <span class="muted small">${date(j.started_at)} · ${j.neu} neu · ${j.aktualisiert} aktualisiert · ${j.fehler} Fehler</span>
        <span style="margin-left:auto">${['laeuft', 'wartet'].includes(j.status) ? `<button class="small" data-cancel="${j.id}">Abbrechen</button>` : ''}
        <button class="small" data-log="${j.id}">Protokoll</button></span></div>
        ${openLogs.has(j.id) ? `<pre class="log">${esc(j.log || '(leer)')}</pre>` : ''}</div>`;
    }).join('') : '<div class="muted">Noch keine Importe</div>';
    jobsBox.querySelectorAll('[data-log]').forEach((b) => b.addEventListener('click', () => {
      const id = Number(b.dataset.log);
      if (openLogs.has(id)) openLogs.delete(id); else openLogs.add(id);
      loadJobs();
    }));
    jobsBox.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
      await api(`/api/jobs/${b.dataset.cancel}/cancel`, { method: 'POST' });
      loadJobs();
    }));
  };
  view.querySelector('#refresh').addEventListener('click', loadJobs);
  await loadJobs();
  pollTimer = setInterval(loadJobs, 3000);
}

router();
