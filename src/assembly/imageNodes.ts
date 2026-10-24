import { z } from 'zod';
import type { Connector } from '../contracts/connectors';
import { GRID_PITCH_MM, type Bounds } from './gridNodes';

// Shape a vision model must return. u runs along the part's longest axis and v along its middle axis, both in mm
// from the part's center when looking straight at the large face, so the answer does not depend on CAD axis order.
export const imageEstimateSchema = z.object({
  imageKind: z.enum(['drawing', 'photo']),
  holes: z.array(z.object({ uMm: z.number().finite(), vMm: z.number().finite(), diameterMm: z.number().positive().max(60) })).max(128),
  confidence: z.enum(['low', 'medium', 'high']),
  notes: z.string().max(600).optional(),
});
export type ImageEstimate = z.infer<typeof imageEstimateSchema>;

export const ESTIMATE_PROMPT = `You are reading a product image of a goBILDA part to locate its mounting holes.
If the image has a dimension drawing, use the printed dimensions, not the pixels. If it is only a photo, estimate from the
visible hole count and the 8 mm goBILDA grid, and set confidence "low".
Return JSON only: {"imageKind":"drawing"|"photo","holes":[{"uMm":number,"vMm":number,"diameterMm":number}],
"confidence":"low"|"medium"|"high","notes":string}. u is along the longest edge and v along the next longest, in mm from the
center of the large face. List each hole once. If you cannot see the holes, return an empty list.`;

// Moves coordinates onto the 8 mm lattice when every hole is already close to it; otherwise keeps raw values.
// Plates are centered on their hole pattern, so the lattice is either centered on a hole (offset 0) or between two (half pitch).
export function snapToGrid(values: number[], toleranceMm: number, pitch = GRID_PITCH_MM): { values: number[]; snapped: boolean } {
  if (!values.length) return { values, snapped: false };
  let best: { offset: number; worst: number; total: number } | null = null;
  for (const offset of [0, pitch / 2]) {
    const residuals = values.map(v => Math.abs(v - (Math.round((v - offset) / pitch) * pitch + offset)));
    const entry = { offset, worst: Math.max(...residuals), total: residuals.reduce((a, b) => a + b, 0) };
    if (!best || entry.total < best.total) best = entry;
  }
  if (!best || best.worst > toleranceMm) return { values, snapped: false };
  return { values: values.map(v => Math.round((v - best!.offset) / pitch) * pitch + best!.offset), snapped: true };
}

export function estimateToConnectors(input: unknown, bounds: Bounds, geometryRevision: string): Connector[] {
  const estimate = imageEstimateSchema.parse(input);
  const size = bounds.max.map((v, i) => v - bounds.min[i]);
  const [thin, short, long] = [0, 1, 2].sort((a, b) => size[a] - size[b]);
  const tolerance = estimate.imageKind === 'drawing' ? 0.5 : 1.5;
  const u = snapToGrid(estimate.holes.map(h => h.uMm), tolerance), v = snapToGrid(estimate.holes.map(h => h.vMm), tolerance);
  const snapped = u.snapped && v.snapped;
  const center = bounds.min.map((x, i) => (x + bounds.max[i]) / 2);
  const nodes: Connector[] = [];
  const method = estimate.imageKind === 'drawing' ? 'image_drawing' : 'image_photo';
  estimate.holes.forEach((hole, index) => {
    const [uMm, vMm] = [u.values[index], v.values[index]];
    if (Math.abs(uMm) / 1000 > size[long] / 2 + 1e-6 || Math.abs(vMm) / 1000 > size[short] / 2 + 1e-6) return;
    for (const side of [-1, 1]) {
      const position = [...center] as [number, number, number];
      position[long] = center[long] + uMm / 1000; position[short] = center[short] + vMm / 1000;
      position[thin] = side < 0 ? bounds.min[thin] : bounds.max[thin];
      const normal: [number, number, number] = [0, 0, 0]; normal[thin] = side;
      const tangent: [number, number, number] = [0, 0, 0]; tangent[long] = 1;
      nodes.push({
        id: `i${nodes.length + 1}`, geometryRevision, kind: 'hole', position, normal, tangent,
        label: `Estimated hole ${index + 1} ${side < 0 ? 'bottom' : 'top'}`,
        reason: `Read from a product ${estimate.imageKind} (${estimate.confidence} confidence${snapped ? ', snapped to the 8 mm grid' : ', not on the 8 mm grid'}). An estimate, not CAD; confirm before accepting.`,
        review: 'suggested', method, diameterM: hole.diameterMm / 1000,
      });
    }
  });
  return nodes;
}
