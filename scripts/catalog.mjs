// Builds data/parts.json from goBILDA via the Context.dev API.
//
//   node --env-file=.env scripts/catalog.mjs discover [--per-category 4] [--max-pages 60]
//   node --env-file=.env scripts/catalog.mjs scrape [--limit 5] [--max-credits 450]
//
// discover -> data/product-urls.json   (cached; re-running reuses it)
// scrape   -> data/parts.json          (resumable; already-scraped URLs are skipped)

import { mkdir, readFile, writeFile } from "node:fs/promises";

const API = "https://api.context.dev/v1";
const HOST = "www.gobilda.com";
const SKU = /^(\d{4}-\d{4}-\d{4})\b/;
const SEEDS = [
  "motors", "servos", "wheels-tires", "gears", "channel", "beams", "grid-plates",
  "pattern-plates", "brackets", "baseplates", "mounts", "shafting-tubing-1",
  "standoffs-spacers", "hinges-1", "sprockets-chain", "timing-belts-pulleys",
  "electronics", "hardware",
];
const SKIP_PATHS = new Set([
  "", "merch", "support", "education", "kits", "ftc", "cart.php", "login.php", "wishlist.php",
  "structure", "motion", "structure-bundles",
]);

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : Number(args[i + 1]);
};

async function api(path, init) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CONTEXT_DEV_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

// plan allows 2 concurrent requests; back off and retry when rate limited
async function scrape(body, tries = 4) {
  for (let n = 1; ; n++) {
    try {
      return await api("/web/scrape", { method: "POST", body: JSON.stringify(body) });
    } catch (e) {
      if (!String(e.message).startsWith("429") || n >= tries) throw e;
      await new Promise((r) => setTimeout(r, 2000 * n));
    }
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
      }
    }),
  );
}

// ---------- discover ----------

async function discover() {
  const perCategory = opt("per-category", 4);
  const maxPages = opt("max-pages", 60);
  const found = await readJson("data/product-urls.json", {});
  const seen = new Set();
  let queue = SEEDS.map((s) => ({ slug: s, depth: 0 }));
  let pages = 0;
  let credits = 0;

  while (queue.length && pages < maxPages) {
    const batch = queue.splice(0, 2);
    await pool(batch, 2, async ({ slug, depth }) => {
      if (seen.has(slug) || pages >= maxPages) return;
      seen.add(slug);
      pages++;
      let out;
      try {
        out = await scrape({
          url: `https://${HOST}/${slug}`,
          formats: { parse: true },
          parseParams: { type: "prebuilt", parser: "links" },
          sharedParams: { mainContentOnly: true },
        });
      } catch (e) {
        console.error(`  ! ${slug}: ${e.message}`);
        return;
      }
      credits += out.key_metadata?.credits_consumed ?? 0;
      const links = out.parsed?.data?.links ?? [];
      const products = links.filter((l) => l.text && SKU.test(l.text.trim()));
      const listed = (l) => {
        const t = l.text.trim();
        const price = t.match(/\$([\d,]+\.\d\d)/);
        return { sku: t.match(SKU)[1], listing: t, listed_price: price ? Number(price[1].replace(",", "")) : null };
      };
      if (products.length) {
        // spread picks across the list so we get different sizes/ratios, not 4 near-duplicates
        const step = Math.max(1, Math.floor(products.length / perCategory));
        const picks = products.filter((_, i) => i % step === 0).slice(0, perCategory);
        for (const p of picks) found[p.url] = { category: slug, ...listed(p) };
        console.log(`${slug}: ${products.length} products, kept ${picks.length}`);
        return;
      }
      if (depth >= 2) return;
      for (const l of links) {
        let u;
        try {
          u = new URL(l.url);
        } catch {
          continue;
        }
        const path = u.pathname.replace(/^\/|\/$/g, "");
        if (u.host !== HOST || u.search || u.hash || !l.text || path.includes("/")) continue;
        if (SKIP_PATHS.has(path) || path.endsWith(".php") || seen.has(path)) continue;
        queue.push({ slug: path, depth: depth + 1 });
      }
      console.log(`${slug}: category`);
    });
  }

  await mkdir("data", { recursive: true });
  await writeFile("data/product-urls.json", JSON.stringify(found, null, 2));
  console.log(`\n${Object.keys(found).length} product URLs saved. ${pages} pages, ${credits} credits.`);
}

// ---------- scrape ----------

const dim = (d) => ({ type: ["number", "null"], description: d });
const schema = {
  type: "object",
  properties: {
    name: { type: "string" },
    sku: { type: "string" },
    description: { type: "string" },
    in_stock: { type: ["boolean", "null"] },
    prices: {
      type: "array",
      description: "Every price shown, including quantity breaks",
      items: {
        type: "object",
        properties: {
          price: { type: "number" },
          currency: { type: "string" },
          min_qty: { type: "number" },
        },
      },
    },
    dimensions_mm: {
      type: "object",
      description: "Overall physical size of the part, converted to millimetres",
      properties: {
        length: dim("longest dimension"),
        width: dim(""),
        height: dim("thickness / depth"),
        diameter: dim("for round parts"),
        shaft_diameter: dim(""),
        bore_diameter: dim(""),
      },
    },
    weight_g: dim("weight in grams"),
    specs: { type: "array", items: { type: "string" }, description: "Other key specs, e.g. '312 RPM', '12V'" },
  },
};

async function scrapeParts() {
  const limit = opt("limit", Infinity);
  const maxCredits = opt("max-credits", 450);
  const urls = await readJson("data/product-urls.json", {});
  const parts = await readJson("data/parts.json", {});
  // round-robin across categories so a capped run still covers every part type
  const byCat = {};
  for (const e of Object.entries(urls)) if (!parts[e[0]]) (byCat[e[1].category] ??= []).push(e);
  const todo = [];
  for (let i = 0; todo.length < Object.values(byCat).flat().length; i++)
    for (const list of Object.values(byCat)) if (list[i]) todo.push(list[i]);
  todo.splice(limit);
  console.log(`${todo.length} to scrape (${Object.keys(parts).length} already done)`);

  let spent = 0;
  let stop = false;
  await pool(todo, 2, async ([url, meta]) => {
    if (stop) return;
    try {
      const out = await scrape({
        url,
        formats: { json: true, images: true },
        jsonParams: {
          schema,
          instructions:
            "Extract specs for this robotics part. Convert all lengths to millimetres. Use null for anything not on the page.",
        },
        imageParams: { enrich: ["dimensions"], dedupe: "visual" },
        sharedParams: { mainContentOnly: true },
      });
      const cost = out.key_metadata?.credits_consumed ?? 0;
      spent += cost;
      const images = (out.images?.data ?? [])
        .filter((i) => (i.width ?? 0) >= 300 && i.url.includes("/products/"))
        .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))
        .slice(0, 4)
        .map(({ url, alt, width, height }) => ({ url, alt, width, height }));
      parts[url] = {
        retailer: "goBILDA",
        url,
        category: meta.category,
        ...out.json?.data,
        sku: out.json?.data?.sku ?? meta.sku,
        images,
        scraped_at: new Date().toISOString(),
      };
      await writeFile("data/parts.json", JSON.stringify(parts, null, 2));
      console.log(`ok  ${cost}cr  ${parts[url].name ?? url}`);
      if (spent >= maxCredits) {
        stop = true;
        console.log(`credit cap ${maxCredits} reached`);
      }
    } catch (e) {
      console.error(`ERR ${url}: ${e.message}`);
    }
  });
  console.log(`\nspent ${spent} credits, ${Object.keys(parts).length} parts in data/parts.json`);
}

if (cmd === "discover") await discover();
else if (cmd === "scrape") await scrapeParts();
else console.error("Usage: catalog.mjs discover|scrape [options]");
