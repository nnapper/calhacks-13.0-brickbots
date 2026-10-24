// Vite plugin: POST /api/prices { skus: [...], force?: bool }
//
// Refreshes live seller prices through Apify and returns them to the browser. The Apify key
// stays in this Node process (read from .env); the browser only ever sees the results.
// Results are cached for a few minutes (memory + data/live-cache.json) so repeated clicks in
// a demo are instant, and if Apify is unreachable the last cached prices are served instead.

import { readFile, writeFile } from "node:fs/promises";
import { annotate, fetchOffers, loadRates } from "../scripts/apify-prices.mjs";

const PARTS_FILE = "data/parts.json";
const CACHE_FILE = "data/live-cache.json";
const TTL_MS = 5 * 60_000;
const MAX_SKUS = 40;

const norm = (u) => u.replace(/\/+$/, "");
const cache = new Map(); // sku -> { at, offers }
let cacheLoaded = false;

async function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    for (const [sku, v] of Object.entries(JSON.parse(await readFile(CACHE_FILE, "utf8")))) cache.set(sku, v);
  } catch {}
}

const persistCache = () => writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(cache), null, 2)).catch(() => {});

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 100_000) throw new Error("request too large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

async function handle(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  if (!process.env.APIFY_API_KEY) return send(res, 503, { error: "APIFY_API_KEY is not set on the server" });

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
  const skus = [...new Set(Array.isArray(body.skus) ? body.skus.filter((s) => typeof s === "string") : [])];
  if (!skus.length || skus.length > MAX_SKUS) return send(res, 400, { error: `send 1-${MAX_SKUS} skus` });

  await loadCache();
  const parts = JSON.parse(await readFile(PARTS_FILE, "utf8"));
  const bySku = Object.fromEntries(Object.values(parts).map((p) => [p.sku, p]));
  const known = skus.filter((s) => bySku[s]);
  const urlsOf = (s) => bySku[s].offer_urls ?? (bySku[s].url?.startsWith("http") ? [bySku[s].url] : []);

  const fresh = (s) => !body.force && cache.has(s) && Date.now() - cache.get(s).at < TTL_MS;
  const todo = known.filter((s) => !fresh(s));
  const urls = [...new Set(todo.flatMap((s) => urlsOf(s).map(norm)))];

  let error = null;
  let found = {};
  if (urls.length) {
    try {
      found = await fetchOffers(urls);
    } catch (e) {
      error = e.message;
    }
  }

  const fx = await loadRates();
  const prices = {};
  let refreshed = 0;
  for (const s of known) {
    const got = urlsOf(s).map(norm).filter((u) => found[u]);
    if (todo.includes(s) && got.length) {
      // start from what we already know and overwrite the sellers that answered
      const offers = (cache.get(s)?.offers ?? bySku[s].offers ?? []).filter((o) => !got.includes(norm(o.url)));
      offers.push(...got.map((u) => found[u]));
      const tmp = { [s]: { offers } };
      annotate(tmp, fx);
      cache.set(s, { at: Date.now(), offers: tmp[s].offers });
      refreshed++;
    }
    if (cache.has(s)) prices[s] = { offers: cache.get(s).offers, at: cache.get(s).at };
  }
  if (refreshed) persistCache();

  send(res, 200, {
    prices,
    refreshed,
    cached: known.length - todo.length,
    stale: Boolean(error) || (todo.length > 0 && refreshed === 0),
    error,
    unknown: skus.filter((s) => !bySku[s]),
    rates_date: fx.date,
  });
}

export default function livePrices() {
  // must not return anything: Vite runs a returned function as a post-middleware hook
  const attach = (server) => {
    server.middlewares.use("/api/prices", (req, res) =>
      handle(req, res).catch((e) => send(res, 500, { error: e.message })),
    );
  };
  return { name: "live-prices", configureServer: attach, configurePreviewServer: attach };
}
