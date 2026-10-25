import {describe, expect, it} from 'vitest';
import {localCatalogPlan, fallbackPlan, primitiveBodyPlan, shelfArrangement} from '../assembly/fast-build';

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

describe('round primitives', () => {
  it('turns a circle into a thin disc and a sphere into a sphere', () => {
    const disc = primitiveBodyPlan('make a circle');
    expect(disc.subsystems[0].customBodies).toEqual([expect.objectContaining({ shape: 'cylinder', lengthMm: 20, heightMm: 4 })]);
    expect(primitiveBodyPlan('a 50 mm sphere').subsystems[0].customBodies[0]).toMatchObject({ shape: 'sphere', lengthMm: 50 });
    expect(primitiveBodyPlan('a 30 mm cylinder 60 mm tall').subsystems[0].customBodies[0]).toMatchObject({ shape: 'cylinder', lengthMm: 30, heightMm: 60 });
  });
  it('leaves robot parts that share a word alone', () => {
    expect(primitiveBodyPlan('a rover with disc wheels')).toBeNull();
    expect(primitiveBodyPlan('ball caster for a robot')).toBeNull();
  });
});

describe('primitive fallback plans', () => {
  it('keeps one cube as exactly one custom body', () => {
    const plan = primitiveBodyPlan('make one cube');
    expect(plan?.subsystems[0].customBodies).toHaveLength(1);
    expect(plan?.subsystems[0].parts).toHaveLength(0);
    expect(plan?.subsystems[0].customBodies[0].lengthMm).toBe(20);
    expect(fallbackPlan('make one cube', [])).toEqual(plan);
  });

  it('keeps three dimensioned cubes as three bodies', () => {
    const plan = primitiveBodyPlan('make three 30 mm cubes');
    expect(plan?.subsystems[0].customBodies).toHaveLength(3);
    expect(plan?.subsystems[0].customBodies[0].widthMm).toBe(30);
  });

  it('keeps a bare box request as one primitive', () => {
    expect(fallbackPlan('box', []).subsystems[0].customBodies).toHaveLength(1);
  });
});
