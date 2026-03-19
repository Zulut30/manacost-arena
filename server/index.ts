import express from 'express';
import cron from 'node-cron';
import { scrapeAll, loadData } from './scraper.js';

const app = express();
const PORT = 3001;

app.use(express.json());

// CORS for Vite dev server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
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
