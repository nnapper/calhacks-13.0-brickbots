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
