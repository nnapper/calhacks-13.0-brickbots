import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { makePart } from '../scene/placeholders.js';
import { SCENE_UNIT_MM } from '../scene/scale.js';

// Category-based stand-in shape for a catalog part that has no generated CAD yet. Exported as a
// self-contained GLB so it travels through the same import, save and restore path as any model.
export async function placeholderFile(product: { name: string; sku: string }): Promise<File> {
  const part = makePart(product) as THREE.Group;
  part.userData = {};
  part.scale.setScalar(SCENE_UNIT_MM / 1000);
  const root = new THREE.Group();
  root.add(part);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  part.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  root.updateMatrixWorld(true);
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) =>
    new GLTFExporter().parse(root, result => resolve(result as ArrayBuffer), reject, { binary: true }));
  return new File([buffer], `${product.name}.glb`, { type: 'model/gltf-binary' });
}
