/**
 * Dev-only Vite middleware for credit-efficient specification retrieval.
 * The existing Context.dev catalog is always consulted first. Fresh paid
 * scrapes happen only for known goBILDA SKUs whose saved data is sparse.
 *
 * POST /api/compatibility/specs { skus: string[] }
 * -> { records: { [sku]: { sku, name, category, url, specs, dimensions_mm } } }
 */
import { readFile } from 'node:fs/promises';
import { scrapeProduct } from '../scripts/catalog.mjs';

const MAX_SKUS = 16;
const MAX_BODY = 8_192;
const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
const SKU_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]{2,47}$/;
const lookupCache = new Map();
const inFlight = new Map();
const attempted = new Map();

function sparse(record) {
  return (record?.specs?.length ?? 0) < 2 && !record?.dimensions_mm?.shaft_diameter && !record?.dimensions_mm?.bore_diameter;
}

function permittedUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && parsed.hostname.toLowerCase() === 'www.gobilda.com'
      && !parsed.username && !parsed.password && !parsed.port
      && !parsed.search && !parsed.hash
      && parsed.pathname.startsWith('/') && parsed.pathname !== '/';
  } catch {
    return false;
  }
}

function publicRecord(raw, source = 'catalog') {
  if (!raw || !SKU_RE.test(raw.sku ?? '')) return null;
  return {
    sku: raw.sku,
    name: String(raw.name ?? '').slice(0, 200),
    category: String(raw.category ?? '').slice(0, 120),
    url: /^https:\/\//.test(raw.url ?? '') ? raw.url : null,
    specs: (Array.isArray(raw.specs) ? raw.specs : []).filter((s) => typeof s === 'string').slice(0, 100).map((s) => s.slice(0, 300)),
    dimensions_mm: raw.dimensions_mm ?? {},
    source,
  };
}

async function readKnown() {
  const data = JSON.parse(await readFile('data/parts.json', 'utf8'));
  const bySku = new Map();
  for (const part of Object.values(data)) if (SKU_RE.test(part?.sku ?? '')) bySku.set(part.sku, part);
  return bySku;
}

// The per-SKU cache and in-flight deduplication prevent repeated scraping on
// React StrictMode mounts, multiple part instances, and the next drag action.
async function resolve(sku, known) {
  const raw = known.get(sku);
  if (!raw) return null;
  if (!sparse(raw) || !process.env.CONTEXT_DEV_API_KEY || !permittedUrl(raw.url)) return publicRecord(raw);
  const recent = lookupCache.get(sku);
  if (recent && Date.now() - recent.at < REFRESH_TTL_MS) return recent.record;
  if ((attempted.get(sku) ?? 0) > Date.now() - REFRESH_TTL_MS) return publicRecord(raw);
  if (inFlight.has(sku)) return inFlight.get(sku);
  attempted.set(sku, Date.now());
  const job = (async () => {
    try {
      // URL comes ONLY from the server's approved catalog, not from user input.
      const { part } = await scrapeProduct(raw.url, { sku, category: raw.category });
      const result = publicRecord({ ...raw, ...part, sku: raw.sku }, 'context.dev');
      lookupCache.set(sku, { at: Date.now(), record: result });
      return result;
    } catch (error) {
      console.warn(`[compatibility] Context.dev refresh for ${sku} failed:`, String(error));
      return publicRecord(raw);
    } finally {
      inFlight.delete(sku);
    }
  })();
  inFlight.set(sku, job);
  return job;
}

async function getJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function send(response, status, value) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
}

export default function compatibilitySpecs() {
  return {
    name: 'brickbots-compatibility-specs',
    configureServer(vite) {
      vite.middlewares.use('/api/compatibility/specs', async (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST required' });
        try {
          const input = await getJson(req);
          if (!Array.isArray(input.skus) || input.skus.length > MAX_SKUS || input.skus.some((s) => typeof s !== 'string' || !SKU_RE.test(s))) {
            return send(res, 400, { error: 'Expected up to 16 valid SKU values' });
          }
          const skus = [...new Set(input.skus)];
          const known = await readKnown();
          const records = {};
          // Serial refresh is intentional: no burst of paid scraper requests.
          for (const sku of skus) {
            const result = await resolve(sku, known);
            if (result) records[sku] = result;
          }
          return send(res, 200, { records });
        } catch (error) {
          console.error('[compatibility]', error);
          return send(res, 500, { error: 'Specification lookup failed' });
        }
      });
    },
  };
}
