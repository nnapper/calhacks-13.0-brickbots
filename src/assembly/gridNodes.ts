import type { Connector } from '../contracts/connectors';

export const GRID_PITCH_MM = 8;
export const GRID_HOLE_MM = 4;
type Vec = [number, number, number];
export type Bounds = { min: Vec; max: Vec };
export type HoleGrid = { counts: [number, number]; pitchMm: number; diameterMm: number; source: string };
type PartText = { name: string; specs?: string[] };

// Rule-based fallback for flat goBILDA parts whose holes sit on the 8 mm grid and are stated in the catalog text.
// Round-end pattern plates, U/L channels, mounts and motors are intentionally unsupported: their holes are not a
// single regular grid on one face, so they need a STEP file or a dimensioned drawing.
export function parseHoleGrid(part: PartText): HoleGrid | null {
  const text = [part.name, ...(part.specs ?? [])].join(' | ');
  const grid = !/grid plate/i.test(part.name) ? null : part.name.match(/\((\d+)\s*x\s*(\d+)\s*Hole/i) ?? part.specs?.map(s => s.match(/^(\d+)\s*x\s*(\d+)\s*hole/i)).find(Boolean);
  if (grid) return { counts: [Number(grid[1]), Number(grid[2])], pitchMm: GRID_PITCH_MM, diameterMm: GRID_HOLE_MM, source: grid[0] };
  if (!/flat (beam|bracket)/i.test(part.name)) return null;
  const linear = part.name.match(/\((\d+)\s*Hole/i) ?? text.match(/(?:^|\| )(\d+)[- ]hole/i);
  if (!linear) return null;
  return { counts: [1, Number(linear[1])], pitchMm: GRID_PITCH_MM, diameterMm: GRID_HOLE_MM, source: linear[0].replace(/^\|\s*/, '') };
}

// Places two opposing openings per hole on the thin axis faces, centered in the plate. Returns null when the stated
// grid does not fit the model's measured bounds, so a mismatched catalog entry never produces made-up nodes.
export function placeHoleGrid(grid: HoleGrid, bounds: Bounds, geometryRevision: string): Connector[] | null {
  const size = bounds.max.map((v, i) => v - bounds.min[i]);
  const order = [0, 1, 2].sort((a, b) => size[a] - size[b]);
  const [thin, short, long] = order;
  const pitch = grid.pitchMm / 1000;
  const counts = [...grid.counts].sort((a, b) => a - b);
  const spans = [(counts[0] - 1) * pitch, (counts[1] - 1) * pitch];
  const tolerance = 1e-6;
  if (spans[0] > size[short] + tolerance || spans[1] > size[long] + tolerance || grid.diameterMm / 1000 > size[short]) return null;
  if (size[thin] > size[short] * 0.75) return null;
  const center = bounds.min.map((v, i) => (v + bounds.max[i]) / 2);
  const nodes: Connector[] = [];
  for (let a = 0; a < counts[0]; a++) for (let b = 0; b < counts[1]; b++) for (const side of [-1, 1]) {
    const position = [...center] as Vec;
    position[short] = center[short] + a * pitch - spans[0] / 2;
    position[long] = center[long] + b * pitch - spans[1] / 2;
    position[thin] = side < 0 ? bounds.min[thin] : bounds.max[thin];
    const normal: Vec = [0, 0, 0]; normal[thin] = side;
    const tangent: Vec = [0, 0, 0]; tangent[long] = 1;
    nodes.push({
      id: `g${nodes.length + 1}`, geometryRevision, kind: 'hole', position, normal, tangent,
      label: `Grid hole ${a + 1}.${b + 1} ${side < 0 ? 'bottom' : 'top'}`,
      reason: `Inferred from catalog text "${grid.source}" on the ${grid.pitchMm} mm goBILDA grid, centered in the measured bounds. Not measured from CAD; confirm against the part before accepting.`,
      review: 'suggested', method: 'name_grid', diameterM: grid.diameterMm / 1000,
    });
  }
  return nodes;
}
