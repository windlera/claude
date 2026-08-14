import { Router } from 'express';
import db from '../db.js';
import { buildDashboard } from '../analysis.js';

const router = Router();

function serializeBrand(row) {
  return { ...row, competitors: JSON.parse(row.competitors || '[]') };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM brands ORDER BY id DESC').all();
  res.json(rows.map(serializeBrand));
});

router.post('/', (req, res) => {
  const { name, domain, competitors } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  const competitorsJson = JSON.stringify(Array.isArray(competitors) ? competitors : []);
  const info = db
    .prepare('INSERT INTO brands (name, domain, competitors) VALUES (?, ?, ?)')
    .run(name.trim(), domain?.trim() || null, competitorsJson);
  const row = db.prepare('SELECT * FROM brands WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serializeBrand(row));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(serializeBrand(row));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { name, domain, competitors } = req.body || {};
  db.prepare('UPDATE brands SET name = ?, domain = ?, competitors = ? WHERE id = ?').run(
    name ?? existing.name,
    domain ?? existing.domain,
    JSON.stringify(competitors ?? JSON.parse(existing.competitors || '[]')),
    req.params.id
  );
  const row = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  res.json(serializeBrand(row));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM brands WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.get('/:id/dashboard', (req, res) => {
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!brand) return res.status(404).json({ error: 'not found' });
  const runs = db
    .prepare(
      `SELECT runs.* FROM runs
       JOIN prompts ON prompts.id = runs.prompt_id
       WHERE prompts.brand_id = ?
       ORDER BY runs.created_at ASC`
    )
    .all(req.params.id);
  res.json(buildDashboard(brand, runs));
});

export default router;
