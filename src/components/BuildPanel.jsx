import { useEffect, useRef } from "react";
import { BY_SKU, GROUP_LABELS, GROUP_ORDER, detailName, money, shortName } from "../lib/catalog.js";
import { ChevronIcon } from "./Icons.jsx";

export default function BuildPanel({ build, totals, check, selected, onSelect, onHover, onAdd, onWhereToBuy, collapsed, onToggle }) {
  const listRef = useRef(null);
  useEffect(() => {
    if (selected) listRef.current?.querySelector(`[data-sku="${selected}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  if (collapsed) {
    return (
      <button className="paneltab right" type="button" onClick={onToggle} aria-label="Show your build">
        <ChevronIcon /> Your build <b className="mono">{money(totals.total)}</b>
      </button>
    );
  }

  const byGroup = {};
  for (const [sku, qty] of Object.entries(build)) (byGroup[BY_SKU[sku].group] ??= []).push([sku, qty]);

  return (
    <aside className="panel right" aria-label="Your build">
      <div className="ph">
        <div className="lbl">
          Your build
          <span className="lblr">
            <span className="mono">{totals.count ? `${totals.count} parts` : ""}</span>
            <button className="collapse" type="button" onClick={onToggle} aria-label="Hide your build"><ChevronIcon dir="right" /></button>
          </span>
        </div>
      </div>
      <div className="scroll" ref={listRef} onMouseLeave={() => onHover(null)}>
        <div className="groups">
          {totals.count ? (
            GROUP_ORDER.filter((g) => byGroup[g]).map((g) => (
              <div key={g}>
                <div className="gl">{GROUP_LABELS[g]}</div>
                {byGroup[g].map(([sku, qty]) => {
                  const p = BY_SKU[sku];
                  return (
                    <div
                      key={sku}
                      data-sku={sku}
                      className={`row${sku === selected ? " sel" : ""}`}
                      onClick={() => onSelect(sku)}
                      onMouseEnter={() => onHover(sku)}
                    >
                      {p.img ? <img src={p.img} alt="" /> : <span className="noimg" />}
                      <div className="rn" title={p.name}>{shortName(p.name)}</div>
                      <div className="lp">{money(p.price * qty)}</div>
                      <div className="rd">{detailName(p.name) || `${money(p.price)} each`}</div>
                      <div className="step" onClick={(e) => e.stopPropagation()}>
                        <button type="button" aria-label="Remove one" onClick={() => onAdd(sku, -1)}>−</button>
                        <span>{qty}</span>
                        <button type="button" aria-label="Add one" onClick={() => onAdd(sku, 1)}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="empty">Nothing here yet. Describe a robot above, or drag a part onto the grid.</div>
          )}
        </div>
      </div>
      <div className="foot">
        <div className="stats">
          <div>Weight<b>{(totals.weightG / 1000).toFixed(2)} kg</b></div>
          <div>Motors<b>{totals.motors}</b></div>
          <div>Parts<b>{totals.count}</b></div>
        </div>
        {check && (
          <div className={`note ${check.level}`}>
            <span>{check.text}</span>
            {check.fix?.sku && (
              <button type="button" onClick={() => onAdd(check.fix.sku, check.fix.delta)}>{check.fix.label}</button>
            )}
          </div>
        )}
        <div className="total">
          <span>Est. total</span>
          <b>{money(totals.total)}</b>
        </div>
        <button className="cta" type="button" onClick={onWhereToBuy} disabled={!totals.count}>
          Where to buy →
        </button>
      </div>
    </aside>
  );
}
