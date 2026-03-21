// Vercel Serverless Function — fetches live data from public zerotoheroes.com API
// Falls back to last committed snapshot (server/data/winrates.json) when upstream is down
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const CLASS_INFO = {
  deathknight: { id: 'dk',      name: 'Рыцарь смерти',     color: '#1f252d' },
  paladin:     { id: 'paladin', name: 'Паладин',            color: '#a88a45' },
  shaman:      { id: 'shaman',  name: 'Шаман',              color: '#2a2e6b' },
  hunter:      { id: 'hunter',  name: 'Охотник',            color: '#1d5921' },
  mage:        { id: 'mage',    name: 'Маг',                color: '#2b5c85' },
  rogue:       { id: 'rogue',   name: 'Разбойник',          color: '#333333' },
  warlock:     { id: 'warlock', name: 'Чернокнижник',       color: '#5c265c' },
  druid:       { id: 'druid',   name: 'Друид',              color: '#704a16' },
  warrior:     { id: 'warrior', name: 'Воин',               color: '#7a1e1e' },
  priest:      { id: 'priest',  name: 'Жрец',               color: '#d1d1d1', textDark: true },
  demonhunter: { id: 'dh',     name: 'Охотник на демонов', color: '#224722' },
};

export default async function handler(req, res) {
  // CORS for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const url =
      'https://static.zerotoheroes.com/api/arena/stats/classes/arena/last-patch/overview.gz.json';
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    });
    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);

    const data = await response.json();

    const classes = (data.stats || [])
      .map(s => {
        const key = (s.playerClass || '').toLowerCase().replace(/\s+/g, '');
        const info = CLASS_INFO[key];
        if (!info || !s.totalGames) return null;
        const winrate = Math.round((s.totalsWins / s.totalGames) * 1000) / 10;
        return { ...info, winrate, games: s.totalGames };
      })
      .filter(Boolean)
      .sort((a, b) => b.winrate - a.winrate);

    // Cache for 1 hour on CDN
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.json({ classes, updatedAt: data.lastUpdated, source: 'firestoneapp.com' });
  } catch (err) {
    console.error('[api/winrates] live fetch failed:', err.message);

    // Fallback: serve last committed snapshot so the UI stays functional
    try {
      const snapshot = JSON.parse(
        readFileSync(join(__dirname, '../server/data/winrates.json'), 'utf-8'),
      );
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
      return res.json({ ...snapshot, source: 'cached' });
    } catch {
      return res.status(502).json({ error: err.message });
    }
  }
}
