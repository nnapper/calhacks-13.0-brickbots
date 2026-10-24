import raw from "../../data/parts.json";

export const GROUPS = [
  ["all", "All"],
  ["motors", "Motors"],
  ["wheels", "Wheels"],
  ["structure", "Structure"],
  ["electronics", "Electronics"],
  ["servos", "Servos"],
  ["gears", "Gears"],
  ["custom", "My CAD"],
];

export const GROUP_LABELS = {
  structure: "Structure",
  motors: "Motion",
  wheels: "Wheels",
  electronics: "Electronics",
  servos: "Servos",
  gears: "Gears & drive",
  custom: "My CAD parts",
};

export const GROUP_ORDER = ["structure", "motors", "wheels", "electronics", "servos", "gears", "custom"];

// Checked in order: "motor-controllers" / "motor-drivers" must land in electronics before "motor" claims them.
const GROUP_KEYWORDS = [
  ["electronics", ["controller", "driver", "electronics", "battery", "sensor", "wire", "switch", "commander"]],
  ["motors", ["motor", "gearbox"]],
  ["wheels", ["wheel", "tire", "caster"]],
  ["servos", ["servo"]],
  ["gears", ["gear", "sprocket", "pulley", "belt", "chain"]],
];

function groupOf(category) {
  for (const [group, words] of GROUP_KEYWORDS) {
    if (words.some((w) => category.includes(w))) return group;
  }
  return "structure";
}

// goBILDA lists spec-sheet diagrams ("Product Insight", "Schematic") alongside product photos; prefer the photo.
function pickImage(images) {
  const local = images.filter((i) => i.local);
  return (local.find((i) => !/Insight|Schematic/i.test(i.alt ?? "")) ?? local[0])?.local ?? null;
}

const STORE_NAMES = {
  "gobilda.com": "goBILDA",
  "shop.pimoroni.com": "Pimoroni",
  "thepihut.com": "The Pi Hut",
  "core-electronics.com.au": "Core Electronics",
  "superdroidrobots.com": "SuperDroid Robots",
  "pololu.com": "Pololu",
  "adafruit.com": "Adafruit",
  "sparkfun.com": "SparkFun",
  "taydaelectronics.com": "Tayda Electronics",
};
const storeName = (retailer) => {
  const host = retailer.replace(/^www\./, "");
  return STORE_NAMES[host.toLowerCase()] ?? host;
};

// Every seller for a part, cheapest first (in USD). Parts scraped before offers existed fall back to `prices`.
function normalizeOffers(p) {
  const offers = (p.offers ?? []).map((o) => ({
    store: storeName(o.retailer),
    price: o.price,
    currency: o.currency ?? "USD",
    priceUsd: o.price_usd ?? o.price,
    inStock: o.in_stock ?? null,
    url: o.url ?? p.url,
    suspect: Boolean(o.suspect),
  }));
  if (!offers.length && p.prices?.[0]?.price != null) {
    offers.push({ store: storeName(p.retailer ?? "goBILDA"), price: p.prices[0].price, currency: "USD", priceUsd: p.prices[0].price, inStock: p.in_stock ?? null, url: p.url, suspect: false });
  }
  return offers.filter((o) => o.priceUsd != null).sort((a, b) => a.priceUsd - b.priceUsd);
}

// Cheapest offer that isn't flagged as a suspicious price and isn't known to be out of stock.
export function bestOfferIndex(offers) {
  const i = offers.findIndex((o) => !o.suspect && o.inStock !== false);
  return i >= 0 ? i : 0;
}

function withSearchText(part) {
  const hay = `${part.sku} ${part.name} ${part.category} ${part.specs.flat().join(" ")}`.toLowerCase();
  return { ...part, hay, tokens: new Set(hay.split(/[^a-z0-9.]+/).filter(Boolean)) };
}

// Real outer size in mm. Scraped numbers win when they describe the whole part (a wheel's diameter, a
// plate's length × width); otherwise the size measured from the manufacturer's CAD model (bbox_mm, from
// `npm run cad:dims`). A lone scraped "length" is the overall length for structure (channels, beams)
// but something smaller elsewhere (a motor's shaft), so it's only trusted for structure.
function partDims(d, group, bbox) {
  if (d?.diameter) return { diameter: d.diameter, width: d.width ?? null };
  const known = d ? [d.length, d.width, d.height].filter((v) => v > 0).length : 0;
  if (known >= 2) return { length: d.length, width: d.width, height: d.height };
  if (bbox?.length === 3) return { length: bbox[0], width: bbox[1], height: bbox[2] };
  if (known === 1 && d.length > 0 && group === "structure") return { length: d.length, width: null, height: null };
  return null;
}

export const PARTS = Object.values(raw)
  .map((p) => ({ p, offers: normalizeOffers(p) }))
  .filter(({ offers }) => offers.length)
  .map(({ p, offers }) => ({
    sku: p.sku,
    name: p.name,
    category: p.category,
    group: groupOf(p.category),
    offers,
    price: offers[bestOfferIndex(offers)].priceUsd,
    inStock: offers.some((o) => o.inStock !== false),
    weightG: p.weight_g ?? 0,
    dims: partDims(p.dimensions_mm, groupOf(p.category), p.bbox_mm),
    img: pickImage(p.images ?? []),
    specs: (p.specs ?? []).filter((s) => s.includes(" | ")).map((s) => s.split(" | ")),
    url: p.url ?? offers[0].url,
  }))
  .map(withSearchText);

export const BY_SKU = Object.fromEntries(PARTS.map((p) => [p.sku, p]));

// Uploaded CAD parts join the catalog at runtime (see lib/custom.js).
export function registerCustomPart(part) {
  const p = withSearchText(part);
  PARTS.push(p);
  BY_SKU[p.sku] = p;
}
export function unregisterCustomPart(sku) {
  const i = PARTS.findIndex((p) => p.sku === sku);
  if (i >= 0) PARTS.splice(i, 1);
  delete BY_SKU[sku];
}

// Swap in fresh seller prices from /api/prices. Mutates the part in place so BY_SKU, PARTS and the 3D scene stay in sync.
export function applyLive(sku, rawOffers) {
  const part = BY_SKU[sku];
  if (!part) return;
  const offers = normalizeOffers({ offers: rawOffers, url: part.url, retailer: part.offers[0]?.store });
  if (!offers.length) return;
  part.offers = offers;
  part.price = offers[bestOfferIndex(offers)].priceUsd;
  part.inStock = offers.some((o) => o.inStock !== false);
}

const checkedTimes = Object.values(raw).flatMap((p) => (p.offers ?? []).map((o) => o.checked_at ?? "")).filter(Boolean).sort();
export const PRICES_CHECKED = checkedTimes.length
  ? new Date(checkedTimes.at(-1)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  : null;

export const findPart = (re) => PARTS.find((p) => re.test(p.name));

export const shortName = (name) => name.replace(/\s*\(.*$/, "").replace(/\s*-\s*\d+ Pack$/, "");

export function detailName(name) {
  const paren = name.match(/\(([^)]*)\)/);
  const pack = name.match(/(\d+ Pack)$/);
  return [paren?.[1], pack?.[1]].filter(Boolean).join(" · ");
}

export const money = (n, currency = "USD") => n.toLocaleString("en-US", { style: "currency", currency });

// True when a and b are equal or differ by one inserted, deleted or changed letter.
function withinOneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Score of one query word against one part, or 0 for no match. SKU and name hits beat spec hits; a one-letter typo still finds the part.
function wordScore(p, w) {
  if (p.sku.toLowerCase() === w) return 10;
  const inName = p.name.toLowerCase().indexOf(w);
  if (inName >= 0) return inName === 0 ? 4 : 3;
  if (p.hay.includes(w)) return 1.5;
  if (w.length >= 4) for (const t of p.tokens) if (withinOneEdit(t, w)) return 0.75;
  return 0;
}

// Every word must match something; best matches first. An empty query keeps catalog order.
export function searchParts(query, group) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const inGroup = PARTS.filter((p) => group === "all" || p.group === group);
  if (!words.length) return inGroup;
  return inGroup
    .map((p) => {
      let score = 0;
      for (const w of words) {
        const s = wordScore(p, w);
        if (!s) return null;
        score += s;
      }
      return { p, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map(({ p }) => p);
}
