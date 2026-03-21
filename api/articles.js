/**
 * GET /api/articles
 * Reads articles from Vercel Blob Store (production) or local filesystem (dev).
 */
import { list } from '@vercel/blob';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const LOCAL_FILE = join(__dirname, '../server/data/articles.json');
const BLOB_KEY   = 'articles.json';
const USE_BLOB   = !!process.env.BLOB_READ_WRITE_TOKEN;

async function loadArticles() {
  if (USE_BLOB) {
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
    if (!blobs.length) return { articles: [], updatedAt: null };
    const res = await fetch(blobs[0].url);
    if (!res.ok) throw new Error('Blob fetch failed');
    return res.json();
  }
  // Local dev fallback
  try {
    return JSON.parse(readFileSync(LOCAL_FILE, 'utf-8'));
  } catch {
    return { articles: [], updatedAt: null };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const data = await loadArticles();
    // Short cache so new articles appear quickly; SWR keeps it snappy
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
