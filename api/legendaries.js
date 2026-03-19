import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const filePath = join(__dirname, '../server/data/legendaries.json');
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
