// Vercel function: part specifications for the build-health checks, from the saved catalog only (no paid scraping).
import parts from '../../data/parts.json' with { type: 'json' };

const SKU_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]{2,47}$/;
const bySku = new Map(Object.values(parts).filter((p) => SKU_RE.test(p?.sku ?? '')).map((p) => [p.sku, p]));

const record = (raw) => ({
  sku: raw.sku,
  name: String(raw.name ?? '').slice(0, 200),
  category: String(raw.category ?? '').slice(0, 120),
  url: /^https:\/\//.test(raw.url ?? '') ? raw.url : null,
  specs: (Array.isArray(raw.specs) ? raw.specs : []).filter((s) => typeof s === 'string').slice(0, 100).map((s) => s.slice(0, 300)),
  dimensions_mm: raw.dimensions_mm ?? {},
  source: 'catalog',
});

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const skus = req.body?.skus;
  if (!Array.isArray(skus) || skus.length > 16 || skus.some((s) => typeof s !== 'string' || !SKU_RE.test(s))) {
    return res.status(400).json({ error: 'Expected up to 16 valid SKU values' });
  }
  const records = {};
  for (const sku of new Set(skus)) if (bySku.has(sku)) records[sku] = record(bySku.get(sku));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ records });
}
