/**
 * Advisory robotics compatibility checks using Context.dev-scraped catalog facts
 * and the assembly's measured attachment nodes. No AI-generated fit claims.
 *
 * Only directly connected pairs receive a build-health result.
 * A missing spec never means "compatible".
 * All dimensional values below are nominal and require real-world verification.
 */
const mm = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const round = (n) => Number(n.toFixed(2));
const words = (s) => String(s ?? '').replace(/[\u00ae\u2122]/g, '').replace(/\s+/g, ' ').trim();

function rows(record) {
  return (record?.specs ?? []).flatMap((item) => {
    if (Array.isArray(item)) return [{ key: words(item[0]), value: words(item.slice(1).join(' ')) }];
    if (typeof item !== 'string') return [];
    const split = item.match(/^(.+?)\s*(?:\s\|\s|:\s)\s*(.+)$/);
    return [{ key: split ? words(split[1]) : '', value: words(split ? split[2] : item) }];
  });
}

function recordFor(part, catalog, raw, online) {
  const sku = part?.model?.asset?.productId ?? null;
  const fallback = sku ? catalog?.[sku] : null;
  const local = sku ? raw?.[sku] : null;
  const remote = sku ? online?.[sku] : null;
  const record = { ...fallback, ...local, ...remote };
  return {
    id: part.id,
    sku,
    name: words(record.name ?? part?.model?.asset?.name ?? 'Imported part'),
    category: words(record.category ?? fallback?.group ?? ''),
    group: words(fallback?.group ?? ''),
    url: /^https:\/\//i.test(record.url ?? '') ? record.url : null,
    dims: record.dimensions_mm ?? {},
    specs: rows(record).length ? rows(record) : rows(fallback),
    connectors: part?.model?.connectors ?? [],
    scale: part.scale ?? 1,
    geometryRevision: part?.model?.geometryRevision ?? null,
  };
}

function kind(p) {
  const t = `${p.category} ${p.group} ${p.name}`.toLowerCase();
  if (/motor[ -]?(driver|controller)|h[ -]?bridge|motor[ -]?speed[ -]?controller/.test(t)) return 'motor-driver';
  if (/battery|power[ -]?supply/.test(t)) return 'battery';
  if (/servo/.test(t)) return 'servo';
  if (/\bmotor\b|gearbox/.test(t)) return 'motor';
  if (/\bgear\b|worm[ -]?wheel/.test(t) && !/gearbox/.test(t)) return 'gear';
  if (/wheel|roller|hub|pulley|sprocket/.test(t)) return 'rotary';
  return 'other';
}

function specValue(part, keyPattern) {
  return part.specs.find((row) => keyPattern.test(row.key.toLowerCase()))?.value ?? null;
}

function dimension(part, which) {
  const existing = mm(part.dims?.[which === 'shaft' ? 'shaft_diameter' : 'bore_diameter']);
  if (existing) return existing;
  const lines = [part.name, ...part.specs.map(({ key, value }) => `${key} ${value}`)];
  for (const text of lines) {
    const norm = words(text).toLowerCase();
    if (!new RegExp(which).test(norm)) continue;
    // Only accept numbers associated with the named shaft/bore, not wheel diameter or motor length.
    const match = norm.match(new RegExp('(\\d+(?:\\.\\d+)?)\\s*mm\\s*(?:rex|hex|round|smooth|d-shaped|d-shaft)?\\s*' + which + '\\b'))
      ?? norm.match(new RegExp('\\b' + which + '\\b[^0-9]{0,20}(\\d+(?:\\.\\d+)?)\\s*mm'));
    if (match) return mm(match[1]);
  }
  return null;
}

function profile(part, which) {
  const phrases = [
    ...part.specs.filter(({ key, value }) => new RegExp(which, 'i').test(`${key} ${value}`)).map(({ key, value }) => `${key} ${value}`),
    part.name,
  ];
  for (const phrase of phrases) {
    const t = words(phrase).toLowerCase();
    if (!t.includes(which)) continue;
    if (/\brex\b/.test(t)) return 'REX';
    if (/\bhex(?:agonal)?\b/.test(t)) return 'hex';
    if (/\bd[ -]?(?:shaped|shaft|bore|profile)\b/.test(t)) return 'D';
    if (/\bsplin(?:ed|e)\b/.test(t)) return 'splined';
    if (/\bround\b|\bsmooth\b|\bcircular\b/.test(t)) return 'round';
  }
  return null;
}

function parseVolts(text) {
  if (!text) return null;
  const value = words(text).replace(/[\u2013\u2014]/g, '-');
  // Both "6-18 VDC" and "6 V to 18 V" are common on motor-driver datasheets.
  const range = value.match(/(\d+(?:\.\d+)?)\s*(?:V(?:DC|AC)?)?\s*(?:-|to|through)\s*(\d+(?:\.\d+)?)\s*V(?:DC|AC)?\b/i);
  if (range) return [Math.min(Number(range[1]), Number(range[2])), Math.max(Number(range[1]), Number(range[2]))];
  const values = [...value.matchAll(/(\d+(?:\.\d+)?)\s*V(?:DC|AC)?\b/gi)];
  if (values.length !== 1) return null;
  const voltage = Number(values[0][1]);
  return [voltage, voltage];
}

function motorVoltage(part) {
  const explicit = specValue(part, /^(nominal|rated|motor|operating) voltage(?:\s*range)?$/);
  // Never fall back to "encoder voltage" or the voltage in an unrelated component name.
  if (explicit) return parseVolts(explicit);
  const match = part.name.match(/\b(\d+(?:\.\d+)?)\s*VDC\b/i);
  return match ? [Number(match[1]), Number(match[1])] : null;
}

function driverMotorVoltage(part) {
  // Only explicitly motor-side voltage ratings are usable for motor-to-driver checks.
  const value = specValue(part, /^(motor (?:supply |output )?voltage(?:\s*range)?|motor power voltage(?:\s*range)?)$/);
  return parseVolts(value);
}

function gearModule(part) {
  const spec = specValue(part, /^(?:gear )?(?:pitch|module|mod)$/) ?? part.specs.map((r) => r.value).find((s) => /\bMOD\s*\d/i.test(s));
  const match = String(spec ?? part.name).match(/\b(?:MOD|module)\s*(\d+(?:\.\d+)?)\b/i);
  return match ? Number(match[1]) : null;
}

function gearPressureAngle(part) {
  const spec = specValue(part, /pressure angle/)
    ?? part.specs.map(({ value }) => value).find((s) => /pressure angle/i.test(s));
  const match = String(spec ?? '').match(/\b(\d+(?:\.\d+)?)\b/);
  return match ? Number(match[1]) : null;
}

const verdict = (status, explanation, check) => ({ status, explanation, check });

function shaftBore(shaftPart, borePart) {
  const shaft = dimension(shaftPart, 'shaft');
  const bore = dimension(borePart, 'bore');
  if (!shaft || !bore) return null;
  const shapeA = profile(shaftPart, 'shaft');
  const shapeB = profile(borePart, 'bore');
  const delta = Math.abs(shaft - bore);
  // Differences >0.5 mm or 5% strongly indicate different nominal interfaces.
  // Small differences may represent intentional clearance: don't call them failures.
  const mismatch = Math.max(.5, Math.max(shaft, bore) * .05);
  const nominalMatch = Math.max(.15, Math.min(shaft, bore) * .02);
  if (delta > mismatch) {
    return verdict('incompatible', `Direct drive does not fit: ${shaftPart.name} has a ${round(shaft)} mm shaft, while ${borePart.name} has a ${round(bore)} mm bore. A suitable adapter/hub is required.`, 'shaft-bore');
  }
  if (delta > nominalMatch) {
    return verdict('unknown', `Shaft and bore are ${round(shaft)} mm and ${round(bore)} mm. The difference may be clearance or a mismatch; verify tolerances and the hub before direct drive.`, 'shaft-bore');
  }
  if (shapeA && shapeB && shapeA !== shapeB) {
    return verdict('incompatible', `Direct drive uses different profiles: ${round(shaft)} mm ${shapeA} shaft versus ${round(bore)} mm ${shapeB} bore. A matching hub or adapter is required.`, 'shaft-bore');
  }
  if (!shapeA || !shapeB) {
    return verdict('unknown', `Shaft and bore diameters are both about ${round(shaft)} mm, but their profiles or clearances are not documented. Check the mating hub.`, 'shaft-bore');
  }
  return verdict('compatible', `Nominal direct fit: ${round(shaft)} mm ${shapeA} shaft and ${round(bore)} mm ${shapeB} bore. Clearance and torque capacity still need checking.`, 'shaft-bore');
}

function pairFromSpecs(a, b) {
  const typeA = kind(a), typeB = kind(b);
  if ((typeA === 'motor' || typeA === 'servo') && ['rotary', 'gear'].includes(typeB)) return shaftBore(a, b);
  if ((typeB === 'motor' || typeB === 'servo') && ['rotary', 'gear'].includes(typeA)) return shaftBore(b, a);
  if (typeA === 'motor' && typeB === 'motor-driver' || typeB === 'motor' && typeA === 'motor-driver') {
    const motor = typeA === 'motor' ? a : b;
    const driver = typeA === 'motor-driver' ? a : b;
    const m = motorVoltage(motor), d = driverMotorVoltage(driver);
    if (m && d) {
      if (m[1] < d[0] - .01 || m[0] > d[1] + .01) return verdict('incompatible', `${motor.name} is rated at ${m.join('-')} V; ${driver.name}'s motor supply range is ${d.join('-')} V. The voltage ranges do not overlap.`, 'motor-driver-voltage');
      if (m[0] < d[0] - .01 || m[1] > d[1] + .01) return verdict('unknown', `Motor and driver voltage ranges partially overlap (${m.join('-')} V vs. ${d.join('-')} V). Choose a shared supply voltage; current and wiring are unverified.`, 'motor-driver-voltage');
      return verdict('compatible', `Motor voltage (${m.join('-')} V) is within the driver's motor supply range (${d.join('-')} V). Current capacity and wiring are not verified.`, 'motor-driver-voltage');
    }
  }
  if (typeA === 'gear' && typeB === 'gear') {
    const mA = gearModule(a), mB = gearModule(b);
    if (mA && mB && Math.abs(mA - mB) > .0001) return verdict('incompatible', `These gears have different tooth modules (MOD ${mA} vs. MOD ${mB}); they cannot mesh directly.`, 'gear-module');
    const pA = gearPressureAngle(a), pB = gearPressureAngle(b);
    if (mA && mB && pA && pB && Math.abs(pA - pB) > .01) return verdict('incompatible', `These gears have different pressure angles (${pA} vs. ${pB} degrees). Direct meshing is not suitable.`, 'gear-angle');
    if (mA && mB && pA && pB) return verdict('compatible', `Both gears list MOD ${mA} and a ${pA} degree pressure angle. Tooth geometry and center distance still need verification.`, 'gear-geometry');
  }
  return null;
}

function fromMates(a, b, mates) {
  const direct = mates.filter((m) => (m?.movingId === a.id && m?.targetId === b.id) || (m?.movingId === b.id && m?.targetId === a.id));
  if (!direct.length) return null;
  const selected = direct[direct.length - 1];
  const first = selected.movingId === a.id ? a : b;
  const second = selected.movingId === a.id ? b : a;
  const nA = first.connectors.find((n) => n.id === selected.movingNodeId);
  const nB = second.connectors.find((n) => n.id === selected.targetNodeId);
  if (!nA || !nB) return verdict('unknown', 'Parts are linked in the 3D workspace, but measured attachment nodes are missing. Physical fit is unverified.', 'mate');
  if (nA.kind !== nB.kind) return verdict('incompatible', `Selected attachment nodes have different kinds (${nA.kind} vs. ${nB.kind}). Reconnect using matching nodes.`, 'mate');
  if (nA.kind === 'hole') {
    const aMm = mm(nA.diameterM * 1000 * first.scale);
    const bMm = mm(nB.diameterM * 1000 * second.scale);
    if (!aMm || !bMm) return verdict('unknown', 'Attachment-hole diameters are unavailable; this connection has not been dimensionally validated.', 'mate');
    if (Math.abs(aMm - bMm) > Math.max(.1, .02 * Math.min(aMm, bMm))) {
      return verdict('incompatible', `Attached holes differ in diameter (${round(aMm)} mm vs. ${round(bMm)} mm). Select matching attachment nodes.`, 'mate');
    }
    return verdict('compatible', `Aligned hole nodes have matching nominal diameter (about ${round(aMm)} mm). The required fastener and mechanical strength remain unverified.`, 'mate');
  }
  return verdict('unknown', 'Planar faces align in the viewer; no fastener, load, or mating tolerance has been verified.', 'mate');
}

export function evaluatePair(partA, partB, mates = [], catalogBySku = {}, rawBySku = {}, onlineBySku = {}) {
  const a = recordFor(partA, catalogBySku, rawBySku, onlineBySku);
  const b = recordFor(partB, catalogBySku, rawBySku, onlineBySku);
  const mechanical = fromMates(a, b, mates);
  const published = pairFromSpecs(a, b);
  // An explicit conflict wins. A matched connector cannot clear an electrical mismatch.
  const result = [mechanical, published].find((c) => c?.status === 'incompatible')
    ?? [published, mechanical].find((c) => c?.status === 'compatible')
    ?? published ?? mechanical
    ?? verdict('unknown', 'No reliable direct-fit relationship was found in the available specifications. This does not establish incompatibility.', 'insufficient-data');
  return {
    id: [a.id, b.id].sort().join('|'),
    aId: a.id, bId: b.id,
    aName: a.name, bName: b.name,
    aSku: a.sku, bSku: b.sku,
    aUrl: a.url, bUrl: b.url,
    connected: mates.some((m) => (m?.movingId === a.id && m?.targetId === b.id) || (m?.movingId === b.id && m?.targetId === a.id)),
    ...result,
  };
}

export function evaluateBuild(parts = [], mates = [], catalogBySku = {}, rawBySku = {}, onlineBySku = {}) {
  // A mate is a direct, recorded workspace connection. Mere proximity or a
  // connection via another part does not create a pair to check.
  const partsById = new Map(parts.filter((part) => part?.id != null).map((part) => [part.id, part]));
  const checkedPairs = new Set();
  const pairs = [];

  for (const mate of mates) {
    const a = partsById.get(mate?.movingId);
    const b = partsById.get(mate?.targetId);
    // Ignore stale mates (e.g. after part deletion) and self-connections.
    if (!a || !b || a.id === b.id) continue;

    // Several connector/node mates between the same two instances are one pair.
    const pairId = [String(a.id), String(b.id)].sort().join('|');
    if (checkedPairs.has(pairId)) continue;
    checkedPairs.add(pairId);

    pairs.push(evaluatePair(a, b, mates, catalogBySku, rawBySku, onlineBySku));
  }

  const totals = {
    compatible: pairs.filter((r) => r.status === 'compatible').length,
    incompatible: pairs.filter((r) => r.status === 'incompatible').length,
    unknown: pairs.filter((r) => r.status === 'unknown').length,
  };
  return { pairs, totals, checked: pairs.length, parts: parts.length };
}
