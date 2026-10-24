// Usage: node --env-file=.env scrape-part.mjs <product-page-url>
const url = process.argv[2];
if (!url) {
  console.error("Usage: node --env-file=.env scrape-part.mjs <product-page-url>");
  process.exit(1);
}

const schema = {
  type: "object",
  properties: {
    name: { type: "string" },
    manufacturer: { type: "string" },
    part_number: { type: "string" },
    description: { type: "string" },
    dimensions: {
      type: "object",
      description: "Physical size of the part; keep the units as written on the page",
      properties: {
        length: { type: "string" },
        width: { type: "string" },
        height: { type: "string" },
        diameter: { type: "string" },
        weight: { type: "string" },
        other: { type: "string", description: "Any other size specs, e.g. bore, hole pattern" },
      },
    },
    prices: {
      type: "array",
      description: "Every price shown, including quantity breaks and variants",
      items: {
        type: "object",
        properties: {
          price: { type: "number" },
          currency: { type: "string" },
          quantity: { type: "string" },
          variant: { type: "string" },
          in_stock: { type: "boolean" },
        },
      },
    },
  },
};

const res = await fetch("https://api.context.dev/v1/web/scrape", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.CONTEXT_DEV_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url,
    formats: { json: true, images: true, product: true },
    jsonParams: {
      schema,
      instructions: "Extract specs for this robotics part. Use null for anything not on the page.",
    },
    imageParams: { enrich: ["dimensions"], dedupe: "visual" },
    sharedParams: { mainContentOnly: true },
  }),
});

if (!res.ok) {
  console.error(res.status, await res.text());
  process.exit(1);
}

const out = await res.json();
console.log(
  JSON.stringify(
    {
      url: out.url,
      details: out.json?.data,
      product: out.product?.data,
      images: out.images?.data,
    },
    null,
    2,
  ),
);
