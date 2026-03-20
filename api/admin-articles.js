import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const DATA_FILE  = join(__dirname, '../server/data/articles.json');

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

function loadArticles() {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { articles: [], updatedAt: null };
  }
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // IP whitelist — block non-admin IPs before any auth
  const clientIp = getClientIp(req);
  if (!ALLOWED_IPS.includes(clientIp)) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  // Auth check for mutating methods
  if (req.method === 'POST' || req.method === 'DELETE') {
    const body = req.body ?? {};
    if (!body.password || body.password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }
  }

  // POST — add article
  if (req.method === 'POST') {
    const { article } = req.body ?? {};
    if (!article?.title?.trim()) {
      return res.status(400).json({ error: 'Заголовок обязателен' });
    }
    const existing = loadArticles();
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
      // On Vercel filesystem is read-only — return the data for manual deployment
      writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2), 'utf-8');
    } catch {
      // Vercel: can't write to filesystem, return updated JSON for manual use
      return res.status(200).json({
        success: true,
        vercelNote: 'Файловая система Vercel только для чтения. Скопируй updatedJson в server/data/articles.json и задеплой.',
        article: newArticle,
        updatedJson: existing,
      });
    }
    return res.json({ success: true, article: newArticle });
  }

  // DELETE — remove article by id (passed as ?id=... or in body)
  if (req.method === 'DELETE') {
    const id = req.query?.id ?? req.body?.id;
    if (!id) return res.status(400).json({ error: 'id обязателен' });
    const existing = loadArticles();
    const before = existing.articles.length;
    existing.articles = existing.articles.filter(a => a.id !== id);
    if (existing.articles.length === before) {
      return res.status(404).json({ error: 'Статья не найдена' });
    }
    existing.updatedAt = new Date().toISOString();
    try {
      writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2), 'utf-8');
    } catch {
      return res.status(200).json({
        success: true,
        vercelNote: 'Файловая система Vercel только для чтения. Скопируй updatedJson в server/data/articles.json и задеплой.',
        updatedJson: existing,
      });
    }
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
