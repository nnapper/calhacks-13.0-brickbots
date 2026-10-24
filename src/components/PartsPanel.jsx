import { useMemo, useState } from "react";
import { GROUPS, PARTS, money, searchParts, shortName } from "../lib/catalog.js";
import { ChevronIcon, SearchIcon } from "./Icons.jsx";

export default function PartsPanel({ onAdd, collapsed, onToggle }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const results = useMemo(() => searchParts(query, group), [query, group]);

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
                <div className="nm">{shortName(p.name)}</div>
                <div className="pr">
                  <span>{money(p.price)}</span>
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
