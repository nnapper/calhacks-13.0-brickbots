import { useState } from "react";
import { money } from "../lib/catalog.js";
import { MoonIcon, SunIcon } from "./Icons.jsx";

export default function TopBar({ view, onHome, totals, onCart, theme, onToggleTheme, onAiSearch, aiBusy, aiHistory }) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const dark = theme === "dark";
  const submit = () => {
    const text = draft.trim();
    if (!text || aiBusy) return;
    setOpen(false);
    setDraft("");
    onAiSearch(text);
  };

  return (
    <header className="top">
      <button className="logo" type="button" onClick={onHome} aria-label="BrickBots home">
        <i />
        BrickBots
      </button>
      {view === "build" ? (
        <div className="topprompt">
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <input value={draft} disabled={aiBusy} placeholder="Ask Brick to build something" aria-label="Ask Brick" autoComplete="off"
              onChange={(e) => { setDraft(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)} />
          </form>
          {aiBusy && <span className="ai-busy-dot" aria-label="Brick is working" />}
          {open && !!(aiHistory?.length) && (
            <div className="ai-recent" onMouseDown={(e) => e.preventDefault()}>
              <div className="ai-recent-head">Recent</div>
              {aiHistory.map((item, i) => (
                <button key={i} type="button" onClick={() => { setOpen(false); setDraft(""); onAiSearch(item.query); }}>
                  <strong>{item.query}</strong>
                  <span className={item.ok ? "ok" : "bad"}>{item.output.split("\n")[0].slice(0, 110)}{(item.output.length > 110 || item.output.includes("\n")) ? "…" : ""}</span>
                  {item.detail && <small>{item.detail.slice(0, 140)}</small>}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="spacer" />
      )}
      {view === "build" && (
        <button className="cartpill" type="button" onClick={onCart} disabled={!Object.keys(totals.build??{}).length}>
          <span>{totals.count} parts</span>
          <b>{totals.pricedCount ? `${money(totals.total)}${totals.unpricedCount ? ' + unpriced' : ''}` : 'Price unavailable'}</b>
        </button>
      )}
      <button className="iconbtn" type="button" onClick={onToggleTheme} aria-label={dark ? "Switch to day mode" : "Switch to night mode"}>
        {dark ? <SunIcon /> : <MoonIcon />}
      </button>
    </header>
  );
}
