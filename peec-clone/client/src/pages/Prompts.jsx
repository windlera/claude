import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Play, Trash2, Plus } from 'lucide-react';
import { api } from '../lib/api.js';

export default function Prompts() {
  const { brandId } = useParams();
  const [prompts, setPrompts] = useState([]);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    api.listPrompts(brandId).then(setPrompts).catch((err) => setError(err.message));
  }

  useEffect(load, [brandId]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await api.createPrompt(brandId, { text: text.trim() });
      setText('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRun(id) {
    setRunningId(id);
    setError(null);
    try {
      await api.runPrompt(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningId(null);
    }
  }

  async function handleDelete(id) {
    await api.deletePrompt(id);
    load();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Prompts</h1>
          <p className="subtitle">
            Questions people might ask ChatGPT, Perplexity or Gemini where your brand could show up.
          </p>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <form className="card form-inline" onSubmit={handleAdd}>
        <input
          placeholder="e.g. What are the best project management tools for startups?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary" type="submit" disabled={adding}>
          <Plus size={14} /> {adding ? 'Adding…' : 'Add prompt'}
        </button>
      </form>

      {prompts.length === 0 ? (
        <div className="empty-state card">
          <p>No prompts yet. Add one above to start tracking visibility.</p>
        </div>
      ) : (
        <ul className="prompt-list">
          {prompts.map((p) => (
            <li className="card prompt-item" key={p.id}>
              <Link to={`/brands/${brandId}/prompts/${p.id}`} className="prompt-text">
                {p.text}
              </Link>
              <div className="prompt-actions">
                <button className="btn-ghost" onClick={() => handleRun(p.id)} disabled={runningId === p.id}>
                  <Play size={14} /> {runningId === p.id ? 'Running…' : 'Run'}
                </button>
                <button className="icon-btn" onClick={() => handleDelete(p.id)} title="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
