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

const ROVER = {
  id: "rover",
  name: "4WD rover",
  blurb: "Four motors, four omni wheels on a round baseplate",
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

// The presets below were placed from each generated model's measured geometry (see src/tests/preset.test.ts, which loads the
// real STEP files and checks that no unconnected parts overlap and that each wheel sits on its motor's shaft).
// rotX (optional) tilts a part about the x axis before rotY turns it. A motor with rotY = -90 has its shaft pointing to -x, and +90 points it to +x. A motor's shaft axis sits at a fixed height
// in the model, so the motor's origin is raised until that axis lines up with the wheel axis.

// MicroDuck: a two-legged duck. Each leg is an Axon MAX servo standing on a foot plate, its H25T output spline pointing up
// into a servo hub; a round baseplate is the body, with a neck, a flat head plate, a bill, a tail and a motor controller.
// The servo's shaft is 12 mm off its centre, so the left servo is turned 180 degrees to bring both hubs under the body.
const LEG_SERVO = "2004-0025-0002"; // body y 0..37, flange at y 31..35, shaft x = -12, y 37..42
const HIP_HUB = "1921-0025-0032"; // H25T spline hub, 32 mm, 10 mm tall, axis along y

const MICRODUCK = {
  id: "microduck",
  name: "MicroDuck",
  blurb: "A two-legged duck on servo hips, with a round head, eyes and a bill",
  parts: [
    { key: "foot-l", sku: "1123-0043-0096", position: [-50, 0, 0], rotY: 0 },
    { key: "foot-r", sku: "1123-0043-0096", position: [50, 0, 0], rotY: 0 },
    { key: "leg-l", sku: LEG_SERVO, position: [-50, 4, 0], rotY: 180 },
    { key: "leg-r", sku: LEG_SERVO, position: [50, 4, 0], rotY: 0 },
    { key: "hip-l", sku: HIP_HUB, position: [-38, 41, 0], rotY: 0 },
    { key: "hip-r", sku: HIP_HUB, position: [38, 41, 0], rotY: 0 },
    { key: "body", sku: "1140-0006-0144", position: [0, 51, 0], rotY: 0 },
    { key: "neck", sku: "1203-0001-0001", position: [0, 57, 20], rotY: 0 },
    // The head is a 96 mm wheel standing on its edge, facing forward: a round face with a wide flat bill and two roller eyes.
    { key: "head", sku: "3601-0014-0096", position: [0, 87, 20], rotY: 0 },
    { key: "eye-l", sku: "3618-4008-0016", position: [-24, 150, 20], rotY: 0, rotX: 90 },
    { key: "eye-r", sku: "3618-4008-0016", position: [24, 150, 20], rotY: 0, rotX: 90 },
    { key: "bill", sku: "1105-0002-0056", position: [0, 100, 52], rotY: 0 },
    { key: "brain", sku: "3105-0101-0005", position: [0, 57, -40], rotY: 0 },
    { key: "tail", sku: "1101-0001-0008", position: [0, 57, -60], rotY: 0 },
  ],
  mates: [
    { moving: "hip-l", target: "leg-l", axis: 1, side: 1 },
    { moving: "hip-r", target: "leg-r", axis: 1, side: 1 },
  ],
  // Parts that sit inside another part's bounding box without touching it (the eyes sit in the head's dish).
  nested: [["eye-l", "head"], ["eye-r", "head"]],
};

// Balancer: two Saturn gearmotors (8 mm REX shaft) drive 48 mm omni wheels; a pattern plate and grid plate form the
// chassis and the motor controller stands on top.
const BAL_MOTOR = "5303-2402-0051"; // 138 mm long, shaft z 45.5..69, axis 18 mm above its base
const BAL_WHEEL = "3624-4008-0048"; // 48 mm omni wheel, 8 mm REX bore, 18.7 mm wide

const BALANCER = {
  id: "balancer",
  name: "2-wheel balancer",
  blurb: "Two geared motors and omni wheels under a plated deck",
  parts: [
    { key: "motor-l", sku: BAL_MOTOR, position: [-75, 6, 0], rotY: -90 },
    { key: "motor-r", sku: BAL_MOTOR, position: [75, 6, 0], rotY: 90 },
    { key: "wheel-l", sku: BAL_WHEEL, position: [-132.25, 0, 0], rotY: -90 },
    { key: "wheel-r", sku: BAL_WHEEL, position: [132.25, 0, 0], rotY: 90 },
    { key: "chassis", sku: "1123-0043-0096", position: [0, 42, 0], rotY: 90 },
    { key: "deck", sku: "1116-0056-0056", position: [0, 46, 0], rotY: 0 },
    { key: "brain", sku: "3105-0101-0005", position: [0, 48.5, 0], rotY: 0 },
  ],
  mates: [
    { moving: "wheel-l", target: "motor-l", axis: 0, side: -1 },
    { moving: "wheel-r", target: "motor-r", axis: 0, side: 1 },
  ],
};

export const PRESETS = [ROVER, MICRODUCK, BALANCER];
export const PRESET = ROVER;
