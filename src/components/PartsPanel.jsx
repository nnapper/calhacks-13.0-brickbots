import { useEffect, useMemo, useState } from "react";
import { GROUPS, PARTS, money, searchParts, shortName } from "../lib/catalog.js";
import { useLive } from "../hooks/useLive.js";
import { useLookup } from "../hooks/useLookup.js";
import { formatSize } from "../lib/units.js";
import { ChevronIcon, RefreshIcon, SearchIcon } from "./Icons.jsx";

const LIVE_LIMIT = 12; // live lookups cost money, so only the top results get checked
const CATALOG_GROUPS = GROUPS.filter(([key]) => key !== "custom");

// Parts a seller has that aren't in the catalog yet: shown under the search results, added with one click.
function LookupResults({ lookup, controls, query }) {
  const { busy, hits, error } = lookup;
  const { search, add, adding } = controls;
  const asked = lookup.query === query;
  return (
    <div className="lookup">
      {!asked ? (
        <button className="linkbtn" type="button" onClick={() => search(query)}>
          <SearchIcon />Not listed? Search for “{query}”
        </button>
      ) : busy ? (
        <p className="lookmsg" role="status">Searching…</p>
      ) : (
        <>
          <div className="lookhead">
            {hits.length ? "Not in the catalog yet" : "Nothing new found"}
            {lookup.corrected && lookup.corrected.toLowerCase() !== query.toLowerCase() && <> · showing “{lookup.corrected}”</>}
          </div>
          {hits.map((h) => (
            <div className="hit" key={h.sku}>
              <div className="hitinfo" title={`${h.sku} ${h.name} ${h.detail}`}>
                <span className="hitname">{h.name}</span>
                <span className="hitmeta">{h.sku}{h.detail ? ` · ${h.detail}` : ""}{h.inStock ? "" : " · Out of stock"}</span>
              </div>
              {h.price != null && <span className="hitprice">{money(h.price)}</span>}
              <button className="hitadd" type="button" disabled={adding != null} onClick={() => add(h)}>
                {adding === h.sku ? "Adding…" : "Add"}
              </button>
            </div>
          ))}
        </>
      )}
      {error && <p className="lookmsg err" role="alert">{error}</p>}
    </div>
  );
}

function PartCard({ part, unit, onAdd, onRemove }) {
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      draggable
      title={part.name}
      onClick={() => onAdd(part.sku)}
      onKeyDown={(e) => e.key === "Enter" && onAdd(part.sku)}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", part.sku);
        if (!part.custom) e.dataTransfer.setData("application/x-buildflow-catalog", part.sku);
      }}
    >
      {part.img ? <img src={part.img} alt="" loading="lazy" draggable={false} /> : <div className="noimg">No photo</div>}
      {!part.inStock && <span className="oos">Out of stock</span>}
      {onRemove && (
        <button
          className="rm"
          type="button"
          aria-label={`Remove ${part.name}`}
          onClick={(e) => { e.stopPropagation(); onRemove(part.sku); }}
          onKeyDown={(e) => e.stopPropagation()}
        >Remove</button>
      )}
      <div className="nm">{shortName(part.name)}</div>
      <div className="sz">{formatSize(part, unit) ?? "Size not listed"}</div>
      <div className="pr">
        <span>{part.custom ? "Your part" : money(part.price)}</span>
        <span className="add" aria-hidden="true">+</span>
      </div>
    </div>
  );
}

export default function PartsPanel({ designsHostRef, onAdd, onLive, onRemoveCustom, version, unit, collapsed, onToggle }) {
  const [tab, setTab] = useState("catalog");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const catalog = useMemo(() => searchParts(query, group).filter((p) => !p.custom), [query, group, version]);
  const catalogSize = useMemo(() => PARTS.filter((p) => !p.custom).length, [version]);
  const uploads = useMemo(() => PARTS.filter((p) => p.custom), [version]);
  const [live, refreshLive] = useLive(onLive);
  const [lookup, lookupControls] = useLookup(onLive);
  const looked = query.trim();
  // Nothing local matches: search the web instead of making the user ask. Other searches get a button (each lookup costs a credit).
  useEffect(() => {
    if (tab !== "catalog" || looked.length < 3 || catalog.length || lookup.query === looked) return;
    const t = setTimeout(() => lookupControls.search(looked), 700);
    return () => clearTimeout(t);
  }, [tab, looked, catalog.length, lookup.query]);

  if (collapsed) {
    return (
      <button className="paneltab left" type="button" onClick={onToggle} aria-label="Show parts">
        Parts <ChevronIcon dir="right" />
      </button>
    );
  }

  return (
    <aside className="panel left" aria-label="Parts">
      <div className="ph">
        <div className="lbl">
          Parts
          <span className="lblr">
            {tab === "catalog" && <span className="mono">{catalog.length} of {catalogSize}</span>}
            <button className="collapse" type="button" onClick={onToggle} aria-label="Hide parts"><ChevronIcon /></button>
          </span>
        </div>
        <div className="ptabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "catalog"} onClick={() => setTab("catalog")}>Catalog</button>
          <button type="button" role="tab" aria-selected={tab === "uploads"} onClick={() => setTab("uploads")}>
            My Designs{uploads.length ? <span className="pcount">{uploads.length}</span> : null}
          </button>
        </div>

        {tab === "catalog" ? (
          <>
            <label className="search">
              <SearchIcon />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search motors, 96mm, REX…" autoComplete="off" />
            </label>
            <div className="chips" role="group" aria-label="Filter by category">
              {CATALOG_GROUPS.map(([key, label]) => (
                <button key={key} className="chip" type="button" aria-pressed={group === key} onClick={() => setGroup(key)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="liverow">
              <button
                className="linkbtn"
                type="button"
                disabled={live.busy || !catalog.length}
                onClick={() => refreshLive(catalog.slice(0, LIVE_LIMIT).map((p) => p.sku))}
              >
                <RefreshIcon />
                {live.busy ? "Checking sellers…" : `Check live prices${catalog.length > LIVE_LIMIT ? ` for top ${LIVE_LIMIT}` : ""}`}
              </button>
              {live.text && !live.busy && <span role="status">{live.text}</span>}
            </div>
          </>
        ) : null}

      </div>

      <div className="scroll">
        {tab === "catalog" ? (
          <>
            <div className="cards">
              {catalog.map((p) => <PartCard key={p.sku} part={p} unit={unit} onAdd={onAdd} />)}
            </div>
            {!catalog.length && looked.length > 0 && looked.length < 3 && (
              <div className="empty">No parts match “{query}”. Try a size like 96mm or a word like servo.</div>
            )}
            {looked.length >= 3 && <LookupResults lookup={lookup} controls={lookupControls} query={looked} />}
          </>
        ) : (
          <>
          <div ref={designsHostRef} className="my-designs-library" />
          {uploads.length > 0 && <h3 className="legacy-designs-heading">Saved STL imports</h3>}
          {uploads.length ? (
          <div className="cards">
            {uploads.map((p) => <PartCard key={p.sku} part={p} unit={unit} onAdd={onAdd} onRemove={onRemoveCustom} />)}
          </div>
        ) : (
          null
          )}
          </>
        )}
      </div>
    </aside>
  );
}
