# Verification — October 24, 2026

## Automated

`npm test`: 11 passing tests. Tests run the actual occt-import-js WASM converter against STEP fixtures, not a mock. Known bounds are compared within 0.0001 mm; cylinder triangle-edge midpoint deviation is checked against requested 0.02 mm tessellation tolerance. Four hole-center rays pass through empty space and a center ray hits material. The transformed assembly retains its expected two-body placement. GLB uses an independent cuboid fixture.

The proposed Apify payload and all 91 existing catalog records pass normalization, including null dimension objects. These checks do not establish a live Apify integration.

## Manufacturer STEP

Source: https://www.gobilda.com/1126-series-steel-flat-bracket-1-1-2-pack/

Download: https://www.gobilda.com/content/step_files/1126-0001-0001.zip

The manufacturer's 1126-0001-0001.STEP was downloaded to a temporary directory for verification, not bundled for redistribution. Independent native OpenCascade B-Rep inspection gave bounds (-28,0,-7) to (28,2.5,7) mm and seven cylindrical bore axes at X = -24,-16,-8,0,8,16,24 mm, Z = 0, along Y, radius 2 mm. Native B-Rep values are the reference for conversion fidelity, not independent physical-product measurements.

The WASM importer reproduced the 56 × 2.5 × 14 mm bounds. The maximum checked cylinder edge-midpoint deviation was approximately 0.001399 mm across 1176 cylinder triangles, under the requested 0.02 mm tolerance. This is a bounded fixture check, not a global mesh Hausdorff-error guarantee.

Reproduce after downloading/unzipping the original:

```sh
node scripts/verify-manufacturer.mjs /path/to/1126-0001-0001.STEP
```

Exact source hash and results: [manufacturer-validation.json](manufacturer-validation.json).

## Browser checks

Verified in the in-app browser: startup, STEP worker import, plate dimensions, front view, assembly bounds (135 × 60 × 43 mm), GLB reference load, and real manufacturer file upload (56 × 2.5 × 14 mm). No console errors observed during these imports. The responsive layout was inspected at narrow and wider panel widths.

## Limitations

No persistence, live Apify, image generation, connector analysis, mechanically verified snapping, STL/native CAD support, or precision measurement tools in this milestone. Models and their originals remain in local session memory. Native STEP unit/placement metadata is resolved by the importer but not fully exposed by its JS wrapper. Large files can still have high peak memory usage before complexity rejection.

## Assembly verification

17 tests pass, including six snapping tests covering opposing faces on all three axes, translated/non-centered geometry, scale preservation, out-of-range/self rejection, third-part overlap rejection, and drop/click placement. Browser checks verified two independent plates, drag-to-snap with a recorded connection, undo restoring separation, and a third plate dragged from the sidebar into the existing scene.

## Sponsor and node integration — 2026-10-24

- Convex development functions deployed to `impartial-orca-995`.
- Live Bitdeer action returned six schema-validated selections using
  `deepseek-ai/DeepSeek-V4.1-Flash`; repeated through the actual browser UI.
- Plate analytic extraction: eight Ø8 mm bore openings at X±35, Y±15, Z±3 mm
  and six planar surface proposals. Invalid STEP input is rejected.
- Browser: accepted n7/n8, duplicated plate, saved originals/reviews/transforms,
  refreshed and restored both parts. Dragging restored plate to the matching
  accepted node produced `2 parts · 1 snaps` and both parts marked SNAPPED.
- 22 JavaScript tests and 2 Python geometry tests passed. Production build passed
  with a non-blocking bundle-size warning.
- AI uses geometry metadata, not images. No collision or mechanical-fit solver.
  Persistence is explicit via Save workspace and scoped to a browser-local token.

### All reference-node pairings

Exhaustive matrix of 26 analytic nodes (14 plate, 12 assembly): 676 ordered pairs,
each exercised in three target orientations. Checks world-space coincidence to
1e-10 meters, opposing normals, unit quaternion, compatible automatic snapping,
and rejection of disabled nodes. Total JS suite: 699 passing tests.
Inspector buttons provide exact selection for occluded or overlapping node markers.
This establishes transform behavior for the reference candidates, not mechanical
compatibility for arbitrary uploaded geometry.
