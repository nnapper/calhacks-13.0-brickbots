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

function subsystem(name: string, purpose: string, parts: {sku: string; qty: number; reason: string}[], customBodies: any[] = []) {
  return {name, purpose, parts, customBodies};
}

// A deadline-safe inventory. These SKUs have small prebuilt models, so the browser can load them without
// invoking the slow CAD generator. It is only used after the LLM planner fails or misses its deadline.
export function fallbackPlan(goal: string, catalog: FastCatalogItem[]): any {
  const lower = goal.toLowerCase();
  const tokens = lower.split(/[^a-z0-9.]+/).filter(token => token.length > 1 && !STOP_WORDS.has(token));
  let best: {item: FastCatalogItem; score: number} | null = null;
  for (const item of catalog) {
    const name = item.name.toLowerCase();
    const category = (item.category ?? '').toLowerCase();
    let score = 0;
    if (lower.includes(name)) score += 80;
    for (const token of tokens) {
      if (name.includes(token)) score += token.length >= 4 ? 5 : 2;
      if (category.includes(token)) score += token.length >= 4 ? 3 : 1;
    }
    if (!best || score > best.score) best = {item, score};
  }

  const available = (skus: string[]) => skus.map(sku => catalog.find(item => item.sku === sku)).filter(Boolean) as FastCatalogItem[];
  const baseplate = available(['1140-0006-0144']);
  const motors = available(['5203-2402-0071', '5303-2402-0100']);
  const wheels = available(['3601-0032-0096', '3626-0014-0096', '3607-0014-0048']);
  const mounts = available(['1203-0001-0001', '1201-0024-0001']);
  const beams = available(['1102-0002-0016', '1103-0001-0008', '1122-0001-0048']);
  const servos = available(['2004-0025-0002', '3216-0001-0003']);
  const rotors = available(['3628-0014-0060']);
  const pick = (items: FastCatalogItem[]) => items[0] ?? catalog[0];

  if (best && best.score >= 12) {
    const qty = requestedCount(goal) ?? 1;
    return {
      summary: `Fallback build: ${qty} × ${best.item.name}.`,
      assumptions: [{label: 'Reason', value: 'The AI planner missed its deadline, so the strongest catalog match was used.'}],
      subsystems: [subsystem('Requested concept', 'Built from the closest available catalog match.', [{sku: best.item.sku, qty, reason: 'Strong local catalog match after planner timeout.'}])],
    };
  }

  if (/\b(drone|quadcopter|quad|aircraft|flyer|flying)\b/.test(lower)) {
    const motor = pick(motors);
    const rotor = pick(rotors);
    return {
      summary: 'Fallback flyer prototype: a base plate with four motors and rotor discs.',
      assumptions: [{label: 'Reason', value: 'The AI planner missed its deadline, so this conservative flyer layout was used.'}],
      subsystems: [
        subsystem('Flyer frame', 'Provides the mounting surface for the propulsion layout.', [{sku: pick(baseplate).sku, qty: 1, reason: 'Base plate for the flyer layout.'}]),
        subsystem('Propulsion', 'Four evenly distributed drive motors with rotor discs.', [{sku: motor.sku, qty: 4, reason: 'Compact drive motor.'}, {sku: rotor.sku, qty: 4, reason: 'Disc-shaped rotor stand-in.'}]),
      ],
    };
  }

  if (/\b(arm|grip|gripper|claw|manipulator|pick)\b/.test(lower)) {
    return {
      summary: 'Fallback arm prototype: a base plate, servo joint, linkage beams, and mounts.',
      assumptions: [{label: 'Reason', value: 'The AI planner missed its deadline, so this conservative arm layout was used.'}],
      subsystems: [
        subsystem('Arm base', 'Stable plate for the joint and linkage layout.', [{sku: pick(baseplate).sku, qty: 1, reason: 'Arm mounting surface.'}]),
        subsystem('Joint and linkage', 'Servo-driven joint with simple structural links.', [{sku: pick(servos).sku, qty: 1, reason: 'Actuates the arm joint.'}, {sku: pick(beams).sku, qty: 2, reason: 'Primary linkage beam.'}, {sku: pick(mounts).sku, qty: 2, reason: 'Joint and linkage mounts.'}]),
      ],
    };
  }

  return {
    summary: 'Fallback starter drivetrain: a base plate with motors, wheels, and mounts.',
    assumptions: [{label: 'Reason', value: 'The AI planner missed its deadline, so this conservative starter layout was used.'}],
    subsystems: [
      subsystem('Chassis', 'Flat base for the starter drivetrain.', [{sku: pick(baseplate).sku, qty: 1, reason: 'Main chassis surface.'}]),
      subsystem('Drive', 'Two motors with four wheels and mounting blocks.', [{sku: pick(motors).sku, qty: 2, reason: 'Left and right drive motors.'}, {sku: pick(wheels).sku, qty: 4, reason: 'Four-point wheel layout.'}, {sku: pick(mounts).sku, qty: 2, reason: 'Structural mounting blocks.'}]),
    ],
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
