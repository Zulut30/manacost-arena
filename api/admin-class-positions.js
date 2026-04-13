/**
 * GET  /api/admin-class-positions   — read class positions
 * POST /api/admin-class-positions   — upsert class positions
 *
 * Storage: Vercel Blob Store (production) | local filesystem (dev fallback)
 * Access:  IP whitelist + password auth for mutating methods
 */
import { list, put, del } from '@vercel/blob';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOCAL_FILE = join(__dirname, '../server/data/class_positions.json');
const BLOB_KEY = 'class_positions.json';
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

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

async function loadPositions() {
  if (USE_BLOB) {
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
    if (!blobs.length) return { positions: {}, updatedAt: null };
    const res = await fetch(blobs[0].url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) throw new Error(`Blob read failed: ${res.status} ${res.statusText}`);
    return res.json();
  }
  try {
    return JSON.parse(readFileSync(LOCAL_FILE, 'utf-8'));
  } catch {
    return { positions: {}, updatedAt: null };
  }
}

async function savePositions(data) {
  if (USE_BLOB) {
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 10 });
    if (blobs.length > 0) await del(blobs.map(blob => blob.url));
    await put(BLOB_KEY, JSON.stringify(data, null, 2), {
      access: 'private',
      contentType: 'application/json',
    });
  } else {
    writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientIp = getClientIp(req);
  if (!ALLOWED_IPS.includes(clientIp)) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  if (req.method === 'GET') {
    try {
      return res.json(await loadPositions());
    } catch (err) {
      return res.status(500).json({ error: String(err.message ?? err) });
    }
  }

  if (req.method === 'POST') {
    const body = req.body ?? {};
    if (!body.password || body.password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }

    const positions = body.positions ?? {};
    if (typeof positions !== 'object' || Array.isArray(positions)) {
      return res.status(400).json({ error: 'positions must be an object' });
    }

    try {
      const normalized = Object.fromEntries(
        Object.entries(positions)
          .map(([key, value]) => [key, String(value ?? '').trim()])
          .filter(([, value]) => value.length > 0)
      );
      const payload = { positions: normalized, updatedAt: new Date().toISOString() };
      await savePositions(payload);
      return res.json({ success: true, ...payload });
    } catch (err) {
      return res.status(500).json({ error: String(err.message ?? err) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
