// Example build shown to first-time visitors: a 4-wheel-drive rover that is known to fit together.
//
// Every motor's 8 mm REX shaft goes into an 8 mm REX bore Omni wheel (the compatibility check reports
// each pair as Matched). Positions are millimetres from the world origin to the part's bottom-centre;
// rotY turns a part about the vertical axis so each motor's shaft points out at its wheel. Parts are
// placed here, not auto-snapped: the generated motor and wheel models have no matching attachment nodes.
const BASE = "1140-0006-0144"; // 144 mm aluminum baseplate
const MOTOR = "5204-8002-0019"; // Yellow Jacket planetary gear motor, 8 mm REX shaft
const WHEEL = "3624-4008-0048"; // 48 mm Omni wheel, 8 mm REX bore

// The wheel's centre is 24 mm up (its radius) so it rests on the floor; the motors hang under the baseplate.
const corners = [
  { id: "fl", side: -1, z: -30 },
  { id: "bl", side: -1, z: 30 },
  { id: "fr", side: 1, z: -30 },
  { id: "br", side: 1, z: 30 },
];

export const PRESET = {
  name: "4WD rover",
  parts: [
    { key: "base", sku: BASE, position: [0, 42.5, 0], rotY: 0 },
    ...corners.flatMap(({ id, side, z }) => [
      { key: `motor-${id}`, sku: MOTOR, position: [side * 40, 5.5, z], rotY: side < 0 ? 90 : -90 },
      { key: `wheel-${id}`, sku: WHEEL, position: [side * 81.5, 0, z], rotY: 90 },
    ]),
  ],
  // Wheel on motor shaft, one connection per corner.
  mates: corners.map(({ id, side }) => ({ moving: `wheel-${id}`, target: `motor-${id}`, axis: 0, side })),
};
