import { useMemo, useRef, useState } from "react";
import { GROUPS, PARTS, money, searchParts, shortName } from "../lib/catalog.js";
import { useLive } from "../hooks/useLive.js";
import { UNITS, addCadFile } from "../lib/custom.js";
import { formatSize } from "../lib/units.js";
import { ChevronIcon, SearchIcon } from "./Icons.jsx";

const LIVE_LIMIT = 12; // live lookups cost money, so only the top results get checked

export default function PartsPanel({ onAdd, onLive, onRemoveCustom, version, unit, collapsed, onToggle }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const results = useMemo(() => searchParts(query, group), [query, group, version]);
  const [live, refreshLive] = useLive(onLive);
  const [units, setUnits] = useState("mm");
  const [cadMsg, setCadMsg] = useState("");
  const fileRef = useRef(null);

  const onFiles = async (e) => {
    const files = [...e.target.files];
    e.target.value = ""; // allow picking the same file again
    const notes = [];
    for (const f of files) {
      try {
        const p = await addCadFile(f, units);
        notes.push(`Added “${p.name}” ${p.specs.slice(0, 3).map(([, v]) => v.replace(" mm", "")).join(" × ")} mm`);
      } catch (err) {
        notes.push(err.message);
      }
    }
    setCadMsg(notes.join(" · "));
    onLive?.();
  };

  if (collapsed) {
    return (
      <button className="paneltab left" type="button" onClick={onToggle} aria-label="Show parts">
        Parts <ChevronIcon dir="right" />
      </button>
    );
  }

  return (
    <aside className="panel left" aria-label="Parts catalog">
      <div className="ph">
        <div className="lbl">
          Parts
          <span className="lblr">
            <span className="mono">{results.length} of {PARTS.length}</span>
            <button className="collapse" type="button" onClick={onToggle} aria-label="Hide parts"><ChevronIcon /></button>
          </span>
        </div>
        <label className="search">
          <SearchIcon />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search motors, 96mm, REX…" autoComplete="off" />
        </label>
        <div className="livebar">
          <button
            className="livebtn"
            type="button"
            disabled={live.busy || !results.some((p) => !p.custom)}
            onClick={() => refreshLive(results.filter((p) => !p.custom).slice(0, LIVE_LIMIT).map((p) => p.sku))}
          >
            {live.busy ? "Checking…" : `Check live prices${results.length > LIVE_LIMIT ? ` (top ${LIVE_LIMIT})` : ""}`}
          </button>
          {live.text && <span role="status">{live.text}</span>}
        </div>
        <div className="livebar">
          <input ref={fileRef} type="file" accept=".stl" multiple hidden onChange={onFiles} />
          <button className="livebtn" type="button" onClick={() => fileRef.current?.click()}>Upload CAD (.stl)</button>
          <select className="unitsel" value={units} onChange={(e) => setUnits(e.target.value)} aria-label="Units used in the STL file">
            {UNITS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          {cadMsg && <span role="status">{cadMsg}</span>}
        </div>
        <div className="chips">
          {GROUPS.map(([key, label]) => (
            <button key={key} className="chip" type="button" aria-pressed={group === key} onClick={() => setGroup(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll">
        <div className="cards">
          {results.length ? (
            results.map((p) => (
              <div
                key={p.sku}
                className="card"
                role="button"
                tabIndex={0}
                draggable
                title={p.name}
                onClick={() => onAdd(p.sku)}
                onKeyDown={(e) => e.key === "Enter" && onAdd(p.sku)}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", p.sku)}
              >
                {p.img ? <img src={p.img} alt="" loading="lazy" draggable={false} /> : <div className="noimg">No photo</div>}
                {!p.inStock && <span className="oos">Out of stock</span>}
                {p.custom && (
                  <button
                    className="rm"
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={(e) => { e.stopPropagation(); onRemoveCustom?.(p.sku); }}
                    onKeyDown={(e) => e.stopPropagation()}
                  >Remove</button>
                )}
                <div className="nm">{shortName(p.name)}</div>
                <div className="sz">{formatSize(p, unit) ?? "Size not listed"}</div>
                <div className="pr">
                  <span title={p.custom ? "Your own CAD part, no price" : undefined}>{p.custom ? "×" : money(p.price)}</span>
                  <span className="add" aria-hidden="true">+</span>
                </div>
              </div>
            ))
          ) : (
            <div className="empty" style={{ gridColumn: "1 / -1" }}>
              No parts match “{query}”. Try a size like 96mm or a word like servo.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
