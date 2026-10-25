import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { LoadedModel } from '../cad/import';
import { collides, startingContacts } from '../assembly/collision';
import type { PartInstance } from '../assembly/snapping';

function part(id: string, geometry: THREE.BufferGeometry, position: [number, number, number] = [0, 0, 0]): PartInstance {
  const object = new THREE.Group(); object.add(new THREE.Mesh(geometry));
  geometry.computeBoundingBox(); const box = geometry.boundingBox!;
  return { id, position, model: { object, asset: { bounds: { min: box.min.toArray(), max: box.max.toArray() } } } as unknown as LoadedModel };
}
// 100 x 100 x 6 mm plate with a centred 20 mm hole, and a 20 mm pole that fits it (units are metres).
function plate(id: string) {
  const shape = new THREE.Shape().moveTo(-.05, -.05).lineTo(.05, -.05).lineTo(.05, .05).lineTo(-.05, .05).closePath();
  shape.holes.push(new THREE.Path().absarc(0, 0, .01, 0, Math.PI * 2, true));
  return part(id, new THREE.ExtrudeGeometry(shape, { depth: .006, bevelEnabled: false, curveSegments: 48 }).translate(0, 0, -.003));
}
const pole = (id: string, position: [number, number, number]) => part(id, new THREE.CylinderGeometry(.01, .01, .05, 48).rotateX(Math.PI / 2), position);
const block = (id: string, position: [number, number, number]) => part(id, new THREE.BoxGeometry(.02, .02, .02), position);

describe('solid collision', () => {
  it('lets a pole pass through a hole it fits', () => {
    const base = plate('plate');
    expect(collides(pole('pole', [0, 0, 0]), [0, 0, 0], undefined, [base])).toBe(false);
    expect(collides(pole('pole', [0, 0, 0]), [0, 0, .02], undefined, [base])).toBe(false);
  });
  it('blocks a pole that would go through solid plate', () => {
    expect(collides(pole('pole', [0, 0, 0]), [.03, 0, 0], undefined, [plate('plate')])).toBe(true);
  });
  it('blocks one solid passing into another but allows flush contact', () => {
    const fixed = block('fixed', [0, 0, 0]);
    expect(collides(block('a', [0, 0, 0]), [.01, 0, 0], undefined, [fixed])).toBe(true);
    expect(collides(block('a', [0, 0, 0]), [.0200001, 0, 0], undefined, [fixed])).toBe(false);
    expect(collides(block('a', [0, 0, 0]), [.05, 0, 0], undefined, [fixed])).toBe(false);
  });
  it('lets parts listed as exempt overlap', () => {
    const fixed = block('fixed', [0, 0, 0]);
    expect(collides(block('a', [0, 0, 0]), [.01, 0, 0], undefined, [fixed], new Set(['fixed']))).toBe(false);
  });
  it('treats parts already overlapping at the start as passable so a drag cannot get stuck', () => {
    const fixed = block('fixed', [0, 0, 0]);
    const moving = block('moving', [.01, 0, 0]);
    expect([...startingContacts(moving, [fixed, moving])]).toEqual(['fixed']);
  });
});
