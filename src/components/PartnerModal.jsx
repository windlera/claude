import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const emptyPartner = {
  name: '', strasse: '', plz: '', ort: '', land: 'CH',
  ansprechpartner1: '', funktion1: '', email1: '', telefon1: '',
  ansprechpartner2: '', funktion2: '', email2: '', telefon2: '',
};

export default function PartnerModal({ partner, onSave, onClose }) {
  const [form, setForm] = useState(emptyPartner);

  useEffect(() => {
    setForm(partner ? { ...emptyPartner, ...partner } : emptyPartner);
  }, [partner]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{partner ? 'Partner bearbeiten' : 'Neuer Partner'}</h2>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <section>
              <h3>Firma</h3>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Name *</label>
                  <input value={form.name} onChange={set('name')} required />
                </div>
                <div className="form-group full">
                  <label>Strasse</label>
                  <input value={form.strasse} onChange={set('strasse')} />
                </div>
                <div className="form-group">
                  <label>PLZ</label>
                  <input value={form.plz} onChange={set('plz')} />
                </div>
                <div className="form-group">
                  <label>Ort</label>
                  <input value={form.ort} onChange={set('ort')} />
                </div>
                <div className="form-group">
                  <label>Land</label>
                  <input value={form.land} onChange={set('land')} />
                </div>
              </div>
            </section>

            <section>
              <h3>Ansprechpartner 1</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Name</label>
                  <input value={form.ansprechpartner1} onChange={set('ansprechpartner1')} />
                </div>
                <div className="form-group">
                  <label>Funktion</label>
                  <input value={form.funktion1} onChange={set('funktion1')} />
                </div>
                <div className="form-group">
                  <label>E-Mail</label>
                  <input type="email" value={form.email1} onChange={set('email1')} />
                </div>
                <div className="form-group">
                  <label>Telefon</label>
                  <input value={form.telefon1} onChange={set('telefon1')} />
                </div>
              </div>
            </section>

            <section>
              <h3>Ansprechpartner 2</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Name</label>
                  <input value={form.ansprechpartner2} onChange={set('ansprechpartner2')} />
                </div>
                <div className="form-group">
                  <label>Funktion</label>
                  <input value={form.funktion2} onChange={set('funktion2')} />
                </div>
                <div className="form-group">
                  <label>E-Mail</label>
                  <input type="email" value={form.email2} onChange={set('email2')} />
                </div>
                <div className="form-group">
                  <label>Telefon</label>
                  <input value={form.telefon2} onChange={set('telefon2')} />
                </div>
              </div>
            </section>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
            <button type="submit" className="btn-primary">Speichern</button>
          </div>
        </form>
      </div>
    </div>
  );
}
