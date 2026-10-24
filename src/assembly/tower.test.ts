import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import truth from './fixtures/grid-truth.json';
import { findSnap, worldBox, overlaps, type PartInstance } from './snapping';
import type { Connector } from '../contracts/connectors';

// Real CAD-measured openings of the goBILDA 3x5 grid plate, as accepted nodes.
const plate = truth['1116-0024-0040'];
const nodes: Connector[] = plate.holes.map((h, i) => ({
  id: `n${i}`, geometryRevision: 'r', kind: 'hole', position: [h[0] / 1000, h[1] / 1000, h[2] / 1000], tangent: [1, 0, 0],
  normal: h[1] < 1 ? [0, -1, 0] : [0, 1, 0], label: 'hole', reason: 'CAD', review: 'accepted', method: 'step_analytic', diameterM: h[3] / 1000,
}));
const model = { geometryRevision: 'r', connectors: nodes, asset: { bounds: { min: plate.boundsMm.min.map(v => v / 1000), max: plate.boundsMm.max.map(v => v / 1000) } } };
const part = (id: string, position: [number, number, number], quaternion?: [number, number, number, number]) => ({ id, position, quaternion, model } as unknown as PartInstance);

describe('stacking real grid plates', () => {
  const base = part('base', [0, 0, 0]);
  it('snaps a plate dropped slightly above and offset onto the plate below, flush and not overlapping', () => {
    const moving = part('top', [0.0031, 0.0047, -0.0022]);
    const snap = findSnap(moving, moving.position, [base, moving], undefined, 0);
    expect(snap).not.toBeNull();
    const placed = { ...moving, position: snap!.position, quaternion: snap!.quaternion } as PartInstance;
    const a = worldBox(base), b = worldBox(placed);
    expect(b.min.y).toBeGreaterThanOrEqual(-1e-9);
    expect(overlaps(a, b)).toBe(false);
    expect(Math.abs(b.min.y - a.max.y)).toBeLessThan(1e-9);
  });
  it('never snaps a plate underneath a part that rests on the ground', () => {
    const below = part('below', [0, -0.0028, 0]);
    const snap = findSnap(below, below.position, [base, below], undefined, 0);
    if (snap) expect(worldBox({ ...below, position: snap.position, quaternion: snap.quaternion } as PartInstance).min.y).toBeGreaterThanOrEqual(-1e-9);
  });
  it('without a floor the same underside snap is allowed, so the floor check is what blocks it', () => {
    const below = part('below', [0, -0.0028, 0]);
    const snap = findSnap(below, below.position, [base, below]);
    expect(snap).not.toBeNull();
    expect(worldBox({ ...below, position: snap!.position, quaternion: snap!.quaternion } as PartInstance).min.y).toBeLessThan(0);
  });
  it('keeps the 30° step the user chose when the plate clicks in, with the holes still coincident', () => {
    for (const turns of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turns * Math.PI / 6).toArray() as [number, number, number, number];
      const moving = part('top', [0.0031, 0.0047, -0.0022], q);
      const snap = findSnap(moving, moving.position, [base, moving], undefined, 0)!;
      expect(snap).not.toBeNull();
      expect(new THREE.Quaternion(...snap.quaternion!).angleTo(new THREE.Quaternion(...q))).toBeLessThan(1e-6);
      const a = nodes.find(n => n.id === snap.movingNodeId)!;
      const world = new THREE.Vector3(...a.position).applyQuaternion(new THREE.Quaternion(...snap.quaternion!)).add(new THREE.Vector3(...snap.position));
      expect(world.distanceTo(new THREE.Vector3(...snap.point))).toBeLessThan(1e-9);
    }
  });
});

// A solid wall with only face click points (no holes): geometry and nodes straight from the CAD analyzer.
import wallNodes from './fixtures/wall-nodes.json';
import { analysisSchema } from '../contracts/connectors';
const wallConnectors = analysisSchema.parse(wallNodes).candidates.map(n => ({ ...n, review: 'accepted' as const }));
const wallModel = { geometryRevision: wallConnectors[0].geometryRevision, connectors: wallConnectors, asset: { bounds: { min: [-.024, 0, -.002], max: [.024, .024, .002] } } };
const wall = (id: string, position: [number, number, number], quaternion?: [number, number, number, number]) => ({ id, position, quaternion, model: wallModel } as unknown as PartInstance);
describe('walls connecting face to face', () => {
  const base = wall('base', [0, 0, 0]);
  const settle = (moving: PartInstance) => { const snap = findSnap(moving, moving.position, [base, moving], undefined, 0); return snap && ({ snap, placed: { ...moving, position: snap.position, quaternion: snap.quaternion } as PartInstance }); };
  it('a wall dragged next to another clicks flush against its end face without overlapping', () => {
    const result = settle(wall('next', [0.0495, 0.0013, 0.0011]));
    expect(result).not.toBeNull();
    const a = worldBox(base), b = worldBox(result!.placed);
    expect(overlaps(a, b)).toBe(false);
    expect(Math.abs(b.min.x - a.max.x)).toBeLessThan(1e-9);
  });
  it('a wall lowered onto another clicks flush on top and lines up on a face click point', () => {
    const result = settle(wall('on-top', [0.003, 0.0262, 0.0008]));
    expect(result).not.toBeNull();
    const a = worldBox(base), b = worldBox(result!.placed);
    expect(overlaps(a, b)).toBe(false);
    expect(Math.abs(b.min.y - a.max.y)).toBeLessThan(1e-9);
    const shift = (b.min.x - a.min.x) / 0.024; // click points sit at the center and ends of the face, so walls line up in 24 mm steps
    expect(Math.abs(shift - Math.round(shift))).toBeLessThan(1e-6);
  });
  it('every click point the analyzer found lies on the wall surface, so mates are exact', () => {
    for (const n of wallConnectors) { const p = n.position; expect([0, 1, 2].some(i => Math.abs(p[i] - wallModel.asset.bounds.min[i]) < 1e-9 || Math.abs(p[i] - wallModel.asset.bounds.max[i]) < 1e-9)).toBe(true); }
  });
});
