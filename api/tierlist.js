// Vercel Serverless Function — serves pre-scraped HearthArena tier list
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const filePath = join(__dirname, '../server/data/tierlist.json');
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    // Cache for 24 hours on CDN (update by re-running npm run scrape + push)
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
    return res.json(data);
  } catch (err) {
    console.error('[api/tierlist]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
