const BASE = '/api';

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  listBrands: () => request('/brands'),
  createBrand: (body) => request('/brands', { method: 'POST', body: JSON.stringify(body) }),
  getBrand: (id) => request(`/brands/${id}`),
  updateBrand: (id, body) => request(`/brands/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteBrand: (id) => request(`/brands/${id}`, { method: 'DELETE' }),
  getDashboard: (id) => request(`/brands/${id}/dashboard`),

  listPrompts: (brandId) => request(`/brands/${brandId}/prompts`),
  createPrompt: (brandId, body) =>
    request(`/brands/${brandId}/prompts`, { method: 'POST', body: JSON.stringify(body) }),
  deletePrompt: (id) => request(`/prompts/${id}`, { method: 'DELETE' }),
  runPrompt: (id) => request(`/prompts/${id}/run`, { method: 'POST' }),
  getRuns: (id) => request(`/prompts/${id}/runs`),

  getProviders: () => request('/providers'),
};
