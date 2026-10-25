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

function preview(text, limit = 160) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  const beforeLimit = normalized.slice(0, limit + 1);
  const lastSpace = beforeLimit.lastIndexOf(' ');
  return `${normalized.slice(0, lastSpace > 80 ? lastSpace : limit).trimEnd()}…`;
}

function countOptions(alternatives) {
  return ['adapterOptions', 'replaceA', 'replaceB']
    .reduce((total, key) => total + (Array.isArray(alternatives?.[key])
      ? alternatives[key].length : 0), 0);
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

function PairAssessment({ pair }) {
  const options = countOptions(pair.alternatives);
  const showNextStep = pair.status !== 'compatible' && Boolean(pair.bestNextStep);
  const teaser = pair.failure?.message || (showNextStep ? pair.bestNextStep : pair.explanation);
  const teaserLabel = pair.failure ? 'Elastic did not assess this pair'
    : showNextStep ? 'Suggested next step' : 'Assessment';
  const detailsLabel = options > 0
    ? `${options} possible ${options === 1 ? 'solution' : 'solutions'} and full analysis`
    : 'full Elastic analysis';

  return <section className={`elastic-failure elastic-${pair.status}`}>
    <div className="elastic-pair-heading">
      <strong>{pair.aName} ↔ {pair.bName}</strong>
      <span className={`elastic-pair-status elastic-status-${pair.failure ? 'unavailable' : pair.assessmentState === 'pending' ? 'pending' : pair.status}`}>
        {pair.failure ? 'Not assessed' : pair.assessmentState === 'pending' ? 'Checking' : pair.status}
      </span>
    </div>
    <p className="elastic-pair-preview">
      <strong>{teaserLabel}:</strong> {preview(teaser) || 'Elastic has not provided an assessment yet.'}
    </p>

    {/* Native disclosure defaults to closed; no new React state or API requests. */}
    <details className="elastic-pair-details">
      <summary>
        <span className="elastic-show-details">Show {detailsLabel}</span>
        <span className="elastic-hide-details">Hide {detailsLabel}</span>
      </summary>
      <div className="elastic-pair-expanded">
        <p><strong>{pair.failure ? 'Reason not assessed' : 'Full assessment'}:</strong> {pair.explanation}</p>
        {pair.failure && <p className="elastic-error-detail">
          <strong>Failure:</strong> {pair.failure.code} at {pair.failure.stage}.
          {pair.failure.httpStatus ? ` HTTP ${pair.failure.httpStatus}.` : ''}
          {pair.failure.timeoutMs ? ` Deadline ${Math.round(pair.failure.timeoutMs / 1000)}s.` : ''}
          <span> This is an availability problem, not proof of a parts mismatch.</span>
        </p>}
        {!!pair.attempts?.length && <small>Attempts: {pair.attempts.map((a) =>
          `${a.stage}: ${a.result} (${(a.elapsedMs / 1000).toFixed(1)}s; limit ${(a.limitMs / 1000).toFixed(0)}s)`).join(' | ')}</small>}
        {pair.responseNote && <small>{pair.responseNote}</small>}
        {pair.searchFailure && <small>Candidate search issue: {pair.searchFailure.message}</small>}
        {!!pair.evidence?.length &&
          <small>{pair.failure ? 'Known indexed facts (not a verdict): ' : 'Sources: '} {pair.evidence.map((e) => `${e.source}: ${e.fact}`).join(' | ')}</small>}
        {pair.status === 'unknown' && !!pair.missingEvidence?.length &&
          <small>Still needed: {pair.missingEvidence.join('; ')}</small>}
        {showNextStep &&
          <p className="elastic-recommendation"><strong>Suggested next step:</strong> {pair.bestNextStep}</p>}
        {pair.status !== 'compatible' && pair.alternatives && <>
          <section className="elastic-replacement-group">
            <strong>Potential adapter / hub / fastener (keep both parts)</strong>
            {pair.alternatives.adapterOptions?.length
              ? <ol>{pair.alternatives.adapterOptions.map((item) =>
                <Option key={item.sku} option={item} />)}</ol>
              : <p>No evidence-backed adapter found in the indexed catalog.</p>}
          </section>
          <ReplacementGroup name={pair.aName} items={pair.alternatives.replaceA ?? []} />
          <ReplacementGroup name={pair.bName} items={pair.alternatives.replaceB ?? []} />
          {pair.alternatives.note && <small>{pair.alternatives.note}</small>}
          {pair.solutionSearchPerformed === false &&
            <small>Elasticsearch candidate pre-search did not complete.</small>}
          {pair.alternatives.rankedBy &&
            <small>Decision and ranking: {pair.alternatives.rankedBy}</small>}
        </>}
        {typeof pair.latencyMs === 'number' &&
          <small>{pair.cacheHit ? 'Elastic investigation: cached' :
            `Elastic investigation: ${(pair.latencyMs / 1000).toFixed(1)}s`}</small>}
        {!!pair.agentToolCalls?.length &&
          <small>Agent tools: {pair.agentToolCalls.join(', ')}</small>}
      </div>
    </details>
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
  const [retryCount, setRetryCount] = useState(0);

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
        if (!controller.signal.aborted) {
          const message = `Build Health could not run the Elastic request: ${error.message}`;
          setRemote({ ...pending,
            pairs: pending.pairs.map((pair) => ({ ...pair,
              assessmentState: 'unavailable', explanation: message,
              failure: { code: 'ui-error', stage: 'browser', message },
            })),
            elastic: { status: 'unavailable', warning: message, agentUsed: false,
              failed: pending.checked },
          });
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, catalogBySku, rawBySku, retryCount]);

  const report = remote ?? pending;
  const failures = report.pairs.filter((p) => Boolean(p.failure)).length;
  const genuineUnknown = Math.max(0, report.totals.unknown - failures);
  return <aside className="elastic-buildhealth" aria-live="polite" aria-label="Connected part build health">
    <header>
      <strong>Build Health · Elastic AI</strong>
      {loading && <span>Checking {report.elastic?.completed ?? 0}/{pending.checked} connections...</span>}
      {!loading && failures > 0 && <button type="button" className="elastic-retry"
        onClick={() => setRetryCount((n) => n + 1)}>Retry unassessed</button>}
    </header>
    <p className="elastic-summary">
      <span className="compatible">{report.totals.compatible} compatible</span>
      <span className="incompatible">{report.totals.incompatible} incompatible</span>
      <span>{genuineUnknown} unknown</span>
      {failures > 0 && <span className="elastic-unavailable-count">{failures} not assessed</span>}
    </p>
    {['unavailable', 'partial'].includes(report.elastic?.status) &&
      <p className="elastic-warning">Elastic could not assess some connections: {report.elastic.warning || 'See the pair-specific diagnostic below.'} No local compatibility verdict was substituted.</p>}
    {!report.checked && <p>Connect two parts to run an AI assessment.</p>}
    {report.pairs.map((pair) => <PairAssessment key={pair.id} pair={pair} />)}
  </aside>;
}
