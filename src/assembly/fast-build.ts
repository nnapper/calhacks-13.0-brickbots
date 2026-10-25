import {requestedCount} from './ai-validation';
import type {LayoutPart, Placement} from './ai-validation';

export type FastCatalogItem = {sku: string; name: string; category?: string; price?: number};

const STOP_WORDS = new Set(['build', 'make', 'create', 'model', 'cad', 'part', 'parts', 'series', 'please', 'design', 'using', 'with']);

// Exact-count catalog requests do not need an LLM inventory plan. Matching locally removes the slowest step.
export function localCatalogPlan(goal: string, catalog: FastCatalogItem[]): {plan: any; match: FastCatalogItem} | null {
  const expected = requestedCount(goal);
  if (!expected || expected > 100) return null;
  const lower = goal.toLowerCase();
  const tokens = new Set(lower.split(/[^a-z0-9.]+/).filter(token => token.length > 1 && !STOP_WORDS.has(token)));
  let best: {item: FastCatalogItem; score: number} | null = null;
  for (const item of catalog) {
    const sku = item.sku.toLowerCase();
    const name = item.name.toLowerCase();
    const category = (item.category ?? '').toLowerCase();
    let score = 0;
    if (goal.toLowerCase().includes(item.name.toLowerCase())) score += 80;
    for (const token of tokens) {
      if (sku === token) score += 100;
      else if (/\d/.test(token) && sku.includes(token)) score += 40;
      if (name.includes(token)) score += token.length >= 4 ? 5 : 2;
      if (category.includes(token)) score += token.length >= 4 ? 3 : 1;
    }
    if (!best || score > best.score) best = {item, score};
  }
  if (!best || best.score < 8) return null;
  return {
    match: best.item,
    plan: {
      summary: `Exact request: ${expected} × ${best.item.name}.`,
      assumptions: [],
      subsystems: [{
        name: 'Requested parts',
        purpose: 'The user requested an exact quantity of this catalog part.',
        parts: [{sku: best.item.sku, qty: expected, reason: 'Matched locally from the exact catalog request.'}],
        customBodies: [],
      }],
    },
  };
}

// Compact shelf packing is the guaranteed fallback when the reviewed AI layout misses its deadline.
export function shelfArrangement(parts: LayoutPart[]): {summary: string; parts: Placement[]} {
  const gap = 8;
  const maxWidth = 480;
  let x = 0;
  let z = 0;
  let rowDepth = 0;
  const placements = parts.map(part => {
    const width = Math.max(1, part.sizeMm.x);
    const depth = Math.max(1, part.sizeMm.z);
    const height = Math.max(1, part.sizeMm.y);
    if (x + width > maxWidth && x > 0) {
      x = 0;
      z += rowDepth;
      rowDepth = 0;
    }
    const placement: Placement = {
      partId: part.id,
      positionMm: {x: x + width / 2, y: height / 2, z: z + depth / 2},
    };
    x += width + gap;
    rowDepth = Math.max(rowDepth, depth + gap);
    return placement;
  });
  return {summary: 'Compact floor-contacting shelf arrangement.', parts: placements};
}
