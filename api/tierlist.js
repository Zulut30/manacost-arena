// Vercel Serverless Function — serves pre-scraped tier list
// ?source=heartharena (default) → tierlist.json (HearthArena scores)
// ?source=hsreplay              → hsreplay_tierlist.json (HSReplay deck winrates)
import { list } from '@vercel/blob';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const POSITIONS_BLOB_KEY = 'class_positions.json';
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

async function loadClassPositions() {
  if (USE_BLOB) {
    try {
      const { blobs } = await list({ prefix: POSITIONS_BLOB_KEY, limit: 1 });
      if (!blobs.length) return {};
      const res = await fetch(blobs[0].url, {
        headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
      });
      if (!res.ok) return {};
      const data = await res.json();
      return data?.positions ?? {};
    } catch {
      return {};
    }
  }
  try {
    const filePath = join(__dirname, '../server/data/class_positions.json');
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return data?.positions ?? {};
  } catch {
    return {};
  }
}

async function attachClassPositions(data) {
  const positions = await loadClassPositions();
  return {
    ...data,
    classPositions: positions,
    sections: (data.sections ?? []).map(section => ({
      ...section,
      classPosition: positions[section.id] ?? '',
    })),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const source = req.query?.source ?? 'heartharena';
  const filename = source === 'hsreplay' ? 'hsreplay_tierlist.json' : 'tierlist.json';

  try {
    const filePath = join(__dirname, '../server/data', filename);
    const data = await attachClassPositions(JSON.parse(readFileSync(filePath, 'utf-8')));
    // Cache for 24 hours on CDN (update by re-running npm run scrape + push)
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
    return res.json(data);
  } catch (err) {
    // If HSReplay file doesn't exist yet, fall back to HearthArena data
    if (source === 'hsreplay') {
      try {
        const fallbackPath = join(__dirname, '../server/data/tierlist.json');
        const data = await attachClassPositions(JSON.parse(readFileSync(fallbackPath, 'utf-8')));
        res.setHeader('Cache-Control', 's-maxage=300');
        return res.json({ ...data, source: 'heartharena.com (hsreplay data not yet available)' });
      } catch { /* fall through */ }
    }
    console.error('[api/tierlist]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
