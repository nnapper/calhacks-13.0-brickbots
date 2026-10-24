# BrickBots

Building blocks for real robots: snap together real parts in 3D, see the cost as you build, and get a list of where to buy every piece.

## Run the app

```sh
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

API keys go in `.env` (never committed):

```
CONTEXT_DEV_API_KEY=...   # catalog scraping
APIFY_API_KEY=...         # live prices, also used by the app's "Check live prices" button
```

## Updating the parts catalog

All part data lives in `data/parts.json`. Run these steps in order to add new goBILDA parts. Every step
skips work it has already done, so re-running only processes new parts.

| # | Command | What it does | Cost |
|---|---|---|---|
| 1 | `npm run catalog:discover` | Finds goBILDA product pages (cached in `data/product-urls.json`) | Context.dev credits |
| 2 | `npm run catalog:scrape` | Pulls names, specs, prices and image links into `parts.json` (stops at 450 credits; change with `-- --max-credits N`) | Context.dev credits |
| 3 | `npm run enrich:images` | Downloads part photos to `public/parts/` | Free |
| 4 | `npm run enrich:dims` | Reads sizes written in part names and specs | Free |
| 5 | `npm run cad:dims` | Downloads goBILDA's CAD model for each part and measures it (models cached in `data/step/`) | Free |
| 6 | `npm run prices:refresh` | Live price and stock from every seller | Apify credits |

Steps 2 to 6 in one go (step 1 is only needed when goBILDA adds new products):

```sh
npm run catalog:update
```

Notes:

- **Steps 3 to 5 are free** and can run in any order after step 2.
- **Prices only:** step 6 can run on its own, for example right before a demo. It refreshes every part each time; add `-- --max-age-min 60` to skip prices checked in the last hour, or `-- --only <text>` for a few parts.
- **Parts from other sellers** (SG90 servo, TT motor, etc.) are added with `npm run part:add`, which fetches their prices through Apify. These have no CAD model, so pass the size from the datasheet with `--dims LxWxH` (mm). See the top of `scripts/add-part.mjs` for the full command.
- **Parts that still have no size** show "Size not listed" in the app. `cad:dims` marks goBILDA parts with no published model as `cad_missing: true`.

## Placeholders

These parts of the app are stand-ins the team plans to replace:

- `src/scene/placeholders.js`: part shapes and snapping. Parts are simple shapes in fixed slots, not true size.
- `src/lib/planner.js`: turns a typed description into a parts list using keyword matching, not AI.
