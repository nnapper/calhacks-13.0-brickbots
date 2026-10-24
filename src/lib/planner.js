import { findPart } from "./catalog.js";

// Placeholder planner: keyword matching stands in for the AI that will turn a prompt into a parts list.
// Keep the return shape ([{ sku, qty }]) when replacing it.
export function planBuild(prompt) {
  const t = prompt.toLowerCase();
  const mecanum = /mecanum|omni|strafe|holonomic/.test(t);
  const arm = /arm|claw|grab|grip|lift|pick/.test(t);

  const items = [
    [/^1123 Series Pattern Plate/, 1],
    [/^1120 Series U-Channel/, 2],
  ];
  if (mecanum) {
    items.push(
      [/^GripForce™ Mecanum Wheel Roller Pack \(40A\)$/, 4],
      [/^5204 Series Yellow Jacket/, 4],
      [/^1x20A Motor Controller/, 4]
    );
  } else {
    items.push(
      [/^3601 Series Rhino Wheel \(14mm Bore, 96mm/, 4],
      [/^5204 Series Yellow Jacket/, 2],
      [/^1x20A Motor Controller/, 2]
    );
  }
  if (arm) {
    items.push([/^Axon MAX Servo MK2/, 1], [/^1900 Series Single Servo Arm/, 2], [/^Servo Commander/, 1]);
  }

  return items
    .map(([re, qty]) => ({ sku: findPart(re)?.sku, qty }))
    .filter((i) => i.sku);
}
