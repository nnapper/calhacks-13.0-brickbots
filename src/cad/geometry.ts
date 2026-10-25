import * as THREE from 'three';
import type { CadNode, CadResult } from './types';

// OCCT output is explicitly requested in meters. Do not scale or recenter individual bodies.
export function cadToGroup(result: CadResult): THREE.Group {
  if (!result.success || !result.meshes.length) throw new Error('This STEP file contains no readable solid geometry.');
  const created: THREE.Mesh[] = [];
  try {
    for (const m of result.meshes) {
      const positions = m.attributes.position.array;
      if (!positions.length || positions.length % 3 || positions.some(v => !Number.isFinite(v))) throw new Error('Invalid CAD vertex coordinates.');
      if (m.index.array.some(i => !Number.isInteger(i) || i < 0 || i >= positions.length / 3)) throw new Error('Invalid CAD triangle indices.');
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setIndex(m.index.array);
      if (m.attributes.normal) g.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
      else g.computeVertexNormals();
      const color = m.color ? new THREE.Color(m.color[0], m.color[1], m.color[2]) : new THREE.Color('#bdc9d5');
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.42, side: THREE.DoubleSide }));
      mesh.name = m.name ?? 'Body'; created.push(mesh);
    }
    const seen = new Set<number>();
    function build(node: CadNode): THREE.Group {
      const group = new THREE.Group(); group.name = node.name;
      for (const index of node.meshes ?? []) {
        if (!created[index]) throw new Error('Invalid CAD body reference.');
        group.add(created[index].clone()); seen.add(index);
      }
      for (const child of node.children ?? []) group.add(build(child));
      return group;
    }
    const root = build(result.root);
    created.forEach((mesh, i) => { if (!seen.has(i)) root.add(mesh); });
    inspectBounds(root);
    return root;
  } catch (error) { created.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }); throw error; }
}
export function inspectBounds(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  if (box.isEmpty() || [...box.min.toArray(), ...box.max.toArray()].some(v => !Number.isFinite(v)) || size.length() <= 0) throw new Error('The model has empty or invalid bounds.');
  return { box, size, center: box.getCenter(new THREE.Vector3()) };
}
export function disposeModel(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>();
  object.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    geometries.add(o.geometry);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      materials.add(m);
      Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); });
    });
  });
  textures.forEach(t => { t.dispose(); const image = t.source?.data; if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close(); });
  materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
}
