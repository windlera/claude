import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import { ExternalLink, Pencil, RefreshCw } from 'lucide-react';
import { api } from '../lib/api.js';

const SENTIMENT_COLORS = { positive: '#3fd18b', neutral: '#8b93a7', negative: '#f2555a' };
const SOV_COLORS = ['#7c6cff', '#3fbfe0', '#f2b544', '#f2555a', '#3fd18b', '#c86cff'];

export default function Dashboard() {
  const { brandId } = useParams();
  const [brand, setBrand] = useState(null);
  const [data, setData] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([api.getBrand(brandId), api.getDashboard(brandId), api.getProviders()])
      .then(([b, d, p]) => {
        setBrand(b);
        setData(d);
        setProviders(p);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [brandId]);

  if (loading) return <div className="page-loading">Loading…</div>;
  if (error) return <div className="page alert-error">{error}</div>;
  if (!brand || !data) return null;

  const noProviders = !providers.some((p) => p.configured);
  const sovData = Object.entries(data.shareOfVoice).map(([name, value]) => ({ name, value }));
  const sentimentData = Object.entries(data.sentimentCounts)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{brand.name}</h1>
          <p className="subtitle">AI search visibility overview</p>
        </div>
        <div className="page-actions">
          <Link className="btn-ghost" to={`/brands/${brandId}/edit`}>
            <Pencil size={14} /> Edit
          </Link>
          <Link className="btn-primary" to={`/brands/${brandId}/prompts`}>
            Manage prompts
          </Link>
          <button className="icon-btn" onClick={load} title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {noProviders && (
        <div className="alert-warning">
          No AI provider API keys are configured on the server. Add OPENAI_API_KEY,
          PERPLEXITY_API_KEY and/or GEMINI_API_KEY to <code>server/.env</code> to start running
          prompt checks.
        </div>
      )}

      {data.totalRuns === 0 ? (
        <div className="empty-state card">
          <p>No prompt runs yet.</p>
          <Link className="btn-primary" to={`/brands/${brandId}/prompts`}>
            Add your first prompt
          </Link>
        </div>
      ) : (
        <>
          <div className="stat-row">
            <div className="card stat-card">
              <span className="stat-label">Visibility score</span>
              <span className="stat-value">{data.visibilityScore}%</span>
              <span className="stat-hint">of runs mention {brand.name}</span>
            </div>
            <div className="card stat-card">
              <span className="stat-label">Total runs</span>
              <span className="stat-value">{data.totalRuns}</span>
              <span className="stat-hint">prompt × provider checks</span>
            </div>
            <div className="card stat-card">
              <span className="stat-label">Providers tracked</span>
              <span className="stat-value">{data.providerBreakdown.length}</span>
              <span className="stat-hint">
                {data.providerBreakdown.map((p) => p.provider).join(', ') || '—'}
              </span>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h3>Share of voice</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={sovData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--muted)" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="var(--muted)" width={110} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {sovData.map((_, i) => (
                      <Cell key={i} fill={SOV_COLORS[i % SOV_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3>Visibility trend</h3>
              {data.trend.length > 1 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" stroke="var(--muted)" />
                    <YAxis stroke="var(--muted)" unit="%" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="visibilityScore" stroke="#7c6cff" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="muted">Run prompts across a few days to see a trend.</p>
              )}
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h3>Provider breakdown</h3>
              <div className="provider-list">
                {data.providerBreakdown.map((p) => (
                  <div className="provider-row" key={p.provider}>
                    <span className="provider-name">{p.provider}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${p.visibilityScore}%` }} />
                    </div>
                    <span className="provider-score">{p.visibilityScore}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3>Sentiment when mentioned</h3>
              {sentimentData.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                      {sentimentData.map((d) => (
                        <Cell key={d.name} fill={SENTIMENT_COLORS[d.name]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="muted">No sentiment data yet.</p>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Recent citations</h3>
            {data.recentCitations.length ? (
              <ul className="citation-list">
                {data.recentCitations.map((c) => (
                  <li key={c.url}>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.title || c.url} <ExternalLink size={12} />
                    </a>
                    <span className="muted">×{c.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No citations recorded yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const tooltipStyle = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
};
