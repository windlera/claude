import { useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Search, Download, Upload, Pencil, Trash2, Mail, Phone } from 'lucide-react';
import PartnerModal from './components/PartnerModal';
import { initialPartners } from './data/initialData';
import './App.css';

const STORAGE_KEY = 'cmpartner_data';

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return initialPartners;
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function App() {
  const [partners, setPartners] = useState(loadData);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return partners;
    return partners.filter((p) =>
      [p.name, p.ort, p.ansprechpartner1, p.ansprechpartner2, p.email1, p.email2]
        .some((v) => v && v.toLowerCase().includes(q))
    );
  }, [partners, search]);

  const persist = useCallback((data) => {
    setPartners(data);
    saveData(data);
  }, []);

  const handleSave = (form) => {
    if (form.id) {
      persist(partners.map((p) => (p.id === form.id ? form : p)));
    } else {
      const newId = Math.max(0, ...partners.map((p) => p.id)) + 1;
      persist([...partners, { ...form, id: newId }]);
    }
    setModal(null);
  };

  const handleDelete = (id) => {
    persist(partners.filter((p) => p.id !== id));
    setDeleteConfirm(null);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const imported = rows.map((r, i) => ({
        id: i + 1,
        name: r.name || r.Name || '',
        strasse: r.strasse || r.Strasse || '',
        plz: String(r.plz || r.PLZ || ''),
        ort: r.ort || r.Ort || '',
        land: r.land || r.Land || 'CH',
        ansprechpartner1: r['ansprechpartner 1'] || r.ansprechpartner1 || '',
        funktion1: r['funktion 1'] || r.funktion1 || '',
        email1: r['email 1'] || r.email1 || '',
        telefon1: String(r['telefon 1'] || r.telefon1 || ''),
        ansprechpartner2: r['ansprechpartner 2'] || r.ansprechpartner2 || '',
        funktion2: r['funktion 2'] || r.funktion2 || '',
        email2: r['email 2'] || r.email2 || '',
        telefon2: String(r['telefon 2'] || r.telefon2 || ''),
      }));
      persist(imported);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleExport = () => {
    const rows = partners.map(({ id, ...p }) => ({
      name: p.name, strasse: p.strasse, plz: p.plz, ort: p.ort, land: p.land,
      'ansprechpartner 1': p.ansprechpartner1, 'funktion 1': p.funktion1,
      'email 1': p.email1, 'telefon 1': p.telefon1,
      'ansprechpartner 2': p.ansprechpartner2, 'funktion 2': p.funktion2,
      'email 2': p.email2, 'telefon 2': p.telefon2,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tabelle1');
    XLSX.writeFile(wb, 'cmpartner.xlsx');
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-title">
          <h1>CM Partner</h1>
          <span className="badge">{partners.length} Partner</span>
        </div>
        <div className="header-actions">
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Suche nach Name, Ort, Kontakt…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="btn-secondary" title="Excel importieren">
            <Upload size={16} /> Importieren
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} hidden />
          </label>
          <button className="btn-secondary" onClick={handleExport} title="Excel exportieren">
            <Download size={16} /> Exportieren
          </button>
          <button className="btn-primary" onClick={() => setModal('new')}>
            <Plus size={16} /> Neuer Partner
          </button>
        </div>
      </header>

      <main className="table-wrapper">
        <table className="partner-table">
          <thead>
            <tr>
              <th>Firma</th>
              <th>Adresse</th>
              <th>Ansprechpartner 1</th>
              <th>Ansprechpartner 2</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="empty">Keine Einträge gefunden</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  {p.land && <span className="tag">{p.land}</span>}
                </td>
                <td className="addr-cell">
                  {p.strasse && <div>{p.strasse}</div>}
                  {(p.plz || p.ort) && <div>{[p.plz, p.ort].filter(Boolean).join(' ')}</div>}
                </td>
                <td>
                  <ContactCell name={p.ansprechpartner1} funktion={p.funktion1} email={p.email1} telefon={p.telefon1} />
                </td>
                <td>
                  <ContactCell name={p.ansprechpartner2} funktion={p.funktion2} email={p.email2} telefon={p.telefon2} />
                </td>
                <td className="actions-cell">
                  <button className="icon-btn" onClick={() => setModal(p)} title="Bearbeiten">
                    <Pencil size={15} />
                  </button>
                  <button className="icon-btn danger" onClick={() => setDeleteConfirm(p)} title="Löschen">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>

      {modal && (
        <PartnerModal
          partner={modal === 'new' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Partner löschen?</h2>
            <p><strong>{deleteConfirm.name}</strong> wird unwiderruflich gelöscht.</p>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
              <button className="btn-danger" onClick={() => handleDelete(deleteConfirm.id)}>Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactCell({ name, funktion, email, telefon }) {
  if (!name && !email) return null;
  return (
    <div className="contact-cell">
      {name && <div className="contact-name">{name}{funktion && <span className="funktion"> · {funktion}</span>}</div>}
      {email && (
        <a href={`mailto:${email}`} className="contact-link">
          <Mail size={12} />{email}
        </a>
      )}
      {telefon && (
        <a href={`tel:${telefon}`} className="contact-link">
          <Phone size={12} />{telefon}
        </a>
      )}
    </div>
  );
}
