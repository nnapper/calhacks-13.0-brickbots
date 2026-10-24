// Measurement overlay for the build space: a floor ruler along the robot's length, plus width and
// height dimension lines, all labelled in mm or inches and resized to whatever is on the chassis.
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { SCENE_UNIT_MM } from "./scale.js";
import { formatLength } from "../lib/units.js";

const TICKS = {
  mm: { minor: 10, major: 50, label: 100 },
  in: { minor: 25.4 / 4, major: 25.4, label: 25.4 },
};
const GAP = 0.35; // distance from the robot's footprint to the guide lines, in scene units
const LIFT = 0.004; // keeps floor lines from z-fighting with the grid

const toScene = (mm) => mm / SCENE_UNIT_MM;
const toMm = (units) => units * SCENE_UNIT_MM;

function label(text, className = "mlabel") {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  return new CSS2DObject(el);
}

export class MeasureGuide {
  constructor() {
    this.group = new THREE.Group();
    this.unit = "mm";
    this.key = "";
    this.lineMat = new THREE.LineBasicMaterial({ color: 0x5b6788, transparent: true, opacity: 0.85 });
    this.dimMat = new THREE.LineBasicMaterial({ color: 0x7d93e8 });
  }

  setColors(tick, dimension) {
    this.lineMat.color.set(tick);
    this.dimMat.color.set(dimension);
  }

  setUnit(unit) {
    this.unit = unit;
    this.key = "";
  }

  hide() {
    this.group.visible = false;
    this.clear();
  }

  clear() {
    for (const child of [...this.group.children]) {
      child.geometry?.dispose();
      this.group.remove(child);
    }
    this.key = "";
  }

  // box: the robot's bounding box in scene units. Rebuilds only when the size changes by a millimetre or more.
  update(box) {
    if (box.isEmpty()) return this.hide();
    this.group.visible = true;
    const key = [this.unit, ...box.min.toArray(), ...box.max.toArray()].map((v) => (typeof v === "number" ? Math.round(toMm(v)) : v)).join(",");
    if (key === this.key) return;
    this.clear();
    this.key = key;

    const { min, max } = box;
    const t = TICKS[this.unit];
    const lengthMm = toMm(max.x - min.x);
    const widthMm = toMm(max.z - min.z);
    const heightMm = toMm(max.y);

    // floor ruler in front of the robot, starting at its back end and running past its front
    const rulerZ = max.z + GAP;
    const rulerMm = Math.max(Math.ceil(lengthMm / t.label) * t.label, 2 * t.label);
    const pts = [min.x, LIFT, rulerZ, min.x + toScene(rulerMm), LIFT, rulerZ];
    const steps = Math.round(rulerMm / t.minor);
    for (let i = 0; i <= steps; i++) {
      const mm = i * t.minor;
      const x = min.x + toScene(mm);
      const isLabel = Math.abs(mm / t.label - Math.round(mm / t.label)) < 1e-6;
      const isMajor = Math.abs(mm / t.major - Math.round(mm / t.major)) < 1e-6;
      const len = isLabel ? 0.13 : isMajor ? 0.09 : 0.045;
      pts.push(x, LIFT, rulerZ, x, LIFT, rulerZ + len);
      if (isLabel) {
        const n = Math.round(this.unit === "in" ? mm / 25.4 : mm);
        const tag = label(i === steps ? `${n} ${this.unit}` : `${n}`, "mtick");
        tag.position.set(x, LIFT, rulerZ + 0.24);
        this.group.add(tag);
      }
    }
    this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)), this.lineMat));

    // robot length marker: where the robot's front lands on the ruler
    const front = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(max.x, LIFT, max.z + 0.08), new THREE.Vector3(max.x, LIFT, rulerZ + 0.13)]);
    this.group.add(new THREE.Line(front, this.dimMat));
    const lengthTag = label(`Length ${formatLength(lengthMm, this.unit)}`);
    lengthTag.position.set((min.x + max.x) / 2, LIFT, rulerZ + 0.5);
    this.group.add(lengthTag);

    // width: along the right side on the floor, with end ticks
    const wx = max.x + GAP;
    const wPts = [wx, LIFT, min.z, wx, LIFT, max.z, wx - 0.06, LIFT, min.z, wx + 0.06, LIFT, min.z, wx - 0.06, LIFT, max.z, wx + 0.06, LIFT, max.z];
    this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(wPts, 3)), this.dimMat));
    const widthTag = label(`Width ${formatLength(widthMm, this.unit)}`);
    widthTag.position.set(wx + 0.3, LIFT, (min.z + max.z) / 2);
    this.group.add(widthTag);

    // height: a vertical line behind the back-left corner, from the floor to the top of the robot
    const hx = min.x, hz = min.z - GAP;
    const hPts = [hx, 0, hz, hx, max.y, hz, hx - 0.06, max.y, hz, hx + 0.06, max.y, hz];
    this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(hPts, 3)), this.dimMat));
    const heightTag = label(`Height ${formatLength(heightMm, this.unit)}`);
    heightTag.position.set(hx, max.y + 0.16, hz);
    this.group.add(heightTag);
  }
}
