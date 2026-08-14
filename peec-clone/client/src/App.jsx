import { useEffect, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import BrandSetup from './pages/BrandSetup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Prompts from './pages/Prompts.jsx';
import PromptDetail from './pages/PromptDetail.jsx';
import { api } from './lib/api.js';

function Home() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.listBrands().then((brands) => {
      if (cancelled) return;
      if (brands.length) navigate(`/brands/${brands[0].id}`, { replace: true });
      else navigate('/brands/new', { replace: true });
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return checked ? null : <div className="page-loading">Loading…</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="brands/new" element={<BrandSetup />} />
        <Route path="brands/:brandId" element={<Dashboard />} />
        <Route path="brands/:brandId/edit" element={<BrandSetup editing />} />
        <Route path="brands/:brandId/prompts" element={<Prompts />} />
        <Route path="brands/:brandId/prompts/:promptId" element={<PromptDetail />} />
      </Route>
    </Routes>
  );
}
