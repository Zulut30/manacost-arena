import express from 'express';
import cron from 'node-cron';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { scrapeAll, loadData } from './scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const DATA_DIR   = join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'manacost2026';

const app = express();
const PORT = 3001;

app.use(express.json());

// CORS for Vite dev server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/api/winrates', (req, res) => {
  const data = loadData('winrates.json');
  if (!data) return res.status(404).json({ error: 'No data available' });
  res.json(data);
});

app.get('/api/tierlist', (req, res) => {
  const data = loadData('tierlist.json');
  if (!data) return res.status(404).json({ error: 'No data available' });
  res.json(data);
});

app.get('/api/legendaries', (req, res) => {
  const data = loadData('legendaries.json');
  if (!data) return res.status(404).json({ error: 'No data available' });
  res.json(data);
});

app.get('/api/articles', (req, res) => {
  const data = loadData('articles.json');
  if (!data) return res.status(404).json({ error: 'No data' });
  res.json(data);
});

app.get('/api/status', (req, res) => {
  const wr = loadData('winrates.json');
  const tl = loadData('tierlist.json');
  res.json({
    winrates: { updatedAt: wr?.updatedAt ?? null, source: wr?.source ?? null },
    tierlist: { updatedAt: tl?.updatedAt ?? null, source: tl?.source ?? null },
    nextScrape: 'каждые 6 часов',
  });
});

let isScraping = false;

app.post('/api/scrape', async (req, res) => {
  if (isScraping) {
    return res.status(409).json({ message: 'Парсинг уже запущен' });
  }
  isScraping = true;
  res.json({ message: 'Парсинг запущен' });
  try {
    const result = await scrapeAll();
    console.log('[Server] Manual scrape result:', result);
  } finally {
    isScraping = false;
  }
});

// ─── Admin API ────────────────────────────────────────────────────────────────

app.post('/api/admin/articles', (req, res) => {
  const { password, article } = req.body ?? {};
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  if (!article?.title?.trim()) {
    return res.status(400).json({ error: 'Заголовок обязателен' });
  }
  try {
    const filePath = join(DATA_DIR, 'articles.json');
    const existing: any = loadData('articles.json') ?? { articles: [], updatedAt: null };
    const newArticle = {
      id: Date.now().toString(),
      title:   article.title.trim(),
      date:    new Date().toISOString().split('T')[0],
      image:   article.image  ?? '',
      excerpt: article.excerpt ?? '',
      tag:     article.tag    ?? '',
      url:     article.url    ?? '#',
    };
    existing.articles.unshift(newArticle);
    existing.updatedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    res.json({ success: true, article: newArticle });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/articles/:id', (req, res) => {
  const { password } = req.body ?? {};
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  try {
    const filePath = join(DATA_DIR, 'articles.json');
    const existing: any = loadData('articles.json') ?? { articles: [], updatedAt: null };
    const before = existing.articles.length;
    existing.articles = existing.articles.filter((a: any) => a.id !== req.params.id);
    if (existing.articles.length === before) {
      return res.status(404).json({ error: 'Статья не найдена' });
    }
    existing.updatedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Scheduled scraping every 6 hours ─────────────────────────────────────────
cron.schedule('0 */6 * * *', async () => {
  if (isScraping) return;
  isScraping = true;
  console.log('[Cron] Starting scheduled scrape...');
  try {
    const result = await scrapeAll();
    console.log('[Cron] Scrape complete:', result);
  } finally {
    isScraping = false;
  }
});

app.listen(PORT, () => {
  console.log(`[Server] API server running on http://localhost:${PORT}`);
  console.log('[Server] Scraping every 6 hours. Trigger manual: POST /api/scrape');

  // Initial scrape on startup (non-blocking)
  setTimeout(async () => {
    if (isScraping) return;
    isScraping = true;
    console.log('[Server] Running initial scrape...');
    try {
      const result = await scrapeAll();
      console.log('[Server] Initial scrape complete:', result);
    } finally {
      isScraping = false;
    }
  }, 2000);
});
