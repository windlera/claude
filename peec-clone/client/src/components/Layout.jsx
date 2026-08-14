import { useEffect, useState, useCallback } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { LayoutDashboard, MessageSquareText, Plus, Radar } from 'lucide-react';
import { api } from '../lib/api.js';

export default function Layout() {
  const { brandId } = useParams();
  const navigate = useNavigate();
  const [brands, setBrands] = useState([]);

  const refresh = useCallback(() => {
    api.listBrands().then(setBrands).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-logo">
          <Radar size={20} />
          <span>Visibly</span>
        </div>

        <div className="brand-switcher">
          <label>Brand</label>
          <select
            value={brandId || ''}
            onChange={(e) => e.target.value && navigate(`/brands/${e.target.value}`)}
          >
            <option value="" disabled>
              Select a brand
            </option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button className="btn-ghost" onClick={() => navigate('/brands/new')}>
            <Plus size={14} /> New brand
          </button>
        </div>

        {brandId && (
          <nav className="nav">
            <NavLink to={`/brands/${brandId}`} end className="nav-link">
              <LayoutDashboard size={16} /> Dashboard
            </NavLink>
            <NavLink to={`/brands/${brandId}/prompts`} className="nav-link">
              <MessageSquareText size={16} /> Prompts
            </NavLink>
          </nav>
        )}
      </aside>

      <main className="content">
        <Outlet context={{ refreshBrands: refresh }} />
      </main>
    </div>
  );
}
