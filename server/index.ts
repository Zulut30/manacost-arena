import express from 'express';
import cron from 'node-cron';
import compression from 'compression';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { scrapeAll, loadData } from './scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const DATA_DIR   = join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'manacost2026';

const ALLOWED_IPS = ['83.5.235.154', '127.0.0.1', '::1', '::ffff:127.0.0.1'];

function getClientIp(req: import('express').Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (raw ? raw.split(',')[0] : req.socket?.remoteAddress ?? '').trim();
}

const app = express();
const PORT = 3001;

app.use(compression());
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

// 6 h cache (aligns with scrape schedule) — stale-while-revalidate keeps UX snappy
const CACHE_6H  = 'public, max-age=21600, stale-while-revalidate=3600';
const CACHE_1H  = 'public, max-age=3600,  stale-while-revalidate=600';

app.get('/api/winrates', async (req, res) => {
  const source = (req.query.source as string) ?? 'hsreplay';

  // Firestone: proxy live zerotoheroes.com API
  if (source === 'firestone') {
    const CLASS_INFO: Record<string, { id: string; name: string; color: string; textDark?: boolean }> = {
      deathknight: { id: 'death-knight', name: 'Рыцарь смерти',     color: '#1f252d' },
      paladin:     { id: 'paladin',      name: 'Паладин',            color: '#a88a45' },
      shaman:      { id: 'shaman',       name: 'Шаман',              color: '#2a2e6b' },
      hunter:      { id: 'hunter',       name: 'Охотник',            color: '#1d5921' },
      mage:        { id: 'mage',         name: 'Маг',                color: '#2b5c85' },
      rogue:       { id: 'rogue',        name: 'Разбойник',          color: '#333333' },
      warlock:     { id: 'warlock',      name: 'Чернокнижник',       color: '#5c265c' },
      druid:       { id: 'druid',        name: 'Друид',              color: '#704a16' },
      warrior:     { id: 'warrior',      name: 'Воин',               color: '#7a1e1e' },
      priest:      { id: 'priest',       name: 'Жрец',               color: '#d1d1d1', textDark: true },
      demonhunter: { id: 'demon-hunter', name: 'Охотник на демонов', color: '#224722' },
    };
    try {
      const upstream = await fetch(
        'https://static.zerotoheroes.com/api/arena/stats/classes/arena/last-patch/overview.gz.json',
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' } },
      );
      if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
      const raw = await upstream.json() as any;
      const classes = ((raw.stats ?? []) as any[])
        .map((s: any) => {
          const key  = String(s.playerClass ?? '').toLowerCase().replace(/\s+/g, '');
          const info = CLASS_INFO[key];
          if (!info || !s.totalGames) return null;
          const winrate = Math.round((s.totalsWins / s.totalGames) * 1000) / 10;
          return { ...info, winrate, games: s.totalGames };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.winrate - a.winrate);
      res.set('Cache-Control', CACHE_1H);
      return res.json({ classes, updatedAt: raw.lastUpdated ?? null, source: 'firestoneapp.com' });
    } catch {
      // fallback to snapshot on error
    }
  }

  // HSReplay (default): return snapshot
  const data = loadData('winrates.json');
  if (!data) return res.status(404).json({ error: 'No data available' });
  res.set('Cache-Control', CACHE_6H);
  res.json(data);
});

app.get('/api/tierlist', (req, res) => {
  const data = loadData('tierlist.json');
  if (!data) return res.status(404).json({ error: 'No data available' });
  res.set('Cache-Control', CACHE_6H);
  res.json(data);
});

app.get('/api/legendaries', (req, res) => {
  const data = loadData('legendaries.json');
  if (!data) return res.status(404).json({ error: 'No data available' });
  res.set('Cache-Control', CACHE_6H);
  res.json(data);
});

app.get('/api/articles', (req, res) => {
  const data = loadData('articles.json');
  if (!data) return res.status(404).json({ error: 'No data' });
  res.set('Cache-Control', CACHE_1H);
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

// ─── IP check endpoint (mirrors api/check-ip.js for Vercel) ──────────────────

app.get('/api/check-ip', (req, res) => {
  const ip = getClientIp(req);
  res.json({ allowed: ALLOWED_IPS.includes(ip), ip });
});

// ─── Admin API (/api/admin-articles — matches Vercel file api/admin-articles.js) ─

function adminAuth(body: any): boolean {
  return body?.password === ADMIN_PASSWORD;
}

function adminIpGuard(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  const ip = getClientIp(req);
  if (!ALLOWED_IPS.includes(ip)) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  next();
}

app.post('/api/admin-articles', adminIpGuard, (req, res) => {
  if (!adminAuth(req.body)) return res.status(401).json({ error: 'Неверный пароль' });
  const { article } = req.body ?? {};
  if (!article?.title?.trim()) return res.status(400).json({ error: 'Заголовок обязателен' });
  try {
    const filePath = join(DATA_DIR, 'articles.json');
    const existing: any = loadData('articles.json') ?? { articles: [], updatedAt: null };
    const newArticle = {
      id:      Date.now().toString(),
      title:   article.title.trim(),
      date:    new Date().toISOString().split('T')[0],
      image:   article.image   ?? '',
      excerpt: article.excerpt ?? '',
      tag:     article.tag     ?? '',
      url:     article.url     ?? '#',
    };
    existing.articles.unshift(newArticle);
    existing.updatedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    res.json({ success: true, article: newArticle });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin-articles', adminIpGuard, (req, res) => {
  if (!adminAuth(req.body)) return res.status(401).json({ error: 'Неверный пароль' });
  const id = req.body?.id;
  if (!id) return res.status(400).json({ error: 'id обязателен' });
  try {
    const filePath = join(DATA_DIR, 'articles.json');
    const existing: any = loadData('articles.json') ?? { articles: [], updatedAt: null };
    const before = existing.articles.length;
    existing.articles = existing.articles.filter((a: any) => a.id !== id);
    if (existing.articles.length === before) return res.status(404).json({ error: 'Статья не найдена' });
    existing.updatedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
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
