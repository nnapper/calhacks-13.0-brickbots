/**
 * Seed/refresh Elasticsearch Serverless from the repo's existing data/parts.json.
 * This does not scrape product pages. Run after catalog updates; never commit keys.
 * node --env-file=.env scripts/index-elastic-parts.mjs
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { kind } from '../src/compatibility/checks.js';

const endpoint = process.env.ELASTICSEARCH_URL?.replace(/\/+$/, '');
const apiKey = process.env.ELASTIC_API_KEY;
const index = process.env.ELASTIC_PARTS_INDEX || 'brickbots-parts';
if (!endpoint?.startsWith('https://') || !apiKey) throw new Error('Set ELASTICSEARCH_URL and ELASTIC_API_KEY in .env first');
if (!/^[a-z0-9][a-z0-9._-]{0,200}$/.test(index)) throw new Error('Invalid index name');

const headers = { Authorization: `ApiKey ${apiKey}` };
async function elastic(path, method, body, contentType = 'application/json') {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: { ...headers, 'Content-Type': contentType },
    body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(40000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = result.error?.type || result.error?.reason || response.statusText;
    throw new Error(`Elasticsearch ${method} ${path} => ${response.status} ${reason}`);
  }
  return result;
}

const raw = JSON.parse(await readFile(resolve('data/parts.json'), 'utf8'));
const sourceParts = Array.isArray(raw) ? raw : Object.values(raw);
function numberOrNull(value) {
  const valueNum = Number(value);
  return value != null && Number.isFinite(valueNum) && valueNum >= 0 ? valueNum : null;
}
function bestPrice(p) {
  const offers = (p.offers ?? []).filter((o) => o.suspect !== true && o.in_stock !== false);
  const prices = offers.map((o) => numberOrNull(o.price_usd ?? o.price)).filter((v) => v !== null);
  if (!prices.length) prices.push(...(p.prices ?? []).map((o) => numberOrNull(o.price)).filter((v) => v !== null));
  return prices.length ? Math.min(...prices) : numberOrNull(p.price);
}
function inStock(p) {
  if (typeof p.in_stock === 'boolean') return p.in_stock;
  const offers = (p.offers ?? []).filter((o) => o.suspect !== true);
  if (!offers.length) return null;
  return offers.some((o) => o.in_stock === true) ? true :
    offers.every((o) => o.in_stock === false) ? false : null;
}
function toDoc(p) {
  if (!p?.sku || !p.name) return null;
  const name = String(p.name);
  const category = String(p.category ?? '');
  const group = String(p.group ?? '');
  const specs = Array.isArray(p.specs) ? p.specs : [];
  return {
    sku: String(p.sku), name, category, group,
    kind: kind({ name, category, group }),
    specs,
    spec_text: specs.map((s) => Array.isArray(s) ? s.join(' ') : typeof s === 'string' ? s : `${s.key} ${s.value}`).join(' '),
    dimensions_mm: p.dimensions_mm ?? {},
    price_usd: bestPrice(p),
    in_stock: inStock(p),
    url: /^https:\/\//.test(p.url ?? '') ? p.url : null,
  };
}
const records = sourceParts.map(toDoc).filter(Boolean);
if (!records.length) throw new Error('No indexed records; check data/parts.json format');

const exists = await fetch(`${endpoint}/${index}`, { method: 'HEAD', headers,
  signal: AbortSignal.timeout(20000) });
if (exists.status === 404) {
  await elastic(`/${index}`, 'PUT', { mappings: { properties: {
    sku: { type: 'keyword' },
    name: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 512 } } },
    category: { type: 'keyword' }, group: { type: 'keyword' }, kind: { type: 'keyword' },
    specs: { type: 'text' }, spec_text: { type: 'text' },
    price_usd: { type: 'float' }, in_stock: { type: 'boolean' },
    url: { type: 'keyword', ignore_above: 1024 },
    dimensions_mm: { type: 'object', dynamic: true },
  } } });
} else if (!exists.ok) {
  throw new Error(`Cannot inspect index: ${exists.status}`);
}

for (let i = 0; i < records.length; i += 200) {
  const slice = records.slice(i, i + 200);
  const payload = slice.flatMap((record) => [
    JSON.stringify({ index: { _index: index, _id: record.sku } }),
    JSON.stringify(record),
  ]).join('\n') + '\n';
  const result = await elastic('/_bulk?refresh=wait_for', 'POST', payload, 'application/x-ndjson');
  if (result.errors) {
    const examples = result.items.filter((item) => item.index?.error).slice(0, 3)
      .map((item) => item.index.error);
    throw new Error(`Bulk indexing errors: ${JSON.stringify(examples)}`);
  }
  console.log(`Indexed ${Math.min(i + slice.length, records.length)}/${records.length}`);
}
console.log(`Done: ${records.length} indexed robotics parts in ${index}.`);
