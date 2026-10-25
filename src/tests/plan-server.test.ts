import { describe, expect, it } from 'vitest';
import * as planModule from '../../server/plan.js';
const { planWithClaude, sanitizeSpec, arrangeWithClaude } = planModule as any;

const catalog = [{ sku: 'a-1', name: 'Motor' }, { sku: 'b-2', name: 'Servo' }];
const reply = (obj: unknown) => async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] }) }) as Response;

describe('sanitizeSpec', () => {
  it('drops unknown SKUs and clamps a drive layout', () => {
    const spec = sanitizeSpec({ kind: 'drive', drive: { wheels: 9, motor: 'strong', wheel: 'huge', arm: 1 }, extras: [{ sku: 'a-1', qty: 2 }, { sku: 'nope', qty: 1 }] }, catalog);
    expect(spec.drive).toEqual({ wheels: 6, motor: 'strong', wheel: 'small', arm: true });
    expect(spec.extras).toEqual([expect.objectContaining({ sku: 'a-1', qty: 2 })]);
  });
  it('keeps a new vehicle a drive build even when the workspace already has parts', () => {
    const spec = sanitizeSpec({ kind: 'drive', drive: { wheels: 4 } }, catalog, 5);
    expect(spec.kind).toBe('drive');
  });
  it('refuses a plan with nothing buildable', () => {
    expect(() => sanitizeSpec({ kind: 'parts', subsystems: [{ parts: [{ sku: 'nope', qty: 1 }] }] }, catalog)).toThrow(/no catalog parts/);
  });
});

describe('planWithClaude', () => {
  it('returns a validated spec and needs a key', async () => {
    const out = await planWithClaude({ goal: 'a duck', catalog, apiKey: 'k', fetchImpl: reply({ summary: 's', kind: 'duck' }) });
    expect(out.spec.kind).toBe('duck');
    await expect(planWithClaude({ goal: 'x', catalog, apiKey: '' })).rejects.toThrow(/planner key is not set/);
  });
  it('reports an API failure', async () => {
    await expect(planWithClaude({ goal: 'x', catalog, apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'slow down' }) as Response })).rejects.toThrow(/HTTP 429/);
  });
});

describe('arrangeWithClaude', () => {
  it('returns a placement per part with numbers coerced', async () => {
    const out = await arrangeWithClaude({ goal: 'g', parts: [{ id: 'p1', name: 'Plate', sizeMm: { x: 10, y: 2, z: 10 } }], apiKey: 'k',
      fetchImpl: reply({ summary: 'ok', parts: [{ partId: 'p1', positionMm: { x: '5', y: 1, z: 0 } }] }) });
    expect(out.parts).toEqual([{ partId: 'p1', positionMm: { x: 5, y: 1, z: 0 }, rotationDegrees: { x: 0, y: 0, z: 0 } }]);
  });
});
