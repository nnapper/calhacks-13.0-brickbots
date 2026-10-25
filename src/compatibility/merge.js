// One Build health report from two sources. The rule-based checks (checks.js) are instant and exact for the interfaces they
// know, so a definite answer from them stands. Elastic's agent answers the pairs the rules cannot settle and adds a next step
// or a replacement to conflicts. A conflict found by either source always shows as a conflict.

const money = (n) => (typeof n === 'number' ? ` ($${n.toFixed(2)})` : '');

// True only when the agent actually produced a verdict (not pending, not unavailable).
export const assessed = (pair) => Boolean(pair)
  && pair.agentUsed !== false && !pair.failure
  && pair.assessmentState !== 'pending' && pair.assessmentState !== 'unavailable';

// The agent's suggested next step and its best replacement or adapter, as plain sentences.
export function advice(pair) {
  const parts = [];
  if (pair.status !== 'compatible' && pair.bestNextStep) parts.push(`Suggested next step: ${pair.bestNextStep}`);
  const alt = pair.alternatives;
  const option = alt?.adapterOptions?.[0] ?? alt?.replaceA?.[0] ?? alt?.replaceB?.[0];
  if (pair.status !== 'compatible' && option?.name) parts.push(`Possible fix: ${option.name}${money(option.priceUsd)}.`);
  return parts.join(' ');
}

const totalsOf = (pairs) => ({
  compatible: pairs.filter((p) => p.status === 'compatible').length,
  incompatible: pairs.filter((p) => p.status === 'incompatible').length,
  unknown: pairs.filter((p) => p.status === 'unknown').length,
});

export function mergeHealth(rule, elastic) {
  if (!rule || !elastic?.pairs?.length) return rule;
  const byId = new Map(elastic.pairs.map((pair) => [pair.id, pair]));
  const pairs = rule.pairs.map((pair) => {
    const agent = byId.get(pair.id);
    if (!assessed(agent)) return pair;
    const extra = advice(agent);
    if (pair.status === 'unknown') {
      return { ...pair, status: agent.status, check: 'elastic-agent', explanation: [agent.explanation, extra].filter(Boolean).join(' ') };
    }
    if (pair.status === 'incompatible') {
      return extra ? { ...pair, explanation: `${pair.explanation} ${extra}` } : pair;
    }
    if (agent.status === 'incompatible') {
      return { ...pair, status: 'incompatible', check: 'elastic-agent', explanation: [agent.explanation, extra].filter(Boolean).join(' ') };
    }
    return pair;
  });
  return { ...rule, pairs, totals: totalsOf(pairs) };
}
