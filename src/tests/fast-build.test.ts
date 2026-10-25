import {describe, expect, it} from 'vitest';
import {localCatalogPlan, shelfArrangement} from '../assembly/fast-build';

const catalog = [
  {sku: '1105-0002-0016', name: '1105 Series Round End Pattern Plate (16 Hole)', category: 'pattern-plates', price: 8},
  {sku: '5203-2402-0001', name: '5203 Series Yellow Jacket Motor', category: 'motors', price: 20},
];

describe('local exact plans', () => {
  it('matches a numbered catalog series without calling an LLM', () => {
    const result = localCatalogPlan('make two 1105 series round-end pattern plates', catalog);
    expect(result?.match.sku).toBe('1105-0002-0016');
    expect(result?.plan.subsystems[0].parts).toEqual([{sku: '1105-0002-0016', qty: 2, reason: expect.any(String)}]);
  });

  it('does not guess when there is no strong catalog match', () => {
    expect(localCatalogPlan('two useful components', catalog)).toBeNull();
  });
});

describe('deterministic fallback layout', () => {
  it('places every part once above the floor', () => {
    const parts = [
      {id: 'a', name: 'A', sizeMm: {x: 100, y: 6, z: 60}},
      {id: 'b', name: 'B', sizeMm: {x: 100, y: 6, z: 60}},
    ];
    const result = shelfArrangement(parts);
    expect(result.parts.map(item => item.partId)).toEqual(['a', 'b']);
    expect(result.parts[1].positionMm.x).toBe(158);
    expect(result.parts[0].positionMm.y).toBe(3);
  });
});
