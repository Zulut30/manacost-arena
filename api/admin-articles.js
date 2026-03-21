/**
 * POST   /api/admin-articles  — add article
 * DELETE /api/admin-articles  — remove article by id
 *
 * Storage: Vercel Blob Store (production) | local filesystem (dev fallback)
 * Access:  IP whitelist + password auth
 */
import { list, put } from '@vercel/blob';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const LOCAL_FILE = join(__dirname, '../server/data/articles.json');
const BLOB_KEY   = 'articles.json';
const USE_BLOB   = !!process.env.BLOB_READ_WRITE_TOKEN;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'manacost2026';

const ALLOWED_IPS = [
  '83.5.235.154',
  '127.0.0.1',
  '::1',
];

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (forwarded ? forwarded.split(',')[0] : req.socket?.remoteAddress ?? '').trim();
}

// ── Storage helpers ────────────────────────────────────────────────────────────

async function loadArticles() {
  if (USE_BLOB) {
    try {
      const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
      if (!blobs.length) return { articles: [], updatedAt: null };
      const res = await fetch(blobs[0].url);
      if (!res.ok) throw new Error('blob fetch failed');
      return res.json();
    } catch {
      return { articles: [], updatedAt: null };
    }
  }
  // Local dev fallback
  try {
    return JSON.parse(readFileSync(LOCAL_FILE, 'utf-8'));
  } catch {
    return { articles: [], updatedAt: null };
  }
}

async function saveArticles(data) {
  if (USE_BLOB) {
    await put(BLOB_KEY, JSON.stringify(data, null, 2), {
      access: 'public',
      allowOverwrite: true,
      contentType: 'application/json',
    });
  } else {
    writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // IP whitelist
  const clientIp = getClientIp(req);
  if (!ALLOWED_IPS.includes(clientIp)) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  // Password auth for mutating methods
  if (req.method === 'POST' || req.method === 'DELETE') {
    const body = req.body ?? {};
    if (!body.password || body.password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }
  }

  // ── POST — add article ────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { article } = req.body ?? {};
    if (!article?.title?.trim()) {
      return res.status(400).json({ error: 'Заголовок обязателен' });
    }

    const existing = await loadArticles();
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

    try {
      await saveArticles(existing);
      return res.json({ success: true, article: newArticle });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── DELETE — remove article by id ─────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = req.query?.id ?? req.body?.id;
    if (!id) return res.status(400).json({ error: 'id обязателен' });

    const existing = await loadArticles();
    const before = existing.articles.length;
    existing.articles = existing.articles.filter(a => a.id !== id);
    if (existing.articles.length === before) {
      return res.status(404).json({ error: 'Статья не найдена' });
    }
    existing.updatedAt = new Date().toISOString();

    try {
      await saveArticles(existing);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
