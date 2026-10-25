import {describe, expect, it} from 'vitest';
import {localCatalogPlan, fallbackPlan, shelfArrangement} from '../assembly/fast-build';

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

describe('deadline-safe fallback plans', () => {
  const kit = [
    {sku: '1140-0006-0144', name: '1140 Series Aluminum Baseplate', category: 'baseplates'},
    {sku: '5203-2402-0071', name: '5203 Series Yellow Jacket Planetary Gear Motor', category: 'motors'},
    {sku: '3601-0032-0096', name: '3601 Series Rhino Wheel', category: 'wheels'},
    {sku: '1203-0001-0001', name: '1203 Series Block Mount', category: 'block-mounts'},
    {sku: '2004-0025-0002', name: 'Axon MAX Servo MK2', category: 'servos'},
    {sku: '1102-0002-0016', name: '1102 Series Flat Beam', category: 'structure'},
    {sku: '3628-0014-0060', name: 'Steel Flywheel', category: 'flywheels'},
  ];

  it('creates a starter drivetrain when there is no usable plan', () => {
    const plan = fallbackPlan('make something useful', kit);
    const count = plan.subsystems.reduce((n: number, s: any) => n + s.parts.reduce((t: number, p: any) => t + p.qty, 0), 0);
    expect(count).toBeGreaterThan(0);
    expect(plan.subsystems.flatMap((s: any) => s.parts).some((p: any) => p.sku === '1140-0006-0144')).toBe(true);
  });

  it('uses the closest catalog item for a strong direct request', () => {
    const plan = fallbackPlan('make a Steel Flywheel', kit);
    expect(plan.subsystems[0].parts).toEqual([{sku: '3628-0014-0060', qty: 1, reason: expect.any(String)}]);
  });
});
