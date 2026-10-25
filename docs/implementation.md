# Milestones 1–3 integration handoff

## Boundaries

- `src/contracts/models.ts`: Zod schemas and inferred Product/ModelAsset/GenerationJob types, schemaVersion 1.
- `src/cad/import.ts`: validates inputs, controls worker lifetime, parses GLB, keeps original File, and returns LoadedModel.
- `public/cad-worker.js`: isolated OpenCascade runtime, terminated after each job or cancellation/timeout.
- `public/cad-settings.json`: conversion settings shared by worker and geometry tests.
- `src/cad/geometry.ts`: meshes and hierarchy without changing coordinates; bounds checks and GPU resource disposal.
- `src/components/Viewer.tsx`: responsive camera fit, orbit/pan/zoom, orientation presets, wireframe, Y-up grid.
- `src/App.tsx`: uploads, fixture library, status/errors and inspector. Local memory only.

## Proposed Apify handoff

```json
{
  "retailer": "goBILDA",
  "sku": "1126-0001-0001",
  "name": "1126 Series Steel Flat Bracket",
  "category": "steel-flat-brackets",
  "url": "https://www.gobilda.com/1126-series-steel-flat-bracket-1-1-2-pack/",
  "images": [],
  "dimensions_mm": null,
  "cadSources": [],
  "actorRunId": "example-run-id",
  "scraped_at": "2026-10-24T17:00:00Z"
}
```

`cadSources` entries need `{url, format: 'step'|'stp'|'glb', sourceUrl}`. The actual manufacturer example currently links to a ZIP, so the future resolver must download/extract the supported CAD asset rather than mislabel the ZIP as STEP. Never submit an archive directly to this importer.

`images` entries require a URL and optionally `local` and `kind: photo|drawing|unknown`. `normalizeDiscovery` maps both the repository JSON and this payload into the same contract. Identity is lowercase retailer + SKU, falling back to normalized source URL. Derived model records are separate from product records.

## Next integration

Connect the real catalog without altering its scraper. Persist ModelAsset originals/previews and GenerationJob state through the chosen backend. Add image generation through the same loader, but preserve sourceKind=generated_image and scaleStatus=unknown. The current local loader accepts uploaded files/fixtures; generated assets must use a dedicated adapter that preserves those quality labels.

For connector detection later, retain B-Rep input and use analytic geometry. No automatic connectors or compatibility claims are implemented here.

## Assembly interaction milestone

`src/assembly/snapping.ts` defines PartInstance and Mate records. A source asset can produce multiple independently positioned instances; sources stay cached for the local session and own shared GPU geometry/material resources. Deleting an instance does not invalidate other copies. Undo retains the last 20 assembly edits.

Sidebar cards use an application-specific drag payload. The canvas projects a drop ray onto Y=0 and grounds the new instance without modifying its source geometry. Click-to-add and Duplicate place copies beside existing parts. Uploads become reusable sidebar sources.

Direct model dragging uses a camera-parallel plane through the initial hit point, with camera orbit temporarily disabled. Background dragging still orbits. Snap compares opposing axis-aligned bounding-box face centers within a size-relative distance (4–25 mm), aligns all three center coordinates, and rejects positive-volume AABB overlaps with other instances. Shift temporarily bypasses snapping. Release commits the transform and a Mate record; moving a connected part detaches its prior records. Escape/pointer cancellation restores its starting position.

This is a translation-only placement aid. It does not identify actual mounting faces, holes, or fastener compatibility, rotate parts into alignment, perform exact mesh collision detection, or rigidly move a connected group. Bounding boxes can reject valid interlocking placements and can align empty regions of non-box-shaped models. These limits are visible in the inspector.
