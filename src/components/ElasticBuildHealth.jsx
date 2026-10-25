import { useEffect, useMemo, useState } from 'react';
import raw from '../../data/parts.json';
import { BY_SKU } from '../lib/catalog.js';
import { evaluateBuildWithElastic, pendingReport } from '../compatibility/elastic.js';
import './ElasticBuildHealth.css';

const RAW_BY_SKU = Object.fromEntries(Object.values(raw)
  .filter((record) => record?.sku).map((record) => [record.sku, record]));

function buildKey(parts, mates) {
  // Drag movements alone should not trigger the LLM. Only part/connector/mate changes do.
  const partInfo = parts.map((p) => [p.id, p?.model?.asset?.productId, p.scale,
    p?.model?.geometryRevision,
    (p?.model?.connectors ?? []).map((n) => [n.id, n.kind, n.diameterM])]);
  const mateInfo = mates.map((m) => [m.movingId, m.targetId, m.movingNodeId, m.targetNodeId]);
  return JSON.stringify([partInfo, mateInfo]);
}

function Option({ option }) {
  return <li className="elastic-option">
    <span className="elastic-option-name">
      {option.url
        ? <a href={option.url} target="_blank" rel="noopener noreferrer">{option.name}</a>
        : option.name}
    </span>
    <span className="elastic-option-meta">
      {option.priceUsd == null ? 'Price unknown' : `$${option.priceUsd.toFixed(2)}`}
      {' · '}{option.stockKnown ? (option.inStock ? 'In stock' : 'Out of stock') : 'Availability unknown'}
    </span>
    <small>{option.why}</small>
    {option.evidence && <small>Evidence: {option.evidence}</small>}
  </li>;
}

function ReplacementGroup({ name, items }) {
  return <section className="elastic-replacement-group">
    <strong>Potential replacements for {name}</strong>
    {items.length
      ? <ol>{items.map((item) => <Option key={item.sku} option={item} />)}</ol>
      : <p>No evidence-backed alternative was found in the indexed catalog.</p>}
  </section>;
}

/** Attach next to CadWorkspace inside CatalogApp's .stagewrap. */
export default function ElasticBuildHealth({ parts = [], mates = [], catalogBySku = BY_SKU,
  rawBySku = RAW_BY_SKU }) {
  const key = buildKey(parts, mates);
  const pending = useMemo(() => pendingReport(parts, mates, catalogBySku, rawBySku),
    // key includes relevant part and mate geometry, but not their 3D position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, catalogBySku, rawBySku]);
  const [remote, setRemote] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setRemote(null);
    if (!pending.checked) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    evaluateBuildWithElastic(parts, mates, catalogBySku, rawBySku,
      { signal: controller.signal, onProgress: (report) => {
        if (!controller.signal.aborted) setRemote(report);
      } })
      .then((report) => { if (!controller.signal.aborted) setRemote(report); })
      .catch((error) => {
        if (!controller.signal.aborted) setRemote({ ...pending,
          elastic: { status: 'unavailable', warning: error.message, agentUsed: false } });
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, catalogBySku, rawBySku]);

  const report = remote ?? pending;
  return <aside className="elastic-buildhealth" aria-live="polite" aria-label="Connected part build health">
    <header>
      <strong>Build Health · Elastic AI</strong>
      {loading && <span>Checking {report.elastic?.completed ?? 0}/{pending.checked} connections...</span>}
    </header>
    <p className="elastic-summary">
      <span className="compatible">{report.totals.compatible} compatible</span>
      <span className="incompatible">{report.totals.incompatible} incompatible</span>
      <span>{report.totals.unknown} unknown</span>
    </p>
    {report.elastic?.status === 'unavailable' &&
      <p className="elastic-warning">Elastic unavailable: {report.elastic.warning || 'Agent assessment unavailable'}. No local rule-based verdict was substituted.</p>}
    {!report.checked && <p>Connect two parts to run an AI assessment.</p>}
    {report.pairs.map((pair) => <section className={`elastic-failure elastic-${pair.status}`} key={pair.id}>
      <strong>{pair.aName} ↔ {pair.bName}: {pair.status}</strong>
      <p>{pair.explanation}</p>
      {!!pair.evidence?.length && <small>Sources: {pair.evidence.map((e) => `${e.source}: ${e.fact}`).join(' | ')}</small>}
      {pair.status === 'unknown' && !!pair.missingEvidence?.length &&
        <small>Still needed: {pair.missingEvidence.join('; ')}</small>}
      {pair.status !== 'compatible' && !!pair.bestNextStep &&
        <p className="elastic-recommendation"><strong>Suggested next step:</strong> {pair.bestNextStep}</p>}
      {pair.status !== 'compatible' && pair.alternatives && <>
        <section className="elastic-replacement-group">
          <strong>Potential adapter / hub / fastener (keep both parts)</strong>
          {pair.alternatives.adapterOptions?.length
            ? <ol>{pair.alternatives.adapterOptions.map((item) => <Option key={item.sku} option={item} />)}</ol>
            : <p>No evidence-backed adapter found in the indexed catalog.</p>}
        </section>
        <ReplacementGroup name={pair.aName} items={pair.alternatives.replaceA ?? []} />
        <ReplacementGroup name={pair.bName} items={pair.alternatives.replaceB ?? []} />
        <small>{pair.alternatives.note}</small>
        {pair.solutionSearchPerformed === false &&
          <small>Elasticsearch candidate pre-search did not complete.</small>}
        <small>Decision and ranking: {pair.alternatives.rankedBy}</small>
      </>}
      {typeof pair.latencyMs === 'number' &&
        <small>{pair.cacheHit ? 'Elastic investigation: cached' :
          `Elastic investigation: ${(pair.latencyMs / 1000).toFixed(1)}s`}</small>}
      {!!pair.agentToolCalls?.length && <small>Agent tools: {pair.agentToolCalls.join(', ')}</small>}
    </section>)}
  </aside>;
}
