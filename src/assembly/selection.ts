import * as THREE from 'three';
import { worldBox, type PartInstance } from './snapping';

export type Rect = { left: number; top: number; right: number; bottom: number };

// Ids of the parts whose on-screen footprint touches a drag rectangle. `project` maps a world point to screen pixels.
export function partsInRect(parts: PartInstance[], project: (point: THREE.Vector3) => { x: number; y: number }, rect: Rect): string[] {
  return parts.filter(part => {
    const box = worldBox(part);
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const s = project(new THREE.Vector3(x, y, z));
      left = Math.min(left, s.x); right = Math.max(right, s.x); top = Math.min(top, s.y); bottom = Math.max(bottom, s.y);
    }
    return right >= rect.left && left <= rect.right && bottom >= rect.top && top <= rect.bottom;
  }).map(part => part.id);
}
