// Vercel Serverless Function — health check
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.json({
    status: 'ok',
    env: 'vercel',
    winrates: 'live — fetched from zerotoheroes.com on each request',
    tierlist: 'pre-scraped — update with: npm run scrape && git push',
  });
}
