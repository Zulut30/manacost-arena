// Vercel Serverless Function — scraping unavailable in serverless environment
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  return res.status(501).json({
    message:
      'Scraping not available in serverless mode. Run `npm run scrape` locally to update tier list data, then commit & push.',
  });
}
