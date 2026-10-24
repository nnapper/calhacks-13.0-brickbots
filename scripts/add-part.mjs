// Adds a part that several sellers carry, then pulls live offers for it.
//
//   node --env-file=.env scripts/add-part.mjs --id sg90 --name "SG90 9g Micro Servo" \
//        --category servos --sku SG90 --dims 23x12x29 --url <seller1> --url <seller2> ...
//
// --dims is length x width x height in mm. Only give it if you have a source for it.
// Re-running with the same --id adds the new --url values to the existing part.

import { readFile, writeFile } from "node:fs/promises";
import { refresh } from "./apify-prices.mjs";

const args = process.argv.slice(2);
const all = (n) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1]] : []));
const one = (n) => all(n)[0];

const id = one("id");
const urls = all("url");
if (!id || !urls.length) {
  console.error("Usage: add-part.mjs --id <slug> --name <name> --category <c> [--sku S] [--dims LxWxH] --url <u> [--url <u> ...]");
  process.exit(1);
}

const FILE = "data/parts.json";
const parts = JSON.parse(await readFile(FILE, "utf8"));
const key = `generic:${id}`;
const p = (parts[key] ??= { retailer: null, generic: true, offer_urls: [] });
p.name = one("name") ?? p.name ?? id;
p.category = one("category") ?? p.category;
p.sku = one("sku") ?? p.sku;
p.offer_urls = [...new Set([...(p.offer_urls ?? []), ...urls])];
const dims = one("dims")?.split("x").map(Number);
if (dims?.length === 3 && dims.every(Number.isFinite)) {
  p.dimensions_mm = { length: dims[0], width: dims[1], height: dims[2], diameter: null, shaft_diameter: null, bore_diameter: null };
  p.dimensions_source = "manual";
} else if (!p.dimensions_mm) p.needs_dimensions = true;

await writeFile(FILE, JSON.stringify(parts, null, 2));
console.log(`${key}: ${p.offer_urls.length} seller urls`);
await refresh({ only: key });
