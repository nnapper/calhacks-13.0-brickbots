import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { findAlignment, type PartInstance } from '../assembly/snapping';
import { partsInRect } from '../assembly/selection';
import { placeholderSize } from '../cad/placeholder';

// A part whose local bounds are a box of the given size (metres) with its origin at the bottom centre.
const part = (id: string, size: [number, number, number], position: [number, number, number]): PartInstance => ({
  id, position,
  model: { asset: { bounds: { min: [-size[0] / 2, 0, -size[2] / 2], max: [size[0] / 2, size[1], size[2] / 2] } } } as never,
});

describe('findAlignment', () => {
  const base = part('base', [.1, .01, .1], [0, 0, 0]);

  it('centres a part over another when it is close to centre', () => {
    const moving = part('m', [.02, .02, .02], [0, .01, 0]);
    const result = findAlignment(moving, [.004, .01, -.003], [base, moving])!;
    expect(result.position[0]).toBeCloseTo(0, 6);
    expect(result.position[2]).toBeCloseTo(0, 6);
    expect(result.guides.every(g => g.label === 'center')).toBe(true);
  });

  it('rests the part on top once centred and almost touching', () => {
    const moving = part('m', [.02, .02, .02], [0, .0125, 0]);
    const result = findAlignment(moving, [.002, .0125, .002], [base, moving])!;
    expect(result.position[1]).toBeCloseTo(.01, 6);
  });

  it('lines up an edge when the centre is out of range', () => {
    const moving = part('m', [.02, .02, .02], [0, .01, 0]);
    // moving's left edge (x=0.0395-0.01... ) is 2 mm from the base's left edge at x=-0.05
    const result = findAlignment(moving, [-.038, .01, .2], [base, moving])!;
    expect(result.position[0]).toBeCloseTo(-.04, 6);
    expect(result.guides[0].label).toBe('edge');
  });

  it('returns null when nothing is near', () => {
    expect(findAlignment(part('m', [.02, .02, .02], [0, 0, 0]), [.3, 0, .3], [base])).toBeNull();
  });
});

describe('partsInRect', () => {
  const a = part('a', [.02, .02, .02], [-.1, 0, 0]);
  const b = part('b', [.02, .02, .02], [.1, 0, 0]);
  // Top-down projection: x, z map straight to screen pixels at 1000 px per metre.
  const project = (p: THREE.Vector3) => ({ x: p.x * 1000, y: p.z * 1000 });

  it('selects only parts inside the rectangle', () => {
    expect(partsInRect([a, b], project, { left: -150, top: -50, right: -50, bottom: 50 })).toEqual(['a']);
  });
  it('selects every part the rectangle touches', () => {
    expect(partsInRect([a, b], project, { left: -150, top: -50, right: 150, bottom: 50 })).toEqual(['a', 'b']);
  });
  it('selects nothing for an empty area', () => {
    expect(partsInRect([a, b], project, { left: -20, top: 100, right: 20, bottom: 200 })).toEqual([]);
  });
});

describe('placeholderSize', () => {
  it('shapes cables as a bendy lead', () => {
    expect(placeholderSize({ name: 'JST SH Servo Cable 300mm', sku: 'c', dims: { length: 300 } })).toMatchObject({ shape: 'cable', kind: 'cable', x: 300 });
  });
  it('uses the real diameter for a wheel', () => {
    expect(placeholderSize({ name: 'Omni Wheel', sku: 'w', dims: { diameter: 48, width: 19 } })).toMatchObject({ shape: 'disc', x: 48, z: 19 });
  });
  it('uses length, height and width for a block', () => {
    expect(placeholderSize({ name: 'Beam', sku: 'b', dims: { length: 96, width: 8, height: 8 } })).toMatchObject({ shape: 'box', x: 96, y: 8, z: 8 });
  });
  it('does not turn a gearmotor into a gear', () => {
    const size = placeholderSize({ name: 'Micro Metal Gearmotor 6V', sku: 'g' });
    expect(size.kind).toBe('motor');
    expect(size.shape).toBe('box');
  });
  it('falls back to a typical size for unknown parts', () => {
    expect(placeholderSize({ name: 'Mystery bracket', sku: 'x' })).toMatchObject({ shape: 'box', x: 24, y: 24, z: 24 });
  });
});
