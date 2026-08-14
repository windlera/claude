import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import brandsRouter from './routes/brands.js';
import promptsRouter from './routes/prompts.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/brands', brandsRouter);
app.use('/api', promptsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`peec-clone server listening on http://localhost:${port}`);
});
