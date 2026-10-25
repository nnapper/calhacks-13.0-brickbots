# BrickBots

CAD assembly workspace with STEP/GLB import, geometry-based attachment nodes, Bitdeer node and cross-part mate-pair recommendations, approved-node snapping, and Convex persistence. Product discovery and image-to-3D remain separate integrations.

## Run

Use Node.js 24 LTS (recommended; the installed test runner supports Node 22.12, 24, and 26+).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ for the unified robot planner. Start a build to open the real 3D CAD workspace in the center of the same page. `postinstall` copies the OpenCascade runtime and licenses into ignored `public/vendor/occt/`. Basic viewing requires no API credentials. Geometry analysis needs the local Python service; AI recommendations and saved workspaces use the configuration below. Unsaved changes are lost on refresh.

```sh
npm test
npm run build
```

## Supported input

- STEP/STP: OpenCascade WebAssembly in a disposable worker. Output explicitly requested in meters, absolute linear deflection 0.02 mm, angular deflection 0.15 radians.
- GLB: uncompressed, self-contained glTF 2.0, in its format-defined meters. External resources and unsupported compression need re-export.
- 30 MB file limit, 60-second STEP worker timeout, one-million-triangle preview limit. Triangle limits apply after parsing and do not guarantee low peak memory use.
- Native CAD, STL, OBJ, and loose glTF packages are not part of this milestone.

Drag a sidebar card onto the canvas to add a part; click a card to add beside existing parts. Uploads become reusable sidebar sources. Drag a part to move it, drag the background to orbit, scroll to zoom, and right-drag to pan. With Snap on, nearby accepted attachment nodes align on release. Hold Shift to bypass snapping. Duplicate, Remove, and Undo are available in the bottom toolbar. Escape cancels an active move. These are geometric placement snaps, not verified mechanical connections. Perspective/front/top/side/reset controls move the camera, never rescale the object. The original coordinate axes remain intact; no automatic CAD Z-up correction is guessed. The grid follows the viewer's Y-up convention and is visual only.

## Accuracy and representation

Original STEP bytes are retained for download and future B-Rep analysis. Preview triangles are not editable CAD or proof of mechanical compatibility. Requested tessellation tolerance is not a universal accuracy certification. Bounds are model-axis-aligned and reflect the source, not independent physical measurements.

The OCCT wrapper bakes placement into mesh coordinates and supplies a grouping tree. Preserve both; never recenter individual bodies. Tests cover a translated/rotated two-body STEP fixture.

`sourceToCanonicalTransform` is null for STEP because the wrapper resolves source units and placements internally without exposing a single transform. `sourceUnits` is also null rather than guessed. The `conversion` record captures the engine and meter output. GLB has an identity source transform. The analytic node service reads original STEP geometry in millimeters and converts its coordinates to scene meters.

## Integration contract

See `src/contracts/models.ts` and [the handoff](docs/implementation.md). `normalizeDiscovery` accepts current catalog records and the proposed Apify payload. Missing dimensions remain unknown; all scraped dimensions are unverified. No dimension is used to scale a model. The Apify fixture is a proposed handoff, not a claim that the teammate has confirmed it.

## Fixtures and checks

Bundled models are synthetic test assets, not manufacturer products:

- `plate.step`: 100 × 60 × 6 mm; four Ø8 mm through holes centered at X = ±35 mm, Y = ±15 mm.
- `assembly.step`: base plus a 20 × 10 × 30 mm body rotated 90° about Z and translated to (80, 20, 25) mm.
- `reference.glb`: independently generated 100 × 60 × 6 mm cuboid.

Regenerate STEP using `python scripts/fixtures/generate.py` in an environment with `cadquery-ocp==7.9.3.1.1`. Regenerate GLB with `node scripts/fixtures/generate-glb.mjs`. Ordinary builds/tests use the committed fixtures and need no Python installation.

Tests cover all 91 catalog records, Apify adapter compatibility, malformed inputs, meter conversion, empty holes, cylinder chord approximation, rotated-body placement, and GLB bounds. See [verification evidence](docs/verification.md) for real manufacturer-model validation.

## Third-party notices

`occt-import-js` is LGPL-2.1 and includes OpenCascade licensing. The runtime and both upstream license files are copied unmodified by `scripts/prepare-cad.mjs`; source: https://github.com/kovacsv/occt-import-js (version 0.0.23). Fonts are fetched from Google Fonts with local system fallbacks. Other dependencies retain their package licenses.

## Attachment nodes and sponsor integrations

Start the frontend (`npm run dev`) and local geometry service (`npm run geometry`).
The service requires Python with `.venv` dependencies from `server/requirements.txt`.
Configure `VITE_CONVEX_URL` and `CONVEX_DEPLOYMENT` in ignored `.env.local`, then run
`npx convex dev --once`. Store `BITDEER_API_KEY` only in Convex environment variables;
optionally set `BITDEER_MODEL` to an available chat model. Never use a `VITE_` prefix for secrets.

1. Import STEP/GLB or select a reference model.
2. Choose **Find geometry nodes**. STEP uses OpenCascade analytic planes and bore
   openings. GLB proposes triangle-based surface points, with lower confidence.
3. Choose **Recommend with Bitdeer**, or just keep working: once two or more analyzed
   parts share the workspace, the server also asks Bitdeer in the background to propose
   cross-part mate pairs. Every returned pair is revalidated against local type and
   diameter rules, the paired nodes are flagged in the inspector, and **Connect using**
   on a flagged node joins its suggested counterpart in one click. AI cannot invent
   coordinates or approve nodes.
4. Click a node, then a compatible node on another part to approve that pair and
   connect them exactly, including rotation and depth. The first node turns blue;
   Escape cancels. Alternatively, review individual nodes and select **Accept for snapping**. Accepted nodes are green;
   suggested nodes are amber. Drag parts near matching accepted nodes to align their
   positions and opposing normals. Shift bypasses snapping. A move detaches the old mate.
5. Choose **Save workspace** to upload original files, node reviews, transforms and mates
   to Convex. Reload restores them. Saving is explicit, not automatic. Concurrent saves
   are rejected rather than silently overwriting another tab's revision.

Workspaces use a random browser-local capability stored in localStorage. Keep the same
browser origin to reopen the workspace. This prototype has no user account sharing or
cross-device recovery; deleting browser storage loses its access token. Do not deploy as
an unrestricted public multi-tenant service without adding account auth and quotas.

Snapping is a placement aid, not collision detection or a mechanical fit certification.
Surface pairing does not establish compatibility; hole diameters are compared within
0.1 mm or 2%, whichever is larger. No threads, tolerance classes, fasteners or load checks
are inferred. Image-to-3D and the teammate-owned Apify ingestion remain separate work.

Checks: `npm test`, `npm run build`, `.venv/bin/python -m unittest server.test_geometry`.

## Merged catalog experience

The default `/` is the teammate's complete robot planner with seller comparison and
receipt flow. The build view replaces the placeholder assembly stage with the real 3D
CAD workspace, model library and attachment-node inspector. `/workspace.html` and
`/catalog.html` are redirects for existing bookmarks. Catalog photos and
category-based placeholder geometry are not manufacturer CAD; importing STEP/GLB
remains the accurate assembly path.
The catalog and exchange-rate data are preserved from main, including generic
multi-seller products. The `catalog:*`, `enrich:*`, `prices:refresh`, and `part:add`
commands are retained; their credentials remain in ignored environment files.

## Updating the parts catalog

API keys go in `.env` (never committed):

```
CONTEXT_DEV_API_KEY=...   # catalog scraping
APIFY_API_KEY=...         # live prices, also used by the app's "Check live prices" button
```

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
- **Parts that still have no size** show "Size not listed" in the BrickBots catalog. `cad:dims` marks goBILDA parts with no published model as `cad_missing: true`.

## BrickBots placeholders

These parts of the app are stand-ins the team plans to replace:

- `src/scene/placeholders.js`: part shapes and snapping. Parts are simple shapes in fixed slots, not true size.
- `src/lib/planner.js`: turns a typed description into a parts list using keyword matching, not AI.


### AI arrangements
The search builder uses Gemini to propose an inventory and layout, and Anthropic to independently review both. Set `GEMINI_API_KEY` and `ANTHROPIC_API_KEY` in the same Convex development deployment used by `VITE_CONVEX_URL`. Optional `GEMINI_MODEL` and `ANTHROPIC_MODEL` select model IDs available to those accounts. Provider failures are reported explicitly; another provider is not substituted for these roles.

Try “Create exactly three 20 mm cubes in an L shape” or “Arrange these existing parts into a tower.” New builds are staged until every requested model loads and the arrangement passes review. Failed builds do not add partial assemblies. An approved build is one undo step. Positions are bounding-box centers in millimeters, Y-up, with XYZ Euler rotations. Validation checks part identity/count, rotated floor bounds, and overlap between known solid boxes. Arbitrary catalog mesh fit and mechanical safety are not certified by an LLM review.

Run `npm test` for regression checks. `node --env-file=.env.local scripts/check-ai-workflow.mjs` runs a live three-block provider smoke test in an isolated Convex workspace without changing the saved user design; it requires working provider credentials and consumes API quota.
