// Vercel function: live seller prices need a scraper and a local cache that a deployed site doesn't have, so the site
// keeps showing the saved catalog prices and says so.
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const skus = Array.isArray(req.body?.skus) ? req.body.skus.filter((s) => typeof s === 'string').slice(0, 200) : [];
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ prices: {}, refreshed: 0, cached: 0, stale: true, error: 'Live prices are only available in the local app for now.', unknown: skus });
}
