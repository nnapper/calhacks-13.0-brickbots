// Fills specs, dimensions and weight for parts added by scrape-listings.mjs, using the same
// Context.dev product scrape as the goBILDA catalog.
//
//   node --env-file=.env scripts/context-enrich.mjs [--limit N] [--max-credits 3000]
//
// Only touches parts that came from a listing scrape and have no `context_scraped_at` yet,
// so it is resumable. Prices stay with Apify; images and name are kept as they were.

import { readFile, writeFile } from "node:fs/promises";
import { scrapeProduct } from "./catalog.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const FILE = "data/parts.json";
const parts = JSON.parse(await readFile(FILE, "utf8"));
const todo = Object.entries(parts)
  .filter(([, p]) => p.source_listing && !p.context_scraped_at)
  .slice(0, opt("limit", Infinity));
const maxCredits = opt("max-credits", 3000);
console.log(`${todo.length} parts to enrich`);

let spent = 0;
let i = 0;
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (i < todo.length && spent < maxCredits) {
      const [key, p] = todo[i++];
      try {
        const { part, cost } = await scrapeProduct(p.offer_urls[0], { category: p.category, sku: p.sku });
        spent += cost;
        const hasDims = Object.values(part.dimensions_mm ?? {}).some((v) => typeof v === "number");
        if (hasDims) {
          p.dimensions_mm = part.dimensions_mm;
          p.dimensions_source = "context";
          delete p.needs_dimensions;
        }
        if (part.weight_g) p.weight_g = part.weight_g;
        if (part.specs?.length) p.specs = part.specs;
        if (part.description && part.description.length > (p.description ?? "").length) p.description = part.description;
        p.context_scraped_at = new Date().toISOString();
        await writeFile(FILE, JSON.stringify(parts, null, 2));
        console.log(`ok ${cost}cr ${hasDims ? "dims" : "no-dims"}  ${p.name.slice(0, 60)}`);
      } catch (e) {
        console.error(`ERR ${p.name.slice(0, 50)}: ${e.message.slice(0, 120)}`);
      }
    }
  }),
);
console.log(`spent ${spent} credits`);
