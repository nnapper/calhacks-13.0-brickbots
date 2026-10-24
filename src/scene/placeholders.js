// PLACEHOLDER geometry and snapping. Parts are primitive shapes dropped into fixed slots on a rover chassis.
// Replace this module with real models and real connection points; BuildScene only relies on:
//   kindOf(part) -> string
//   makePart(part) -> THREE.Group (optionally with a child named "spin" that rotates on drive)
//   assignTargets(groups) -> sets group.userData.target (Vector3) for each group, in build order
import * as THREE from "three";

export function kindOf(p) {
  const n = p.name;
  if (/Controller|Commander|Programmer|Driver|Sensor/.test(n)) return "board";
  if (/Wheel|Flywheel/.test(n)) return "wheel";
  if ((/Motor\b/.test(n) && !/Mount|Hub/.test(n)) || /Gearbox/.test(n)) return "motor";
  if (/^Axon MAX Servo|Dual Mode Servo|ServoBlock|Micro Servo/.test(n)) return "servo";
  if (/Gear|Sprocket|Pulley|Chain|Rack/.test(n)) return "gear";
  if (/Baseplate|Grid Plate|Pattern Plate/.test(n)) return "plate";
  if (/Channel|Beam/.test(n)) return "channel";
  return "bit";
}

const mat = (color, metalness = 0.3, roughness = 0.5) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
const ALU = () => mat("#C9CED6", 0.55, 0.38);
const DARK = () => mat("#2B2F3A", 0.2, 0.6);
const TIRE = () => mat("#1E2128", 0, 0.88);
const BRASS = () => mat("#C9A15A", 0.6, 0.35);

const cyl = (r, h, seg = 28) => new THREE.CylinderGeometry(r, r, h, seg);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const BUILDERS = {
  plate(g) {
    g.add(mesh(box(2.4, 0.07, 1.4), ALU()));
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 4; j++) g.add(mesh(cyl(0.045, 0.074, 12), DARK(), -1 + i * 0.25, 0, -0.45 + j * 0.3));
  },
  channel(g) {
    const m = ALU();
    g.add(mesh(box(2.4, 0.04, 0.24), m));
    g.add(mesh(box(2.4, 0.2, 0.035), m, 0, 0.1, 0.105));
    g.add(mesh(box(2.4, 0.2, 0.035), m, 0, 0.1, -0.105));
    for (let i = 0; i < 8; i++) g.add(mesh(cyl(0.035, 0.045, 10), DARK(), -1.05 + i * 0.3, 0, 0));
  },
  wheel(g, p) {
    const spin = new THREE.Group();
    spin.name = "spin";
    const rollers = /Mecanum|Omni/.test(p.name);
    const add = (m, rotX = Math.PI / 2) => { m.rotation.x = rotX; spin.add(m); };
    add(mesh(cyl(0.42, 0.22, 40), TIRE()));
    add(mesh(cyl(0.24, 0.235, 24), rollers ? ALU() : mat("#D4D9E1", 0.4, 0.4)));
    if (rollers) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const r = mesh(cyl(0.07, 0.26, 12), mat("#3A3F4C", 0.1, 0.7), Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0);
        r.rotation.z = a;
        r.rotation.x = /Mecanum/.test(p.name) ? 0.7 : Math.PI / 2;
        spin.add(r);
      }
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(mesh(cyl(0.035, 0.25, 10), DARK(), Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0));
    }
    add(mesh(cyl(0.05, 0.27, 12), DARK()));
    g.add(spin);
  },
  motor(g, p) {
    const axis = new THREE.Group();
    axis.name = "axis";
    const body = /Yellow Jacket/.test(p.name) ? mat("#F2C230", 0.25, 0.42) : /Saturn/.test(p.name) ? mat("#6B7280", 0.5, 0.4) : ALU();
    axis.add(mesh(cyl(0.15, 0.42), body));
    axis.add(mesh(cyl(0.155, 0.04), DARK(), 0, -0.23, 0));
    axis.add(mesh(cyl(0.14, 0.17), ALU(), 0, 0.29, 0));
    axis.add(mesh(cyl(0.035, 0.14, 8), DARK(), 0, 0.44, 0));
    g.add(axis);
  },
  board(g) {
    g.add(mesh(box(0.5, 0.06, 0.38), mat("#2D3F66", 0.15, 0.5)));
    g.add(mesh(box(0.12, 0.08, 0.3), DARK(), 0.15, 0.06, 0));
    const led = mesh(
      new THREE.SphereGeometry(0.025, 10, 10),
      new THREE.MeshStandardMaterial({ color: "#7CE0B0", emissive: "#3BD18A", emissiveIntensity: 0.9 }),
      -0.17, 0.05, 0.13
    );
    led.userData.keepEmissive = true;
    g.add(led);
  },
  servo(g) {
    g.add(mesh(box(0.4, 0.2, 0.2), DARK()));
    g.add(mesh(cyl(0.05, 0.05, 16), ALU(), 0.1, 0.12, 0));
    g.add(mesh(box(0.04, 0.025, 0.34), ALU(), 0.1, 0.15, 0.1));
  },
  gear(g) {
    const axis = new THREE.Group();
    axis.add(mesh(cyl(0.22, 0.05, 24), BRASS()));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      axis.add(mesh(box(0.05, 0.05, 0.05), BRASS(), Math.cos(a) * 0.23, 0, Math.sin(a) * 0.23));
    }
    axis.add(mesh(cyl(0.06, 0.07, 12), ALU()));
    axis.rotation.x = Math.PI / 2;
    g.add(axis);
  },
  bit(g) {
    g.add(mesh(box(0.2, 0.08, 0.2), ALU()));
    g.add(mesh(cyl(0.03, 0.09, 8), DARK(), 0.05, 0.01, 0.05));
  },
};

export function makePart(p) {
  const g = new THREE.Group();
  const kind = kindOf(p);
  BUILDERS[kind](g, p);
  g.userData = { sku: p.sku, kind, target: new THREE.Vector3() };
  return g;
}

const SLOTS = {
  plate: [[0, 0.52, 0]],
  channel: [[0, 0.575, 0.6], [0, 0.575, -0.6]],
  wheel: [[0.95, 0.42, 0.9], [0.95, 0.42, -0.9], [-0.95, 0.42, 0.9], [-0.95, 0.42, -0.9], [0, 0.42, 0.9], [0, 0.42, -0.9]],
  motor: [[0.95, 0.3, 0.42], [0.95, 0.3, -0.42], [-0.95, 0.3, 0.42], [-0.95, 0.3, -0.42]],
  board: [[-0.3, 0.59, 0], [0.35, 0.59, 0], [-0.3, 0.66, 0], [0.35, 0.66, 0]],
  servo: [[-0.85, 0.66, 0.05], [0.85, 0.66, 0.05]],
  gear: [[0.45, 0.3, 0.6], [0.45, 0.3, -0.6], [-0.45, 0.3, 0.6], [-0.45, 0.3, -0.6]],
};

function overflowSlot(i) {
  const xs = [-0.9, -0.55, -0.2, 0.15, 0.5, 0.85];
  const zs = [0.33, -0.33];
  const layer = Math.floor(i / 12), j = i % 12;
  return [xs[j % 6], 0.6 + layer * 0.12, zs[Math.floor(j / 6)]];
}

export function assignTargets(groups) {
  const used = {};
  let overflow = 0;
  for (const g of groups) {
    const { kind } = g.userData;
    const i = (used[kind] = (used[kind] ?? -1) + 1);
    const slot = SLOTS[kind]?.[i] ?? overflowSlot(overflow++);
    g.userData.target.set(...slot);
    if (kind === "motor") g.getObjectByName("axis").rotation.x = slot[2] >= 0 ? Math.PI / 2 : -Math.PI / 2;
  }
}
