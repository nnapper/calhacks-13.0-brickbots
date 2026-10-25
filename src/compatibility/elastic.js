/**
 * Agent-first compatibility: the UI sends ONLY recorded direct connections.
 * No local part-type lookup table or shaft/voltage verdict is used.
 * Elasticsearch provides facts; Elastic Agent Builder makes the advisory verdict.
 */
const API = '/api/elastic';

const short = (value, limit = 200) => String(value ?? '').slice(0, limit);
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0
  ? Number(value) : null;

function describe(part, catalog, raw) {
  const sku = part?.model?.asset?.productId ?? null;
  const local = sku ? (raw?.[sku] ?? catalog?.[sku] ?? {}) : {};
  const scale = positive(part?.scale) ?? 1;
  return {
    id: short(part.id, 120),
    sku: sku == null ? null : short(sku, 250),
    name: short(local.name || part?.model?.asset?.name || 'Imported part'),
    category: short(local.category || local.group),
    // The app knows the attachment geometry; the agent cannot infer this from product text.
    connectors: (part?.model?.connectors ?? []).slice(0, 64).map((node) => ({
      id: short(node?.id, 100),
      kind: short(node?.kind, 80),
      diameter_mm: positive(node?.diameterM) == null
        ? null : Number((Number(node.diameterM) * 1000 * scale).toFixed(4)),
    })),
  };
}

/** One checked pair per unique directly mated pair; proximity never creates a check. */
export function connectedPairs(parts = [], mates = [], catalog = {}, raw = {}) {
  const partsById = new Map(parts.filter((p) => p?.id != null)
    .map((part) => [String(part.id), part]));
  const pairs = new Map();
  for (const mate of mates) {
    const moving = String(mate?.movingId ?? '');
    const target = String(mate?.targetId ?? '');
    if (!moving || !target || moving === target) continue;
    if (!partsById.has(moving) || !partsById.has(target)) continue;
    const [aId, bId] = [moving, target].sort();
    const id = `${aId}|${bId}`;
    if (!pairs.has(id)) pairs.set(id, {
      id,
      a: describe(partsById.get(aId), catalog, raw),
      b: describe(partsById.get(bId), catalog, raw),
      mates: [],
    });
    pairs.get(id).mates.push({
      movingId: moving,
      targetId: target,
      movingNodeId: short(mate.movingNodeId, 100),
      targetNodeId: short(mate.targetNodeId, 100),
    });
  }
  // A replacement must also account for other parts attached to that endpoint.
  for (const pair of pairs.values()) {
    for (const [side, endpointId, oppositeId] of [
      ['neighborsA', pair.a.id, pair.b.id], ['neighborsB', pair.b.id, pair.a.id],
    ]) {
      const neighbors = new Map();
      for (const mate of mates) {
        const m = String(mate?.movingId ?? '');
        const t = String(mate?.targetId ?? '');
        const other = m === endpointId ? t : t === endpointId ? m : null;
        if (!other || other === oppositeId || !partsById.has(other)) continue;
        if (!neighbors.has(other)) neighbors.set(other,
          describe(partsById.get(other), catalog, raw));
      }
      pair[side] = [...neighbors.values()].slice(0, 8);
    }
  }
  return [...pairs.values()];
}

const counts = (pairs) => ({
  compatible: pairs.filter((p) => p.status === 'compatible').length,
  incompatible: pairs.filter((p) => p.status === 'incompatible').length,
  unknown: pairs.filter((p) => p.status === 'unknown').length,
});

function unknown(pair, explanation) {
  return {
    id: pair.id,
    aId: pair.a.id, bId: pair.b.id,
    aSku: pair.a.sku, bSku: pair.b.sku,
    aName: pair.a.name, bName: pair.b.name,
    connected: true,
    status: 'unknown', check: 'elastic-agent',
    explanation,
    evidence: [],
    alternatives: null,
  };
}

export function pendingReport(parts = [], mates = [], catalog = {}, raw = {}) {
  const pairs = connectedPairs(parts, mates, catalog, raw)
    .map((pair) => unknown(pair, 'Waiting for Elastic Agent Builder to evaluate this connection.'));
  return { pairs, totals: counts(pairs), checked: pairs.length, parts: parts.length,
    elastic: { status: 'pending', indexedParts: 0, agentUsed: false } };
}

/**
 * Evaluates each directly connected pair independently (2 requests max in flight).
 * onProgress(report) allows Build Health to show finished results while remaining
 * connections are still being assessed. Never classifies from local tables.
 */
export async function evaluateBuildWithElastic(
  parts = [], mates = [], catalogBySku = {}, rawBySku = {}, options = {},
) {
  const base = connectedPairs(parts, mates, catalogBySku, rawBySku);
  if (!base.length) return { ...pendingReport(parts, mates, catalogBySku, rawBySku),
    elastic: { status: 'idle', indexedParts: 0, agentUsed: false } };

  const values = base.map((pair) => unknown(pair,
    'Waiting for Elastic Agent Builder to evaluate this connection.'));
  let completed = 0, agentUsed = false, indexedParts = 0, cursor = 0;
  const warnings = [];
  const snapshot = () => ({
    pairs: [...values], totals: counts(values), checked: values.length, parts: parts.length,
    elastic: {
      status: completed < base.length ? 'pending' : agentUsed ? 'connected' : 'unavailable',
      completed, total: base.length, agentUsed, indexedParts,
      warning: warnings.length ? warnings[0] : null,
    },
  });
  const worker = async () => {
    while (cursor < base.length) {
      if (options.signal?.aborted) return;
      const index = cursor++;
      const pair = base[index];
      try {
        const response = await (options.fetchImpl ?? fetch)(`${API}/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairs: [pair] }),
          signal: options.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Elastic HTTP ${response.status}`);
        const found = Array.isArray(data.pairs)
          ? data.pairs.find((candidate) => candidate?.id === pair.id) : null;
        values[index] = found ? { ...unknown(pair, ''), ...found,
          id: pair.id, aId: pair.a.id, bId: pair.b.id,
          aName: pair.a.name, bName: pair.b.name }
          : unknown(pair, 'Elastic did not return a result for this connection.');
        agentUsed ||= Boolean(values[index].agentUsed);
        indexedParts = Math.max(indexedParts, data.elastic?.indexedParts ?? 0);
        if (data.elastic?.warning) warnings.push(data.elastic.warning);
      } catch (error) {
        if (options.signal?.aborted) return;
        values[index] = unknown(pair, `Elastic assessment unavailable: ${String(error.message).slice(0, 160)}`);
        warnings.push(error.message);
      }
      completed++;
      if (!options.signal?.aborted) options.onProgress?.(snapshot());
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, base.length) }, worker));
  if (options.signal?.aborted) throw options.signal.reason ?? new Error('Aborted');
  return snapshot();
}
