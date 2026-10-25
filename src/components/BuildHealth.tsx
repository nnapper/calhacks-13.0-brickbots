import { useEffect, useMemo, useRef, useState } from 'react';

// Matches the objects returned by src/compatibility/checks.js (evaluateBuild).
// Keeping these types here avoids importing the nonexistent buildHealth.ts.
export type PairStatus = 'compatible' | 'incompatible' | 'unknown';

export interface BuildHealthPair {
  id: string;
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  status: PairStatus;
  explanation: string;
  aUrl?: string | null;
  bUrl?: string | null;
  connected?: boolean;
  check?: string;
}

export interface BuildHealthReport {
  pairs: BuildHealthPair[];
  totals: {
    compatible: number;
    incompatible: number;
    unknown: number;
  };
  checked: number;
  parts: number;
}

export interface BuildHealthProps {
  health: BuildHealthReport;
  checking?: boolean;
  lookupError?: boolean;
  selectedId?: string | null;
  onSelect?: (partId: string) => void;
}

const STATUS_ORDER: Record<PairStatus, number> = {
  incompatible: 0,
  compatible: 1,
  unknown: 2,
};

const STATUS_LABEL: Record<PairStatus, string> = {
  incompatible: 'Conflict',
  compatible: 'Matched',
  unknown: 'Unverified',
};

export default function BuildHealth({
  health,
  checking = false,
  lookupError = false,
  selectedId = null,
  onSelect,
}: BuildHealthProps) {
  const [expanded, setExpanded] = useState(true);
  const previousConflicts = useRef(0);

  useEffect(() => {
    if (health.totals.incompatible > previousConflicts.current) {
      setExpanded(true);
    }
    previousConflicts.current = health.totals.incompatible;
  }, [health.totals.incompatible]);

  const pairs = useMemo(
    () => [...health.pairs].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
    [health.pairs],
  );

  const failed = pairs.filter((pair: BuildHealthPair) => pair.status === 'incompatible');

  return (
    <aside className="compat-health build-health" aria-label="Build health checks">
      <button
        type="button"
        className="compat-health-header"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="compat-health-title">Build health</span>
        <span className="compat-health-header-end">
          <span className="compat-health-count">{health.checked} connected pairs</span>
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </span>
      </button>

      <div className="compat-health-totals" aria-live="polite">
        <span className="compat-number is-good">{health.totals.compatible} matched</span>
        <span className="compat-number is-bad">{failed.length} conflicts</span>
        <span className="compat-number is-unknown">{health.totals.unknown} unverified</span>
      </div>

      {expanded && (
        <div className="compat-health-body">
          {pairs.length === 0 ? (
            <p className="compat-empty">
              Connect two parts in the 3D workspace. Only directly connected pairs are checked.
            </p>
          ) : (
            <ul className="compat-pair-list">
              {pairs.map((pair: BuildHealthPair) => (
                <li
                  key={pair.id}
                  className={`compat-pair build-health-item is-${pair.status}`}
                >
                  <div className="compat-pair-head">
                    <span className="compat-status">{STATUS_LABEL[pair.status]}</span>
                    {onSelect ? (
                      <button
                        type="button"
                        className="compat-pair-target"
                        title="Select one of these parts in the 3D workspace"
                        onClick={() => onSelect(pair.aId === selectedId ? pair.bId : pair.aId)}
                      >
                        {pair.aName} / {pair.bName}
                      </button>
                    ) : (
                      <strong>{pair.aName} / {pair.bName}</strong>
                    )}
                  </div>
                  <p>{pair.explanation}</p>
                  {(pair.aUrl || pair.bUrl) && (
                    <div className="compat-sources">
                      {pair.aUrl && (
                        <a href={pair.aUrl} target="_blank" rel="noopener noreferrer">
                          Part A specifications
                        </a>
                      )}
                      {pair.bUrl && (
                        <a href={pair.bUrl} target="_blank" rel="noopener noreferrer">
                          Part B specifications
                        </a>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {checking && (
            <p className="compat-meta" role="status">
              Checking missing specifications with Context.dev…
            </p>
          )}
          {lookupError && (
            <p className="compat-meta">
              Online lookup unavailable. Cached catalog checks still work.
            </p>
          )}
          <p className="compat-disclaimer">
            Advisory only. A visual snap does not verify strength or manufacturing tolerances.
          </p>
        </div>
      )}
    </aside>
  );
}
