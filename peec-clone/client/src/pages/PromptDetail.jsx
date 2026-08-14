import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ExternalLink, Play, XCircle } from 'lucide-react';
import { api } from '../lib/api.js';

const SENTIMENT_LABEL = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };

export default function PromptDetail() {
  const { brandId, promptId } = useParams();
  const [prompt, setPrompt] = useState(null);
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    api.listPrompts(brandId).then((prompts) => {
      setPrompt(prompts.find((p) => String(p.id) === promptId) || null);
    });
    api.getRuns(promptId).then(setRuns).catch((err) => setError(err.message));
  }

  useEffect(load, [brandId, promptId]);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      await api.runPrompt(promptId);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="page">
      <Link to={`/brands/${brandId}/prompts`} className="back-link">
        <ArrowLeft size={14} /> Back to prompts
      </Link>

      <div className="page-header">
        <div>
          <h1>{prompt?.text || 'Prompt'}</h1>
          <p className="subtitle">Latest results appear first.</p>
        </div>
        <button className="btn-primary" onClick={handleRun} disabled={running}>
          <Play size={14} /> {running ? 'Running…' : 'Run again'}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {runs.length === 0 ? (
        <div className="empty-state card">
          <p>No runs yet for this prompt.</p>
        </div>
      ) : (
        <div className="run-list">
          {runs.map((r) => (
            <div className="card run-card" key={r.id}>
              <div className="run-card-header">
                <span className="provider-pill">{r.provider}</span>
                {r.status === 'ok' ? (
                  r.brand_mentioned ? (
                    <span className="badge badge-positive">
                      <CheckCircle2 size={14} /> Mentioned
                    </span>
                  ) : (
                    <span className="badge badge-neutral">
                      <XCircle size={14} /> Not mentioned
                    </span>
                  )
                ) : (
                  <span className="badge badge-negative">Error</span>
                )}
                {r.sentiment && (
                  <span className={`badge badge-sentiment-${r.sentiment}`}>
                    {SENTIMENT_LABEL[r.sentiment]}
                  </span>
                )}
                <span className="muted run-time">{new Date(r.created_at).toLocaleString()}</span>
              </div>

              {r.status === 'ok' ? (
                <>
                  <p className="run-text">{r.text}</p>
                  {r.citations.length > 0 && (
                    <div className="citation-chips">
                      {r.citations.map((c) => (
                        <a key={c.url} href={c.url} target="_blank" rel="noreferrer" className="citation-chip">
                          {c.title || c.url} <ExternalLink size={11} />
                        </a>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="run-error">{r.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
