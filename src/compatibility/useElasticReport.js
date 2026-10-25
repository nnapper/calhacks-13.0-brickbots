import { useEffect, useRef, useState } from 'react';
import { BY_SKU, RAW_BY_SKU } from '../lib/catalog.js';
import { evaluateBuildWithElastic } from './elastic.js';

// Moving a part must not call the agent again, so the key leaves out positions and keeps parts, scale and connections.
function buildKey(parts, mates) {
  const partInfo = parts.map((p) => [p.id, p?.model?.asset?.productId, p.scale, p?.model?.geometryRevision,
    (p?.model?.connectors ?? []).map((n) => [n.id, n.kind, n.diameterM])]);
  const mateInfo = mates.map((m) => [m.movingId, m.targetId, m.movingNodeId, m.targetNodeId]);
  return JSON.stringify([partInfo, mateInfo]);
}

/**
 * Asks the Elastic agent about the connected pairs the rule-based checks did not settle as a match. Returns the agent's
 * report (or null) and whether it is still working. It never throws: if Elastic is down or has no keys, the report simply
 * has no assessed pairs and the rule-based answers stand.
 */
export function useElasticReport(parts, mates, ruleHealth) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const wanted = (ruleHealth?.pairs ?? []).filter((pair) => pair.status !== 'compatible').map((pair) => pair.id).sort();
  const key = `${buildKey(parts, mates)}|${wanted.join(',')}`;
  const latest = useRef({ parts, mates });
  latest.current = { parts, mates };

  useEffect(() => {
    if (!wanted.length) { setReport(null); setLoading(false); return undefined; }
    const controller = new AbortController();
    // Wait a moment so adding several parts in a row makes one request, not many.
    const timer = setTimeout(() => {
      setLoading(true);
      const { parts: p, mates: m } = latest.current;
      evaluateBuildWithElastic(p, m, BY_SKU, RAW_BY_SKU, {
        signal: controller.signal,
        onlyIds: new Set(wanted),
        onProgress: (next) => { if (!controller.signal.aborted) setReport(next); },
      })
        .then((next) => { if (!controller.signal.aborted) setReport(next); })
        .catch(() => { if (!controller.signal.aborted) setReport(null); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 700);
    return () => { clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { report, loading };
}
