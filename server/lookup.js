// Vite plugin: finds goBILDA parts that aren't in data/parts.json yet and adds them on demand.
//
//   POST /api/lookup      { query }  -> { hits: [{ sku, url, name, detail, price, inStock }] }
//   POST /api/lookup/add     { url, sku } -> { part }  (the new parts.json entry, right after the scrape)
//   POST /api/lookup/finish  { sku }      -> { part }  (same entry once photos are saved and sizes are measured)
//
// Searching goBILDA's own site costs a Context.dev credit, so results are cached for a few minutes.
// Adding a part scrapes its page, then finishes in the background with the same free steps as `npm run catalog:update`
// (photos, sizes from the page text, CAD-measured size) so it looks like any other part.
// The Context.dev key stays in this Node process (read from .env).

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { HOST, SKU, scrapeProduct, searchSite } from "../scripts/catalog.mjs";

const run = promisify(execFile);
const PARTS_FILE = "data/parts.json";
const TTL_MS = 5 * 60_000;
const MAX_HITS = 12;

const searches = new Map(); // normalized query -> { at, hits }
let lock = Promise.resolve(); // parts.json is read-modify-written by several steps, so those steps go one at a time
const locked = (fn) => {
  const job = lock.then(fn);
  lock = job.catch(() => {});
  return job;
};
const finishJobs = new Map(); // sku -> promise of the finished entry
const findBySku = async (sku) => Object.values(await readParts()).find((p) => p.sku === sku);

const readParts = async () => JSON.parse(await readFile(PARTS_FILE, "utf8"));

// Drops the search tracking junk goBILDA appends to result links.
function cleanUrl(u) {
  const url = new URL(u);
  if (url.hostname.replace(/^www\./, "") !== HOST.replace(/^www\./, "") || url.protocol !== "https:") return null;
  return `https://${HOST}${url.pathname}`;
}

const slugOf = (url) => new URL(url).pathname.replace(/^\/|\/$/g, "");

function describe(hit, url) {
  const slug = slugOf(url).replace(/^\d{4}-\d{4}-\d{4}-?/, "").replace(/-/g, " ");
  const name = slug.charAt(0).toUpperCase() + slug.slice(1);
  const detail = hit.listing.replace(hit.sku, "").replace(/\$[\d,]+\.\d\d/, "").replace("OUT OF STOCK", "").trim();
  return { name, detail, inStock: !/OUT OF STOCK/i.test(hit.listing) };
}

async function lookup(query) {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  let hits = searches.get(q);
  if (!hits || Date.now() - hits.at > TTL_MS) {
    hits = { at: Date.now(), hits: await searchSite(q) };
    searches.set(q, hits);
  }
  // The site matches any word, so "potato wheel" returns every wheel. Keep only parts that mention every word.
  const words = q.split(" ").map((w) => (w.length > 3 ? w.replace(/s$/, "") : w));
  const relevant = (h, url) => {
    const text = `${slugOf(url).replace(/-/g, " ")} ${h.listing}`.toLowerCase();
    return words.every((w) => text.includes(w));
  };

  const have = await readParts();
  const haveSkus = new Set(Object.values(have).map((p) => p.sku));
  const out = [];
  for (const h of hits.hits) {
    const url = cleanUrl(h.url);
    if (!url || !relevant(h, url) || haveSkus.has(h.sku) || out.some((o) => o.sku === h.sku)) continue;
    out.push({ sku: h.sku, url, price: h.listed_price, ...describe(h, url) });
  }
  return out.slice(0, MAX_HITS);
}

async function add(rawUrl, sku) {
  const url = cleanUrl(rawUrl);
  if (!url || !SKU.test(sku ?? "")) throw new Error("not a goBILDA product link");

  const parts = await readParts();
  const existing = await findBySku(sku);
  if (existing) return existing;

  const category = slugOf(url);
  const { part } = await scrapeProduct(url, { category, sku });
  if (!part.name) throw new Error("couldn't read that product page");

  const step = (script, ...args) =>
    run(process.execPath, [script, ...args], { cwd: process.cwd(), timeout: 120_000 }).catch((e) =>
      console.error(`[lookup] ${script} ${args.join(" ")}: ${e.message}`),
    );

  await locked(async () => {
    // re-read: another add may have finished while this page was being scraped
    const fresh = await readParts();
    fresh[url] = part;
    await writeFile(PARTS_FILE, JSON.stringify(fresh, null, 2));
  });

  // Photos, sizes from the page text and the CAD-measured size take several seconds, so they finish after the part is already usable.
  finishJobs.set(sku, locked(async () => {
    await step("scripts/enrich.mjs", "images");
    await step("scripts/enrich.mjs", "dims");
    await step("scripts/cad-dims.mjs", "--only", sku);
  }).then(async () => {
    finishJobs.delete(sku);
    return findBySku(sku);
  }));
  return part;
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 10_000) throw new Error("request too large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

export default function lookupParts() {
  // must not return anything: Vite runs a returned function as a post-middleware hook
  const attach = (server) => {
    // parts.json changes under a running dev server; invalidate it by hand instead of letting
    // Vite reload the page (which would throw away the build in progress).
    const invalidate = () => {
      const mods = server.moduleGraph?.getModulesByFile(path.resolve(PARTS_FILE));
      mods?.forEach((m) => server.moduleGraph.invalidateModule(m));
    };

    const route = (url, fn) =>
      server.middlewares.use(url, (req, res) => {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        if (!process.env.CONTEXT_DEV_API_KEY) return send(res, 503, { error: "CONTEXT_DEV_API_KEY is not set on the server" });
        readJson(req)
          .then(fn)
          .then((body) => send(res, 200, body))
          .catch((e) => send(res, e instanceof SyntaxError ? 400 : 500, { error: e.message }));
      });

    route("/api/lookup/add", (body) => {
      if (typeof body.url !== "string") throw new Error("send a url");
      return add(body.url, body.sku).then((part) => (invalidate(), { part }));
    });
    route("/api/lookup/finish", async (body) => {
      const part = await (finishJobs.get(body.sku) ?? findBySku(body.sku));
      if (!part) throw new Error("unknown part");
      invalidate();
      return { part };
    });
    route("/api/lookup", async (body) => {
      if (typeof body.query !== "string" || body.query.trim().length < 2) throw new Error("send a query");
      return { hits: await lookup(body.query.slice(0, 100)) };
    });
  };
  return { name: "lookup-parts", configureServer: attach, configurePreviewServer: attach };
}
