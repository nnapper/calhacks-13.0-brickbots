// Refreshes live price + stock for parts in data/parts.json using the Apify
// "E-commerce Scraping Tool" Actor, and stores them as part.offers[].
//
//   node --env-file=.env scripts/apify-prices.mjs [--only <text>] [--limit N] [--max-age-min N]
//
// A part is refreshed from its own `url` (goBILDA parts) and from every url in
// `offer_urls` (generic parts that several sellers carry), so the same code handles
// 100 parts or 10,000: chunks run in parallel, fresh offers are skipped, and the file is
// saved after every chunk so a dropped connection never loses work.
//
// Also importable by the app: `fetchOffers(urls)` and `refresh({ only, maxAgeMin })`.

import { readFile, writeFile } from "node:fs/promises";

const ACTOR = "apify~e-commerce-scraping-tool";
const FILE = "data/parts.json";
const RATES_FILE = "data/rates.json";
const CHUNK = 10;
const CONCURRENCY = 3;
const SUSPECT_BELOW = 0.4; // flag an offer under 40% of what the other sellers charge

const norm = (u) => u.replace(/\/+$/, "");

// the Actor leaves currency blank on some sites; fall back to the shop's country
const TLD_CURRENCY = { uk: "GBP", au: "AUD", nl: "EUR", de: "EUR", fr: "EUR", ca: "CAD", nz: "NZD" };
// .com shops that price in something other than USD
const HOST_CURRENCY = { "thepihut.com": "GBP", "shop.pimoroni.com": "GBP" };
const currencyFor = (url) => {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return HOST_CURRENCY[host] ?? TLD_CURRENCY[host.split(".").pop()] ?? "USD";
};

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

// ---------- offers from Apify ----------

async function runActor(chunk) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=240`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.APIFY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ detailsUrls: chunk.map((url) => ({ url })), scrapeMode: "AUTO" }),
        },
      );
      if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 3) throw e;
      console.error(`  retrying chunk (${e.cause?.code ?? e.message})`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

function toOffer(item) {
  const d = item.additionalDetails ?? {};
  const reported = d.currency || String(item.offers?.price ?? "").replace(/[\d.\s,]/g, "");
  const price = d.price ?? Number(String(item.offers?.price ?? "").replace(/[^\d.]/g, ""));
  if (!price) return null;
  const url = item.url ?? item.inputUrl;
  return {
    retailer: d.storeName?.replace(/[®™]/g, "") || item.marketplace,
    price: Number(price),
    currency: reported || currencyFor(url),
    currency_inferred: !reported,
    in_stock: d.availability ? /instock/i.test(d.availability) : null,
    url,
    checked_at: new Date().toISOString(),
  };
}

/** urls -> { [normalizedInputUrl]: offer }. onChunk(found) runs after each chunk completes. */
export async function fetchOffers(urls, onChunk) {
  const out = {};
  const chunks = [];
  for (let i = 0; i < urls.length; i += CHUNK) chunks.push(urls.slice(i, i + CHUNK));
  await pool(chunks, CONCURRENCY, async (chunk) => {
    const found = {};
    try {
      for (const item of await runActor(chunk)) {
        const offer = toOffer(item);
        if (offer) found[norm(item.inputUrl ?? item.url)] = offer;
      }
    } catch (e) {
      console.error(`  chunk failed after retries: ${e.message}`);
    }
    Object.assign(out, found);
    await onChunk?.(found);
  });
  return out;
}

// ---------- currency + sanity ----------

export async function loadRates() {
  const sources = [
    "https://api.frankfurter.dev/v1/latest?base=USD&symbols=GBP,AUD,EUR,CAD,NZD",
    "https://api.frankfurter.app/latest?from=USD&to=GBP,AUD,EUR,CAD,NZD",
  ];
  for (const src of sources) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const j = await res.json();
      const rates = { date: j.date, base: "USD", rates: { USD: 1, ...j.rates } };
      await writeFile(RATES_FILE, JSON.stringify(rates, null, 2));
      return rates;
    } catch {}
  }
  try {
    console.error("  exchange-rate API unreachable, using cached rates");
    return JSON.parse(await readFile(RATES_FILE, "utf8"));
  } catch {
    return { date: null, base: "USD", rates: { USD: 1 } };
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Adds price_usd to every offer and flags ones far below the other sellers. */
export function annotate(parts, { rates }) {
  for (const p of Object.values(parts)) {
    const offers = p.offers ?? [];
    for (const o of offers) {
      const r = rates[o.currency];
      o.price_usd = r ? Math.round((o.price / r) * 100) / 100 : null;
    }
    for (const o of offers) {
      const others = offers.filter((x) => x !== o && x.price_usd != null).map((x) => x.price_usd);
      o.suspect = o.price_usd != null && others.length > 0 && o.price_usd < SUSPECT_BELOW * median(others);
    }
  }
}

// ---------- refresh ----------

let writing = Promise.resolve();
const save = (parts) => (writing = writing.then(() => writeFile(FILE, JSON.stringify(parts, null, 2))));

export async function refresh({ only, limit = Infinity, maxAgeMin = 0 } = {}) {
  const parts = JSON.parse(await readFile(FILE, "utf8"));
  const entries = Object.entries(parts)
    .filter(([k, p]) => !only || `${k} ${p.name} ${p.sku}`.toLowerCase().includes(only.toLowerCase()))
    .slice(0, limit);

  const owners = {}; // normalized url -> part keys
  for (const [key, p] of entries) {
    const urls = p.offer_urls ?? (p.url?.startsWith("http") ? [p.url] : []);
    for (const u of urls) (owners[norm(u)] ??= []).push(key);
  }

  const cutoff = Date.now() - maxAgeMin * 60_000;
  const isFresh = (u) =>
    maxAgeMin > 0 &&
    owners[u].every((k) => parts[k].offers?.some((o) => norm(o.url) === u && Date.parse(o.checked_at) > cutoff));
  const urls = Object.keys(owners).filter((u) => !isFresh(u));
  console.log(`${urls.length} urls to refresh (${Object.keys(owners).length - urls.length} still fresh) for ${entries.length} parts`);

  const fx = await loadRates();
  const apply = async (found) => {
    for (const [u, offer] of Object.entries(found)) {
      for (const key of owners[u]) {
        const p = parts[key];
        p.offers = [...(p.offers ?? []).filter((o) => norm(o.url) !== u), offer];
      }
    }
    annotate(parts, fx);
    await save(parts); // save as we go
    console.log(`  saved ${Object.keys(found).length} offers`);
  };

  const offers = await fetchOffers(urls, apply);
  annotate(parts, fx);
  await save(parts);

  const missed = urls.filter((u) => !offers[u]);
  console.log(`got ${Object.keys(offers).length} offers; ${missed.length} urls returned nothing`);
  for (const u of missed) console.log("  no result:", u);
  return { refreshed: Object.keys(offers).length, missed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n) => {
    const i = args.indexOf(`--${n}`);
    return i === -1 ? undefined : args[i + 1];
  };
  await refresh({
    only: arg("only"),
    limit: Number(arg("limit") ?? Infinity),
    maxAgeMin: Number(arg("max-age-min") ?? 0),
  });
}
