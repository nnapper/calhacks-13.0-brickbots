// Builds a design from a plain-English description using only parts that already have a priced catalog entry and a
// pre-built model. Nothing here calls an AI service: it reads the description for a body type, a wheel count, a size, a
// budget and an arm, then lays the parts out from each model's measured geometry (the tables below come from the
// generator scripts in public/generated/<sku>/model.py). The result has the same shape as a preset, so the workspace
// loads it the same way. Positions are millimetres to the part's origin; rotY is degrees about the vertical axis.
import { BY_SKU } from "./catalog.js";
import { PRESETS } from "./preset.js";

// Motors with an 8 mm REX output shaft along local +z. axisY: shaft height above the motor's base. start: z of the
// rear end. shaft: z range of the output shaft. radius: body radius.
const MOTORS = {
  small: { sku: "5203-2402-0001", axisY: 18.5, radius: 18.5, start: -50, shaft: [26, 50] },
  strong: { sku: "5303-2402-0051", axisY: 18, radius: 18, start: -69, shaft: [45.5, 69] },
};
// Wheels with an 8 mm REX bore along local z. axisY: bore height above the wheel's base; half: half the width.
const WHEELS = {
  small: { sku: "3624-4008-0032", axisY: 16, half: 7 },
  large: { sku: "3624-4008-0048", axisY: 24, half: 9.35 },
  foot: { sku: "3615-4008-0048", axisY: 24, half: 8 },
};
const BRAIN = "3105-0101-0005"; // motor controller, stands 15.5 mm tall, 40 x 6.6 mm footprint
const PLATE_SMALL = "1123-0043-0096"; // 43 x 96 mm, 4 mm thick: rotated 90 degrees it spans x +-48, z +-21.5
const PLATE_ROUND = "1140-0006-0144"; // 144 mm round, 6 mm thick
const ARM_SERVO = "2000-0025-0003"; // shaft along z at x = 7, y = 10.1, z 11.75..18.25
const ARM = "1900-0025-0104"; // 25-tooth servo arm, hub on the z axis at y = 5, 7.6 mm wide, reaches 41 mm up

const COUNTS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const price = (sku) => BY_SKU[sku]?.price ?? 0;
const cost = (parts) => parts.reduce((sum, p) => sum + price(p.sku), 0);

// What the description asks for, with the words that decided it so the answer can say so.
export function readDescription(text) {
  const t = String(text ?? "").toLowerCase();
  const budget = t.match(/(?:under|below|less than|within|max(?:imum)?|budget(?: of)?|up to)\s*\$?\s*(\d+(?:\.\d+)?)/)?.[1] ?? t.match(/\$\s*(\d+(?:\.\d+)?)/)?.[1];
  const count = t.match(/\b(\d+|one|two|three|four|five|six)\s*[- ]?(?:wheel|wd\b|motor)/);
  const kg = t.match(/(\d+(?:\.\d+)?)\s*kg/);
  return {
    body: /\b(duck|biped|bird|walker|walking|legged|legs?|creature|animal|humanoid)\b/.test(t) ? "duck" : "drive",
    wheels: count ? Number(count[1]) || COUNTS[count[1]] : /\b(tank|truck|six)\b/.test(t) ? 6 : /\b(balanc|segway|two[- ]wheel|2wd|bike|scooter)\b/.test(t) ? 2 : 4,
    arm: /\b(arm|claw|grab|grip|gripper|lift|pick|hand)\b/.test(t),
    small: /\b(small|mini|micro|tiny|compact|light)\b/.test(t),
    strong: /\b(carry|haul|heavy|strong|powerful|big|large|payload|tow)\b/.test(t) || (kg && Number(kg[1]) > 1),
    budget: budget ? Number(budget) : null,
    mecanum: /mecanum|strafe|holonomic/.test(t),
  };
}

// A drivetrain: `wheels` wheels in pairs along the body, one motor per wheel, a plate on top of the motors and a controller.
function drive({ wheels, motor, wheel, arm }) {
  const rows = Math.max(1, Math.round(wheels / 2));
  const m = MOTORS[motor], w = WHEELS[wheel];
  // The motor goes up until its shaft is level with the wheel's bore; if the wheel's is higher, the wheel goes up instead.
  const motorY = Math.max(0, w.axisY - m.axisY), wheelY = Math.max(0, m.axisY - w.axisY);
  // The motor's rear end stops 2 mm short of the middle so left and right motors never touch.
  const x = -m.start + 2;
  const wheelX = x + (m.shaft[0] + m.shaft[1]) / 2;
  // Neighbouring rows must clear both the motor bodies and the wheel discs.
  const pitch = Math.max(2 * m.radius, 2 * w.axisY + 1) + 2;
  const top = motorY + 2 * m.axisY;
  const parts = [], mates = [];
  for (let row = 0; row < rows; row++) {
    const z = (row - (rows - 1) / 2) * pitch;
    for (const [side, tag] of [[-1, "l"], [1, "r"]]) {
      const rotY = side * 90;
      parts.push({ key: `motor-${tag}${row}`, sku: m.sku, position: [side * x, motorY, z], rotY });
      parts.push({ key: `wheel-${tag}${row}`, sku: w.sku, position: [side * wheelX, wheelY, z], rotY });
      mates.push({ moving: `wheel-${tag}${row}`, target: `motor-${tag}${row}`, axis: 0, side });
    }
  }
  const round = rows > 1 || arm;
  parts.push({ key: "chassis", sku: round ? PLATE_ROUND : PLATE_SMALL, position: [0, top, 0], rotY: round ? 0 : 90 });
  const deck = top + (round ? 6 : 4);
  parts.push({ key: "brain", sku: BRAIN, position: [0, deck, arm ? -30 : 0], rotY: 0 });
  if (arm) {
    const z = 36;
    parts.push({ key: "arm-servo", sku: ARM_SERVO, position: [0, deck, z], rotY: 0 });
    parts.push({ key: "arm", sku: ARM, position: [7, deck + 10.1 - 5, z + 15.5], rotY: 0 });
    mates.push({ moving: "arm", target: "arm-servo", axis: 2, side: 1 });
  }
  return { parts, mates };
}

// Answers a description with a design and a plain account of what it did and what it could not do.
export function compose(text) {
  const want = readDescription(text);
  const notes = [];
  if (want.body === "duck") {
    const duck = PRESETS.find((p) => p.id === "microduck");
    notes.push("Built the two-legged MicroDuck, the only walking body with parts that are known to fit.");
    if (want.arm) notes.push("It has no arm; the drive builds can add a servo arm.");
    return { id: "composed", name: "MicroDuck", parts: duck.parts, mates: duck.mates, notes, cost: cost(duck.parts), want };
  }

  const wheels = Math.min(6, Math.max(2, want.wheels % 2 ? want.wheels + 1 : want.wheels));
  if (wheels !== want.wheels) notes.push(`Used ${wheels} wheels: wheels come in left and right pairs, up to 6.`);
  if (want.mecanum) notes.push("No mecanum wheel model is in the catalog yet, so omni wheels stand in. They roll sideways but cannot strafe on their own.");
  if (want.arm) notes.push("Added one servo arm on its servo. There is no claw or gripper jaw model, so it cannot grab yet.");

  // Preferred setup first, then cheaper ones; the first that fits the budget wins.
  const first = want.strong ? ["strong", "large"] : want.small ? ["small", "small"] : ["small", "large"];
  const options = [first, ["small", "large"], ["small", "small"]].filter((o, i, all) => all.findIndex((x) => x[0] === o[0] && x[1] === o[1]) === i);
  const built = options.map(([motor, wheel]) => ({ chosen: [motor, wheel], design: drive({ wheels, motor, wheel, arm: want.arm }) }));
  const fits = want.budget === null ? built[0] : built.find((o) => cost(o.design.parts) <= want.budget);
  const { chosen, design } = fits ?? built.reduce((a, b) => (cost(b.design.parts) < cost(a.design.parts) ? b : a));
  const total = cost(design.parts);
  if (want.budget !== null && total > want.budget) {
    notes.push(`The cheapest ${wheels}-wheel layout still costs about $${total.toFixed(0)}, over the $${want.budget} budget. Ask for fewer wheels to bring it down.`);
  }
  const motorName = MOTORS[chosen[0]].sku.startsWith("5303") ? "Saturn" : "Yellow Jacket";
  const label = `${wheels}-wheel ${want.arm ? "arm rover" : "rover"}`;
  notes.unshift(`${label}: ${wheels} ${motorName} motors, ${wheels} ${chosen[1] === "small" ? "32 mm" : "48 mm"} wheels, about $${total.toFixed(0)}.`);
  return { id: "composed", name: label, parts: design.parts, mates: design.mates, notes, cost: total, want };
}
