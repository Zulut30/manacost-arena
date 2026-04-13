/** Vercel serverless function — returns { allowed, ip } for the requesting IP */

const ALLOWED_IPS = [
  '83.5.235.154', // admin
  '83.5.170.78',  // admin
  '127.0.0.1',    // localhost
  '::1',          // localhost IPv6
];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // On Vercel: x-forwarded-for contains the real client IP
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (forwarded ? forwarded.split(',')[0] : req.socket?.remoteAddress ?? '').trim();

  const allowed = ALLOWED_IPS.includes(ip);
  return res.json({ allowed, ip });
}
