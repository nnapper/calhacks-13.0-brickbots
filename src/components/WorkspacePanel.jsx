import {GROUP_LABELS, GROUP_ORDER, detailName, money, shortName} from '../lib/catalog.js';
import {buildCheck, buildTotals} from '../lib/build.js';
import {ChevronIcon} from './Icons.jsx';
import BuildHealth from './BuildHealth';

// Identical parts collapse into one line with a count; uploads are grouped by name.
function groupRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.product?.sku ?? `model:${row.name}`;
    const g = map.get(key) ?? {key, sku: row.product?.sku, product: row.product, name: row.product?.name ?? row.name, price: row.price, dimensions: row.dimensions, ids: []};
    g.ids.push(row.id);
    map.set(key, g);
  }
  return [...map.values()];
}

export default function WorkspacePanel({health, checking, lookupError, metrics, selectedId, onSelect, onRemove, onAdjust, onWhereToBuy, collapsed, onToggle}) {
  if (collapsed) return <button className="paneltab right" onClick={onToggle}><ChevronIcon/> Your build · {metrics.count} parts</button>;
  const groups = groupRows(metrics.rows);
  const byCategory = {};
  for (const g of groups) (byCategory[g.product?.group ?? 'custom'] ??= []).push(g);
  const totals = buildTotals(metrics.build);
  const check = buildCheck(totals);

  return <aside className="panel right" aria-label="Your build">
    <div className="ph"><div className="lbl">Your build<span className="lblr"><span className="mono">{metrics.count} parts</span><button className="collapse" onClick={onToggle} aria-label="Hide your build"><ChevronIcon dir="right"/></button></span></div></div>
    <div className="scroll"><div className="groups">
      {groups.length ? GROUP_ORDER.filter(c => byCategory[c]).map(c => <div key={c}>
        <div className="gl">{GROUP_LABELS[c]}</div>
        {byCategory[c].map(g => {
          const hasSelected = g.ids.includes(selectedId);
          const count = g.ids.length;
          const detail = g.product ? detailName(g.product.name) : '';
          return <div key={g.key} className={`row${hasSelected ? ' sel' : ''}`} onClick={() => onSelect(g.ids[(g.ids.indexOf(selectedId) + 1) % count])}>
            {g.product?.img ? <img src={g.product.img} alt=""/> : <span className="noimg"/>}
            <div className="rn" title={g.name}>{shortName(g.name)}</div>
            <div className="lp">{g.price === null ? '—' : money(g.price * count)}</div>
            <div className="rd">{count > 1 && g.price !== null ? `${money(g.price)} each` : detail || `${g.dimensions.map(n => n.toFixed(1)).join(' × ')} mm`}</div>
            <div className="step" onClick={e => e.stopPropagation()}>
              <button type="button" aria-label={`Remove one ${g.name}`} onClick={() => onRemove(hasSelected ? selectedId : g.ids[count - 1])}>−</button>
              <span>{count}</span>
              <button type="button" aria-label={`Add one ${g.name}`} disabled={!g.sku} title={g.sku ? undefined : 'Uploaded models can be duplicated with Copy and Paste'} onClick={() => onAdjust(g.sku, 1)}>+</button>
            </div>
          </div>;
        })}
      </div>) : <div className="empty">No models yet. Add a catalog part or import your own design to see its metrics here.</div>}
    </div>
      {health && <BuildHealth health={health} checking={checking} lookupError={lookupError} selectedId={selectedId} onSelect={onSelect}/>}
    </div>
    <div className="foot">
      <div className="stats">
        <div>Weight<b>{(totals.weightG / 1000).toFixed(2)} kg</b></div>
        <div>Motors<b>{totals.motors}</b></div>
        <div>Parts<b>{metrics.count}</b></div>
      </div>
      {check && <div className={`note ${check.level}`}>
        <span>{check.text}</span>
        {check.fix?.sku && <button type="button" onClick={() => onAdjust(check.fix.sku, check.fix.delta)}>{check.fix.label}</button>}
      </div>}
      <p className="workspace-note">{metrics.connections} connection{metrics.connections === 1 ? '' : 's'} · {metrics.triangles.toLocaleString()} triangles · weight and mechanical readiness are not verified.</p>
      <div className="total"><span>{metrics.unpricedCount ? 'Known-price subtotal' : 'Catalog subtotal'}</span><b>{metrics.pricedCount ? money(metrics.total) : '—'}</b></div>
      {metrics.unpricedCount > 0 && <p className="workspace-note">{metrics.unpricedCount} model{metrics.unpricedCount === 1 ? '' : 's'} without pricing. Tax and shipping excluded.</p>}
      <button className="cta" disabled={!Object.keys(metrics.build).length} onClick={onWhereToBuy}>Where to buy →</button>
    </div>
  </aside>;
}
