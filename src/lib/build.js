import { BY_SKU, GROUP_ORDER, findPart } from "./catalog.js";
import { kindOf } from "../scene/placeholders.js";

// A build is a plain object { sku: qty }; key order is insertion order (SKUs are never integer-like).
export function buildReducer(state, action) {
  switch (action.type) {
    case "add": {
      const qty = (state[action.sku] ?? 0) + (action.delta ?? 1);
      const next = { ...state };
      if (qty <= 0) delete next[action.sku];
      else next[action.sku] = qty;
      return next;
    }
    case "set":
      return Object.fromEntries(action.items.map((i) => [i.sku, i.qty]));
    case "clear":
      return {};
    default:
      return state;
  }
}

// Bill-of-materials order: by category, then the order parts were added. Item numbers are 1-based positions in this list.
export function bomOrder(build) {
  const entries = Object.entries(build);
  return GROUP_ORDER.flatMap((g) => entries.filter(([sku]) => BY_SKU[sku].group === g));
}

export function buildTotals(build) {
  let total = 0, weightG = 0, count = 0, motors = 0, controllers = 0;
  for (const [sku, qty] of Object.entries(build)) {
    const p = BY_SKU[sku];
    total += p.price * qty;
    weightG += p.weightG * qty;
    count += qty;
    if (kindOf(p) === "motor") motors += qty;
    if (/Motor (Controller|Driver)/.test(p.name)) controllers += qty;
  }
  return { total, weightG, count, motors, controllers };
}

export function buildCheck(totals) {
  if (!totals.count) return null;
  if (!totals.motors) return { level: "warn", text: "Nothing drives this yet. Add a motor to make it move." };
  if (totals.controllers < totals.motors) {
    const missing = totals.motors - totals.controllers;
    return {
      level: "warn",
      text: `${totals.motors} motors but ${totals.controllers} controller${totals.controllers === 1 ? "" : "s"}. Each 1x20A controller runs one motor.`,
      fix: { label: `Add ${missing}`, sku: findPart(/^1x20A Motor Controller/)?.sku, delta: missing },
    };
  }
  return { level: "good", text: "Every motor has a controller. Ready to drive." };
}
