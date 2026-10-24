// User-uploaded CAD (.stl). Parsed in the browser, saved in IndexedDB so it survives a reload,
// and registered in the catalog as a part with real dimensions taken from the model.
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { registerCustomPart, unregisterCustomPart } from "./catalog.js";
import { SCENE_UNIT_MM } from "../scene/scale.js";

export const UNITS = [
  ["mm", "mm"],
  ["cm", "cm"],
  ["in", "inches"],
];
const UNIT_MM = { mm: 1, cm: 10, in: 25.4 };
const MAX_BYTES = 50 * 1024 * 1024;

const DB = "brickbots";
const STORE = "cad";

// ---------- storage ----------

const openDb = () =>
  new Promise((resolve, reject) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE, { keyPath: "id" });
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}

// ---------- model -> part ----------

const fmt = (mm) => (mm >= 100 ? Math.round(mm) : Math.round(mm * 10) / 10);

function thumbnail(geometry) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(240, 180);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667799, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 3, 2);
    scene.add(sun);
    scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#E8A869", metalness: 0.3, roughness: 0.5 })));
    geometry.computeBoundingSphere();
    const r = geometry.boundingSphere.radius;
    const camera = new THREE.PerspectiveCamera(30, 240 / 180, r / 10, r * 20);
    camera.position.set(r * 2.4, r * 1.7, r * 2.4);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } catch {
    return null; // the card just shows "No photo"
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}

function buildCustomPart({ id, name, units, buffer }) {
  const geometry = new STLLoader().parse(buffer);
  const triangles = Math.floor((geometry.attributes.position?.count ?? 0) / 3);
  if (!triangles) throw new Error("no triangles found, is this a valid STL?");
  geometry.rotateX(-Math.PI / 2); // CAD is Z-up, the scene is Y-up
  geometry.center();
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const k = UNIT_MM[units] ?? 1;
  // after the rotation: x = CAD X, y = CAD Z (height), z = CAD Y
  const dimsMm = { length: size.x * k, width: size.z * k, height: size.y * k };
  const biggestMm = Math.max(dimsMm.length, dimsMm.width, dimsMm.height);
  if (!(biggestMm > 0)) throw new Error("the model has no size");

  return {
    sku: `CAD-${id}`,
    name,
    category: "custom",
    group: "custom",
    custom: true,
    geometry,
    dimsMm,
    // fit the model in the build space without letting a huge or tiny file wreck the view
    sceneScale: Math.min(Math.max(biggestMm / SCENE_UNIT_MM, 0.25), 1.1) / Math.max(size.x, size.y, size.z),
    offers: [{ store: "Your CAD file", price: 0, currency: "USD", priceUsd: 0, inStock: true, url: null, suspect: false }],
    price: 0,
    inStock: true,
    weightG: 0,
    img: thumbnail(geometry),
    specs: [
      ["Length", `${fmt(dimsMm.length)} mm`],
      ["Width", `${fmt(dimsMm.width)} mm`],
      ["Height", `${fmt(dimsMm.height)} mm`],
      ["Source", `Uploaded STL, read as ${units}, ${triangles.toLocaleString()} triangles`],
    ],
    url: null,
  };
}

// ---------- public API ----------

/** Parse, save and register an uploaded .stl. Throws a readable Error if the file can't be used. */
export async function addCadFile(file, units = "mm") {
  if (!/\.stl$/i.test(file.name)) throw new Error(`${file.name}: only .stl files are supported`);
  if (file.size > MAX_BYTES) throw new Error(`${file.name}: over the ${MAX_BYTES / 1024 / 1024} MB limit`);
  const rec = {
    id: crypto.randomUUID().slice(0, 8),
    name: file.name.replace(/\.stl$/i, ""),
    units,
    buffer: await file.arrayBuffer(),
    createdAt: Date.now(),
  };
  let part;
  try {
    part = buildCustomPart(rec);
  } catch (e) {
    // STLLoader fails with low-level DataView errors on empty or non-STL files
    const readable = /DataView|Offset|undefined|Invalid/i.test(e.message) ? "couldn't read it, the file may be empty or not a real STL" : e.message;
    throw new Error(`${file.name}: ${readable}`);
  }
  await withStore("readwrite", (s) => s.put(rec)).catch(() => {}); // storage can be blocked; the part still works this session
  registerCustomPart(part);
  return part;
}

/** Re-register everything saved from earlier sessions. */
export async function loadSavedCad() {
  let recs = [];
  try {
    recs = await withStore("readonly", (s) => s.getAll());
  } catch {
    return [];
  }
  const parts = [];
  for (const rec of recs.sort((a, b) => a.createdAt - b.createdAt)) {
    try {
      const part = buildCustomPart(rec);
      registerCustomPart(part);
      parts.push(part);
    } catch {}
  }
  return parts;
}

export async function removeCad(sku) {
  unregisterCustomPart(sku);
  await withStore("readwrite", (s) => s.delete(sku.replace(/^CAD-/, ""))).catch(() => {});
}
