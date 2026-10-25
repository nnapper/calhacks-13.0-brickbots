import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { kindOf, cableCurve } from '../scene/placeholders.js';

type Dims = { diameter?: number | null; width?: number | null; length?: number | null; height?: number | null } | null | undefined;
export type PlaceholderProduct = { name: string; sku: string; dims?: Dims };
export type PlaceholderSize = { shape: 'disc' | 'box' | 'cable'; x: number; y: number; z: number; kind: string };

// Rough sizes in mm (length, height, width) for parts whose size is not in the catalog; chosen by what kind of part it is.
const DEFAULT_MM: Record<string, [number, number, number]> = {
  motor: [70, 36, 36], servo: [40, 36, 20], board: [45, 4, 30], plate: [48, 3, 48], channel: [48, 24, 24],
  wheel: [60, 60, 20], gear: [30, 30, 10], bit: [24, 24, 24], cable: [300, 8, 40],
};
const COLORS: Record<string, string> = { wheel: '#2b2f3a', gear: '#8a93a3', motor: '#4b525e', servo: '#4b525e', board: '#2f6b4f' };

// Sizes a stand-in from the part's real dimensions; falls back to a typical size for its kind. Axes match generated models:
// x = length, y = height (up), z = width. Discs (wheels, gears) have their axis along z.
export function placeholderSize(product: PlaceholderProduct): PlaceholderSize {
  const kind = kindOf(product) as string;
  const d = product.dims ?? null;
  const base = DEFAULT_MM[kind] ?? DEFAULT_MM.bit;
  // Cables run along x and bend sideways, so z is the sag width rather than a catalog width. A stated length wins.
  if (kind === 'cable') {
    const length = d?.length ?? base[0];
    return { shape: 'cable', x: length, y: base[1], z: length * .24 + 8, kind };
  }
  if (d?.diameter) return { shape: 'disc', x: d.diameter, y: d.diameter, z: d.width ?? Math.max(4, d.diameter * .25), kind };
  if (d && (d.length || d.width || d.height)) {
    return { shape: 'box', x: d.length ?? d.width ?? base[0], y: d.height ?? base[1], z: d.width ?? d.length ?? base[2], kind };
  }
  return kind === 'wheel' || kind === 'gear' ? { shape: 'disc', x: base[0], y: base[1], z: base[2], kind } : { shape: 'box', x: base[0], y: base[1], z: base[2], kind };
}

// Plain block or disc at the part's real size, for a catalog part that has no generated CAD yet. Exported as a
// self-contained GLB so it travels through the same import, save and restore path as any model.
export async function placeholderFile(product: PlaceholderProduct): Promise<File> {
  const size = placeholderSize(product);
  const mm = .001;
  const material = new THREE.MeshStandardMaterial({ color: COLORS[size.kind] ?? '#b9c0cb', metalness: .35, roughness: .55 });
  const root = new THREE.Group();
  let mesh: THREE.Object3D;
  if (size.shape === 'cable') {
    // Thin bendy lead with a plug at each end; the plug end faces are the cable's two attachment points.
    const length = size.x * mm, plug = 10 * mm;
    mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(new THREE.TubeGeometry(cableCurve(length, plug, 1.5 * mm), 64, 1.5 * mm, 8), new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: .7 })));
    const plugMaterial = new THREE.MeshStandardMaterial({ color: '#c9a15a', metalness: .6, roughness: .35 });
    for (const side of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.BoxGeometry(plug, 6 * mm, 6 * mm), plugMaterial);
      end.position.set(side * (length / 2 - plug / 2), 1.5 * mm, 0);
      mesh.add(end);
    }
  } else if (size.shape === 'disc') {
    const geometry = new THREE.CylinderGeometry(size.x / 2 * mm, size.x / 2 * mm, size.z * mm, 40);
    geometry.rotateX(Math.PI / 2);
    mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = size.y / 2 * mm;
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x * mm, size.y * mm, size.z * mm), material);
    mesh.position.y = size.y / 2 * mm;
  }
  root.add(mesh);
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) =>
    new GLTFExporter().parse(root, result => resolve(result as ArrayBuffer), reject, { binary: true }));
  return new File([buffer], `${product.name}.glb`, { type: 'model/gltf-binary' });
}
