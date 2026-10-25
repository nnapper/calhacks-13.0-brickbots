import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { overlaps, worldBox, type PartInstance } from './snapping';

// Solid-against-solid test on the real triangles, so a pole can go into a hole (the gap is empty space)
// but a plate cannot pass through a wheel. The moving part is tested slightly shrunk about its centre, so flush
// contact and a pole that is a hair wider than its hole (within the 2% hole tolerance) do not count as a hit.
export const CONTACT_SHRINK = .97;
export const SNAP_SHRINK = .93;

type Piece = { geometry: THREE.BufferGeometry; bvh: MeshBVH; local: THREE.Matrix4 };
const pieces = new WeakMap<THREE.Object3D, Piece[]>();

function piecesOf(root: THREE.Object3D): Piece[] {
  const cached = pieces.get(root); if (cached) return cached;
  const found: Piece[] = [];
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !o.geometry.getAttribute('position')) return;
    // The BVH reorders triangles, so it is built on a copy and the displayed geometry is left alone.
    const geometry = o.geometry.clone();
    const local = new THREE.Matrix4();
    for (let n: THREE.Object3D | null = o; n && n !== root; n = n.parent) { n.updateMatrix(); local.premultiply(n.matrix); }
    found.push({ geometry, bvh: new MeshBVH(geometry), local });
  });
  pieces.set(root, found);
  return found;
}

const pose = (p: PartInstance, position: [number, number, number], quaternion?: [number, number, number, number]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion(...(quaternion ?? [0, 0, 0, 1])), new THREE.Vector3().setScalar(p.scale ?? 1));

/** True when `moving`, placed at `position`/`quaternion`, pushes solid into any part not listed in `exempt`. */
export function collides(moving: PartInstance, position: [number, number, number], quaternion: [number, number, number, number] | undefined, parts: PartInstance[], exempt: ReadonlySet<string> = new Set(), shrink = CONTACT_SHRINK): boolean {
  try {
    const at = { ...moving, quaternion };
    const box = worldBox(at, position), centre = box.getCenter(new THREE.Vector3());
    const tight = new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z).multiply(new THREE.Matrix4().makeScale(shrink, shrink, shrink)).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z)).multiply(pose(moving, position, quaternion));
    for (const other of parts) {
      if (other.id === moving.id || exempt.has(other.id) || !overlaps(box, worldBox(other))) continue;
      const otherWorld = pose(other, other.position, other.quaternion);
      for (const a of piecesOf(moving.model.object)) {
        const aWorld = tight.clone().multiply(a.local), toA = aWorld.clone().invert();
        for (const b of piecesOf(other.model.object)) {
          if (a.bvh.intersectsGeometry(b.geometry, toA.clone().multiply(otherWorld).multiply(b.local))) return true;
        }
      }
    }
  } catch { /* a model that cannot be tested never blocks the user */ }
  return false;
}

/** Parts the moving part already overlaps or is joined to; these stay passable while it is dragged so it can never get stuck. */
export function startingContacts(moving: PartInstance, parts: PartInstance[], mates: { movingId: string; targetId: string }[] = []): Set<string> {
  const ids = new Set<string>();
  for (const m of mates) { if (m.movingId === moving.id) ids.add(m.targetId); else if (m.targetId === moving.id) ids.add(m.movingId); }
  for (const other of parts) if (other.id !== moving.id && !ids.has(other.id) && collides(moving, moving.position, moving.quaternion, [other])) ids.add(other.id);
  return ids;
}
