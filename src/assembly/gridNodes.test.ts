import { describe, it, expect } from 'vitest';
import truth from './fixtures/grid-truth.json';
import parts from '../../data/parts.json';
import { parseHoleGrid, placeHoleGrid } from './gridNodes';
import { estimateToConnectors, snapToGrid } from './imageNodes';

type Catalog = Record<string, { sku: string; name: string; specs: string[] }>;
const catalog = Object.values(parts as Catalog);
const bySku = (sku: string) => catalog.find(p => p.sku === sku)!;
const meters = (b: { min: number[]; max: number[] }) => ({ min: b.min.map(v => v / 1000), max: b.max.map(v => v / 1000) }) as { min: [number, number, number]; max: [number, number, number] };
const key = (p: number[]) => p.map(v => Math.round(v * 1e5) / 1e5).join(',');
// Every hole opening the STEP analyzer found, as exact [x, y, z] meters.
const truthKeys = (sku: keyof typeof truth) => new Set(truth[sku].holes.map(h => key([h[0] / 1000, h[1] / 1000, h[2] / 1000])));

describe('name-based hole grid vs real STEP holes', () => {
  for (const sku of ['1126-0001-0001', '1116-0024-0040', '1102-0002-0016'] as const) {
    it(`${sku} reproduces every CAD-measured hole opening`, () => {
      const grid = parseHoleGrid(bySku(sku));
      expect(grid).not.toBeNull();
      const nodes = placeHoleGrid(grid!, meters(truth[sku].boundsMm), 'rev')!;
      expect(new Set(nodes.map(n => key(n.position)))).toEqual(truthKeys(sku));
      for (const n of nodes) { expect(n.review).toBe('suggested'); expect(n.method).toBe('name_grid'); expect(n.diameterM).toBeCloseTo(.004); }
    });
  }
  it('7x7 plate yields all 98 openings, past the analyzer 64-node cap, and every analyzer hole is among them', () => {
    const nodes = placeHoleGrid(parseHoleGrid(bySku('1116-0056-0056'))!, meters(truth['1116-0056-0056'].boundsMm), 'rev')!;
    expect(nodes).toHaveLength(98);
    const ours = new Set(nodes.map(n => key(n.position)));
    for (const k of truthKeys('1116-0056-0056')) expect(ours.has(k)).toBe(true);
  });
  it('refuses parts it cannot lay out and grids that do not fit the bounds', () => {
    for (const sku of ['1105-0006-0152', '1123-0043-0096', '1101-0001-0008', '1120-0001-0048', '5203-2402-0001']) expect(parseHoleGrid(bySku(sku))).toBeNull();
    const grid = parseHoleGrid(bySku('1116-0056-0056'))!;
    expect(placeHoleGrid(grid, meters(truth['1126-0001-0001'].boundsMm), 'rev')).toBeNull();
  });
});

describe('image estimates', () => {
  const bounds = meters(truth['1126-0001-0001'].boundsMm);
  const holes = [-24, -16, -8, 0, 8, 16, 24].map(u => ({ uMm: u, vMm: 0, diameterMm: 4 }));
  it('snaps a slightly-off estimate onto the grid and matches CAD', () => {
    const noisy = holes.map(h => ({ ...h, uMm: h.uMm + (h.uMm % 16 === 0 ? 0.6 : -0.7), vMm: 0.4 }));
    const nodes = estimateToConnectors({ imageKind: 'photo', holes: noisy, confidence: 'low' }, bounds, 'rev');
    expect(new Set(nodes.map(n => key(n.position)))).toEqual(truthKeys('1126-0001-0001'));
    expect(nodes.every(n => n.review === 'suggested' && n.method === 'image_photo')).toBe(true);
  });
  it('keeps raw values when the estimate is not near the grid', () => {
    expect(snapToGrid([0, 3.1, 9.4], 0.5).snapped).toBe(false);
    expect(snapToGrid([0.2, 7.8, 16.3], 0.5)).toEqual({ values: [0, 8, 16], snapped: true });
    expect(snapToGrid([-3.7, 4.2], 0.5)).toEqual({ values: [-4, 4], snapped: true });
  });
  it('drops holes outside the part and rejects malformed model output', () => {
    expect(estimateToConnectors({ imageKind: 'drawing', holes: [{ uMm: 90, vMm: 0, diameterMm: 4 }], confidence: 'high' }, bounds, 'rev')).toHaveLength(0);
    expect(() => estimateToConnectors({ imageKind: 'drawing', holes: [{ uMm: 'x' }], confidence: 'high' }, bounds, 'rev')).toThrow();
  });
});
