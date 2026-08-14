import { Router } from 'express';
import db from '../db.js';
import { providers, configuredProviders } from '../providers/index.js';
import { analyzeRun } from '../analysis.js';

const router = Router();

router.get('/brands/:brandId/prompts', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM prompts WHERE brand_id = ? ORDER BY id DESC')
    .all(req.params.brandId);
  res.json(rows);
});

router.post('/brands/:brandId/prompts', (req, res) => {
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.brandId);
  if (!brand) return res.status(404).json({ error: 'brand not found' });
  const { text } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }
  const info = db
    .prepare('INSERT INTO prompts (brand_id, text) VALUES (?, ?)')
    .run(req.params.brandId, text.trim());
  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.delete('/prompts/:id', (req, res) => {
  db.prepare('DELETE FROM prompts WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.get('/prompts/:id/runs', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM runs WHERE prompt_id = ? ORDER BY created_at DESC')
    .all(req.params.id);
  res.json(
    rows.map((r) => ({
      ...r,
      citations: JSON.parse(r.citations || '[]'),
      competitor_mentions: JSON.parse(r.competitor_mentions || '{}'),
    }))
  );
});

router.post('/prompts/:id/run', async (req, res) => {
  const prompt = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
  if (!prompt) return res.status(404).json({ error: 'prompt not found' });
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(prompt.brand_id);

  const active = configuredProviders();
  if (!active.length) {
    return res.status(400).json({
      error:
        'No provider API keys configured. Set OPENAI_API_KEY, PERPLEXITY_API_KEY and/or GEMINI_API_KEY in the server .env file.',
    });
  }

  const results = await Promise.all(
    active.map(async (provider) => {
      const insertError = (message) =>
        db
          .prepare(
            `INSERT INTO runs (prompt_id, provider, status, error) VALUES (?, ?, 'error', ?)`
          )
          .run(prompt.id, provider.id, message);

      try {
        const result = await provider.run(prompt.text);
        const { brandMentioned, competitorMentions, sentiment } = analyzeRun(result, brand);
        const info = db
          .prepare(
            `INSERT INTO runs
             (prompt_id, provider, status, text, citations, brand_mentioned, competitor_mentions, sentiment)
             VALUES (?, ?, 'ok', ?, ?, ?, ?, ?)`
          )
          .run(
            prompt.id,
            provider.id,
            result.text,
            JSON.stringify(result.citations),
            brandMentioned ? 1 : 0,
            JSON.stringify(competitorMentions),
            sentiment
          );
        return db.prepare('SELECT * FROM runs WHERE id = ?').get(info.lastInsertRowid);
      } catch (err) {
        const info = insertError(err.message || String(err));
        return db.prepare('SELECT * FROM runs WHERE id = ?').get(info.lastInsertRowid);
      }
    })
  );

  res.status(201).json(
    results.map((r) => ({
      ...r,
      citations: JSON.parse(r.citations || '[]'),
      competitor_mentions: JSON.parse(r.competitor_mentions || '{}'),
    }))
  );
});

router.get('/providers', (req, res) => {
  res.json(
    providers.map((p) => ({ id: p.id, label: p.label, configured: p.isConfigured() }))
  );
});

export default router;
