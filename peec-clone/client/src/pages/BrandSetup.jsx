import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Trash2, Plus } from 'lucide-react';
import { api } from '../lib/api.js';

export default function BrandSetup({ editing }) {
  const navigate = useNavigate();
  const { brandId } = useParams();
  const { refreshBrands } = useOutletContext();

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [competitors, setCompetitors] = useState([{ name: '', domain: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (editing && brandId) {
      api.getBrand(brandId).then((b) => {
        setName(b.name);
        setDomain(b.domain || '');
        setCompetitors(b.competitors.length ? b.competitors : [{ name: '', domain: '' }]);
      });
    }
  }, [editing, brandId]);

  function updateCompetitor(idx, field, value) {
    setCompetitors((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Brand name is required.');
      return;
    }
    const cleanCompetitors = competitors
      .map((c) => ({ name: c.name.trim(), domain: c.domain.trim() }))
      .filter((c) => c.name);

    setSaving(true);
    try {
      const body = { name: name.trim(), domain: domain.trim() || null, competitors: cleanCompetitors };
      const brand = editing ? await api.updateBrand(brandId, body) : await api.createBrand(body);
      refreshBrands();
      navigate(`/brands/${brand.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1>{editing ? 'Edit brand' : 'Track a new brand'}</h1>
      <p className="subtitle">
        Define your brand and competitors. We'll check how often each one shows up when AI
        assistants answer your tracked prompts.
      </p>

      <form className="card form" onSubmit={handleSubmit}>
        {error && <div className="alert-error">{error}</div>}

        <label className="field">
          <span>Brand name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." />
        </label>

        <label className="field">
          <span>Website domain (optional)</span>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" />
        </label>

        <div className="field">
          <span>Competitors (optional)</span>
          {competitors.map((c, idx) => (
            <div className="competitor-row" key={idx}>
              <input
                placeholder="Competitor name"
                value={c.name}
                onChange={(e) => updateCompetitor(idx, 'name', e.target.value)}
              />
              <input
                placeholder="Domain (optional)"
                value={c.domain}
                onChange={(e) => updateCompetitor(idx, 'domain', e.target.value)}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setCompetitors((prev) => prev.filter((_, i) => i !== idx))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setCompetitors((prev) => [...prev, { name: '', domain: '' }])}
          >
            <Plus size={14} /> Add competitor
          </button>
        </div>

        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create brand'}
        </button>
      </form>
    </div>
  );
}
