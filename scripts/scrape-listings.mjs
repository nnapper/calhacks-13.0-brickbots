// Adds new parts to data/parts.json by scraping seller category pages through Apify.
//
//   node --env-file=.env scripts/scrape-listings.mjs data/listings.json [--dry-run] [--max-usd 8]
//
// listings.json is [{ "url": <category page>, "category": <slug>, "max": <products> }, ...].
// Each listing runs on its own so `max` is per category. Parts are stored as
// `generic:<seller>-<id>` like part:add does, with the product's own url in offer_urls so
// `npm run prices:refresh` keeps them current. Re-runnable: known urls are skipped.
// Dimensions are left to `npm run enrich:dims`; images to `npm run enrich:images`.

import { readFile, writeFile } from "node:fs/promises";

const ACTOR = "apify~e-commerce-scraping-tool";
const FILE = "data/parts.json";
const PER_PRODUCT_USD = 0.008; // $0.006 product + proxy/browser surcharges, rounded up
const CONCURRENCY = 3;

const args = process.argv.slice(2);
const listingsFile = args.find((a) => !a.startsWith("--"));
const dry = args.includes("--dry-run");
const maxUsd = Number(args[args.indexOf("--max-usd") + 1]) || 8;
if (!listingsFile) {
  console.error("Usage: scrape-listings.mjs <listings.json> [--dry-run] [--max-usd N]");
  process.exit(1);
}

const norm = (u) => u.replace(/\/+$/, "");
const listings = JSON.parse(await readFile(listingsFile, "utf8"));
const planned = listings.reduce((n, l) => n + l.max, 0) * PER_PRODUCT_USD;
console.log(`${listings.length} listings, up to ${listings.reduce((n, l) => n + l.max, 0)} products, ~$${planned.toFixed(2)}`);
if (dry) process.exit(0);
if (planned > maxUsd) {
  console.error(`over --max-usd ${maxUsd}; raise it or trim the list`);
  process.exit(1);
}

const parts = JSON.parse(await readFile(FILE, "utf8"));
const known = new Set(Object.values(parts).flatMap((p) => [p.url, ...(p.offer_urls ?? [])]).filter(Boolean).map(norm));

async function run(l) {
  const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=240`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.APIFY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ listingUrls: [{ url: l.url }], scrapeMode: "AUTO", maxProductResults: l.max, additionalProperties: true }),
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return res.json();
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
const bigImage = (u) => u.replace(/\.\d+x\d+\.(jpe?g|png|webp)/i, ".600x480.$1");
const summary = [];

let i = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (i < listings.length) {
      const l = listings[i++];
      let items = [];
      try {
        items = await run(l);
      } catch (e) {
        console.error(`  ${l.category}: ${e.message}`);
      }
      let added = 0;
      for (const it of items) {
        const url = it.url ?? it.inputUrl;
        const extra = it.additionalProperties ?? {};
        const price = Number(String(it.offers?.price ?? "").replace(/[^\d.]/g, ""));
        if (!url || !it.name || !price || known.has(norm(url))) continue;
        known.add(norm(url));
        const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
        const key = `generic:${host}-${slug(extra.sku || it.name)}`;
        if (parts[key]) continue;
        const imgs = [it.image, ...(extra.images ?? []).map((x) => x.url)].filter(Boolean).map(bigImage);
        parts[key] = {
          retailer: null,
          generic: true,
          category: l.category,
          name: it.name,
          sku: `${host}-${extra.sku || slug(it.name)}`.slice(0, 64),
          description: (it.description ?? "").slice(0, 1200),
          specs: [],
          images: [...new Set(imgs)].slice(0, 4).map((u, n) => ({ url: u, alt: n === 0 ? it.name : `${it.name} view ${n}` })),
          offer_urls: [url],
          source_listing: l.url,
        };
        added++;
      }
      summary.push(`${l.category.padEnd(24)} ${added}/${items.length} new  ${l.url}`);
      await writeFile(FILE, JSON.stringify(parts, null, 2)); // save as we go
    }
  }),
);
console.log(summary.join("\n"));
console.log(`total parts: ${Object.keys(parts).length}`);
