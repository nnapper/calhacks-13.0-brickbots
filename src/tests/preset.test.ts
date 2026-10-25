import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESET } from '../lib/preset.js';
import { BY_SKU, RAW_BY_SKU } from '../lib/catalog.js';
import { evaluateBuild } from '../compatibility/checks.js';

describe('example rover preset', () => {
  const skus = [...new Set(PRESET.parts.map((p: { sku: string }) => p.sku))];

  it('uses only priced catalog parts that have a pre-built model', () => {
    for (const sku of skus) {
      expect(BY_SKU[sku], `${sku} is in the priced catalog`).toBeDefined();
      expect(existsSync(`public/generated/${sku}/model.step`), `${sku} has a generated model`).toBe(true);
    }
  });

  it('connects every wheel to a motor and the compatibility check reports all pairs as matched', () => {
    const parts = PRESET.parts.map((p: { key: string; sku: string }) => ({ id: p.key, model: { asset: { productId: p.sku, name: p.sku }, connectors: [] }, scale: 1 }));
    const mates = PRESET.mates.map((m: { moving: string; target: string }) => ({ movingId: m.moving, targetId: m.target }));
    const health = evaluateBuild(parts, mates, BY_SKU, RAW_BY_SKU, {});
    expect(health.checked).toBe(4);
    expect(health.totals).toEqual({ compatible: 4, incompatible: 0, unknown: 0 });
  });
});

// Geometry checks on the real generated STEP models, placed exactly as loadPreset places them.
import { beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { cadToGroup } from '../cad/geometry';
import { PRESETS } from '../lib/preset.js';
import { compose } from '../lib/composer.js';

type Def = { key: string; sku: string; position: number[]; rotY: number; rotX?: number };
const turn = (def: Def) => new THREE.Quaternion().setFromEuler(new THREE.Euler((def.rotX ?? 0) * Math.PI / 180, def.rotY * Math.PI / 180, 0, 'YXZ'));
type Preset = { id: string; name: string; parts: Def[]; mates: { moving: string; target: string }[]; nested?: string[][] };
// Where each shaft runs (two points in the model's own frame, from its generator script) and where a mounted part's bore
// sits: its centre, its bore direction and half its length along the bore.
const SHAFT: Record<string, { a: number[]; b: number[] }> = {
  '5303-2402-0051': { a: [0, 18, 45.5], b: [0, 18, 69] },
  '5203-2402-0001': { a: [0, 18.5, 26], b: [0, 18.5, 50] },
  '2000-0025-0003': { a: [7, 10.1, 11.75], b: [7, 10.1, 18.25] },
  '2004-0025-0002': { a: [-12, 37, 0], b: [-12, 42, 0] },
};
const MOUNT: Record<string, { centre: number[]; axis: number[]; half: number }> = {
  '3624-4008-0048': { centre: [0, 24, 0], axis: [0, 0, 1], half: 9.35 },
  '3624-4008-0032': { centre: [0, 16, 0], axis: [0, 0, 1], half: 7 },
  '1900-0025-0104': { centre: [0, 5, 0], axis: [0, 0, 1], half: 3.8 },
  '1921-0025-0032': { centre: [0, 5, 0], axis: [0, 1, 0], half: 5 },
};
const require = createRequire(import.meta.url);
let occt: { ReadStepFile: (buffer: Uint8Array, settings: unknown) => Parameters<typeof cadToGroup>[0] };
beforeAll(async () => { occt = await require('occt-import-js')(); }, 30_000);

function place(def: Def) {
  const settings = JSON.parse(readFileSync('public/cad-settings.json', 'utf8'));
  const object = cadToGroup(occt.ReadStepFile(readFileSync(`public/generated/${def.sku}/model.step`), settings));
  object.position.set(...(def.position.map(v => v / 1000) as [number, number, number]));
  object.quaternion.copy(turn(def));
  object.updateMatrixWorld(true);
  return { def, object, box: new THREE.Box3().setFromObject(object) };
}
const mmPoint = (def: Def, local: number[]) => {
  return new THREE.Vector3(...local).applyQuaternion(turn(def)).add(new THREE.Vector3(...def.position));
};

const composed = ['4 wheel rover', 'small 2 wheel bot', 'rover that can carry 2 kg', '6 wheel truck', 'rover with a servo claw arm', 'two wheel arm bot under $300']
  .map(text => ({ ...compose(text), name: `composed "${text}"` })) as Preset[];
describe.each([...(PRESETS as Preset[]).filter(p => p.id !== 'rover'), ...composed])('$name geometry', preset => {
  const placed = new Map<string, ReturnType<typeof place>>();
  beforeAll(() => { for (const def of preset.parts) placed.set(def.key, place(def)); });

  it('uses only priced parts with a pre-built model and checks every connection as compatible', () => {
    for (const { sku } of preset.parts) {
      expect(BY_SKU[sku], `${sku} is priced`).toBeDefined();
      expect(existsSync(`public/generated/${sku}/model.step`), `${sku} has a model`).toBe(true);
    }
    const parts = preset.parts.map(p => ({ id: p.key, model: { asset: { productId: p.sku, name: p.sku }, connectors: [] }, scale: 1 }));
    const health = evaluateBuild(parts, preset.mates.map(m => ({ movingId: m.moving, targetId: m.target })), BY_SKU, RAW_BY_SKU, {});
    expect(health.totals).toEqual({ compatible: preset.mates.length, incompatible: 0, unknown: 0 });
  });

  it('seats each mounted part on its shaft', () => {
    for (const m of preset.mates) {
      const mounted = placed.get(m.moving)!.def, host = placed.get(m.target)!.def;
      const shaft = SHAFT[host.sku], mount = MOUNT[mounted.sku];
      const a = mmPoint(host, shaft.a), b = mmPoint(host, shaft.b), length = a.distanceTo(b);
      const centre = mmPoint(mounted, mount.centre);
      const line = new THREE.Line3(a, b), onAxis = line.closestPointToPoint(centre, false, new THREE.Vector3());
      expect(onAxis.distanceTo(centre), `${m.moving} is centred on the shaft axis`).toBeLessThan(0.5);
      const t = line.closestPointToPointParameter(centre, false) * length;
      const [from, to] = [t - mount.half, t + mount.half];
      // The shaft must run inside the mounted part's bore, or the part must sit along the shaft.
      const shaftInside = from <= 0.01 && to >= length - 0.01, partInside = from >= -0.01 && to <= length + 0.01;
      expect(shaftInside || partInside, `${m.moving} sits on the shaft`).toBe(true);
      const dir = mmPoint({ ...mounted, position: [0, 0, 0] }, mount.axis).normalize();
      expect(Math.abs(dir.dot(b.clone().sub(a).normalize())), 'bore parallel to shaft').toBeCloseTo(1, 5);
    }
  });

  it('keeps unconnected parts from overlapping and everything above the floor', () => {
    const connected = new Set([...preset.mates.map(m => [m.moving, m.target]), ...(preset.nested ?? [])].map(pair => [...pair].sort().join('|')));
    const all = [...placed.values()];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      if (connected.has([all[i].def.key, all[j].def.key].sort().join('|'))) continue;
      // Two boxes overlap when they interpenetrate by more than 0.05 mm on every axis; touching faces do not count.
      const overlap = all[i].box.clone().intersect(all[j].box);
      const depth = overlap.isEmpty() ? 0 : Math.min(overlap.max.x - overlap.min.x, overlap.max.y - overlap.min.y, overlap.max.z - overlap.min.z);
      expect(depth, `${all[i].def.key} and ${all[j].def.key} overlap`).toBeLessThan(5e-5);
    }
    for (const p of all) expect(p.box.min.y, `${p.def.key} is above the floor`).toBeGreaterThanOrEqual(-0.001);
  });
});

describe('servo spline compatibility', () => {
  const pair = (a: string, b: string) => evaluateBuild(
    [a, b].map(sku => ({ id: sku, model: { asset: { productId: sku, name: sku }, connectors: [] }, scale: 1 })),
    [{ movingId: b, targetId: a }], BY_SKU, RAW_BY_SKU, {}).pairs[0];
  it('matches a servo to a hub, arm or gear with the same spline', () => {
    expect(pair('2004-0025-0002', '1921-0025-0032').status).toBe('compatible');
    expect(pair('2000-0025-0003', '1900-0025-0104').status).toBe('compatible');
    expect(pair('2004-0025-0002', '2305-0025-0024').status).toBe('compatible');
  });
});
