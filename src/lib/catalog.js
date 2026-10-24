import raw from "../../data/parts.json";

export const GROUPS = [
  ["all", "All"],
  ["motors", "Motors"],
  ["wheels", "Wheels"],
  ["structure", "Structure"],
  ["electronics", "Electronics"],
  ["servos", "Servos"],
  ["gears", "Gears"],
];

export const GROUP_LABELS = {
  structure: "Structure",
  motors: "Motion",
  wheels: "Wheels",
  electronics: "Electronics",
  servos: "Servos",
  gears: "Gears & drive",
};

export const GROUP_ORDER = ["structure", "motors", "wheels", "electronics", "servos", "gears"];

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
    img: pickImage(p.images ?? []),
    specs: (p.specs ?? []).filter((s) => s.includes(" | ")).map((s) => s.split(" | ")),
    url: p.url ?? offers[0].url,
  }));

export const BY_SKU = Object.fromEntries(PARTS.map((p) => [p.sku, p]));

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

export function searchParts(query, group) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return PARTS.filter(
    (p) =>
      (group === "all" || p.group === group) &&
      words.every((w) => (p.name + " " + p.specs.flat().join(" ")).toLowerCase().includes(w))
  );
}
