# BuildFlow

CAD assembly workspace with STEP/GLB import, geometry-based attachment nodes, Bitdeer recommendations, approved-node snapping, and Convex persistence. Product discovery and image-to-3D remain separate integrations.

## Run

Use Node.js 24 LTS (recommended; the installed test runner supports Node 22.12, 24, and 26+).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/. `postinstall` copies the OpenCascade runtime and licenses into ignored `public/vendor/occt/`. Basic viewing requires no API credentials. Geometry analysis needs the local Python service; AI recommendations and saved workspaces use the configuration below. Unsaved changes are lost on refresh.

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
3. Choose **Recommend with Bitdeer**. The server sends measured candidate metadata
   to Model Studio; returned IDs are validated. AI cannot invent coordinates or approve nodes.
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
