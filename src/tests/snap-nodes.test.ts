import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { LoadedModel } from '../cad/import';
import type { Connector } from '../contracts/connectors';
import { findSnap, type Mate, type PartInstance } from '../assembly/snapping';

const node = (id: string, position: [number, number, number], normal: [number, number, number] = [0, 0, 1]): Connector => ({
  id, geometryRevision: 'r', kind: 'hole', position, normal, tangent: [1, 0, 0], label: id, reason: '', review: 'accepted', method: 'step_analytic', diameterM: .003,
});
function part(id: string, connectors: Connector[], position: [number, number, number] = [0, 0, 0], quaternion?: [number, number, number, number]): PartInstance {
  return { id, position, quaternion, model: { geometryRevision: 'r', connectors, asset: { bounds: { min: [-.05, -.05, -.005], max: [.05, .05, .005] } } } as unknown as LoadedModel };
}
const plate = (id = 'plate') => part(id, [node('h1', [-.01, 0, 0]), node('h2', [.01, 0, 0])]);
const screw = (position: [number, number, number], quaternion?: [number, number, number, number]) => part('screw', [node('tip', [0, 0, 0])], position, quaternion);

describe('node snapping', () => {
  it('does not snap into a hole that already holds a part', () => {
    const base = plate(), first = part('first', [node('tip', [0, 0, 0])]);
    const mates: Mate[] = [{ movingId: 'first', targetId: 'plate', movingNodeId: 'tip', targetNodeId: 'h1' }];
    const near = screw([-.0102, 0, 0]);
    expect(findSnap(near, near.position, [base, first, near], .004)?.targetNodeId).toBe('h1');
    expect(findSnap(near, near.position, [base, first, near], .004, undefined, mates)).toBeNull();
    const second = screw([.0102, 0, 0]);
    expect(findSnap(second, second.position, [base, first, second], .004, undefined, mates)?.targetNodeId).toBe('h2');
  });
  it('keeps the side a part is held on instead of forcing it round', () => {
    const base = plate();
    const down = screw([-.01, 0, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI).toArray() as [number, number, number, number]);
    const up = screw([-.01, 0, 0]);
    const axisOf = (q?: number[]) => new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...(q as [number, number, number, number])));
    expect(axisOf(findSnap(up, up.position, [base, up], .004)?.quaternion).z).toBeCloseTo(-axisOf(findSnap(down, down.position, [base, down], .004)?.quaternion).z, 6);
  });
  it('keeps the exact spin about the hole instead of rounding to 30 degrees', () => {
    const base = plate();
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(47));
    const moving = screw([-.01, 0, 0], spin.toArray() as [number, number, number, number]);
    const snap = findSnap(moving, moving.position, [base, moving], .004)!;
    const out = new THREE.Quaternion(...snap.quaternion!);
    expect(Math.abs(out.dot(spin))).toBeGreaterThan(.9999);
  });
});
