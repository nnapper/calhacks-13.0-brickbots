import { useEffect, useState } from "react";
import { money } from "../lib/catalog.js";
import { MoonIcon, SunIcon } from "./Icons.jsx";

export default function TopBar({ view, prompt, onPrompt, onHome, totals, onCart, theme, onToggleTheme }) {
  const [draft, setDraft] = useState(prompt);
  useEffect(() => setDraft(prompt), [prompt]);
  const dark = theme === "dark";

  return (
    <header className="top"><a href="/" style={{color:"inherit",marginRight:16}}>CAD workspace ↗</a>
      <button className="logo" type="button" onClick={onHome} aria-label="BrickBots home">
        <i />
        BrickBots
      </button>
      {view === "build" ? (
        <form
          className="topprompt"
          onSubmit={(e) => {
            e.preventDefault();
            onPrompt(draft);
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Describe your robot" autoComplete="off" />
        </form>
      ) : (
        <div className="spacer" />
      )}
      {view === "build" && (
        <button className="cartpill" type="button" onClick={onCart} disabled={!totals.count}>
          <span>{totals.count} parts</span>
          <b>{money(totals.total)}</b>
        </button>
      )}
      <button className="iconbtn" type="button" onClick={onToggleTheme} aria-label={dark ? "Switch to day mode" : "Switch to night mode"}>
        {dark ? <SunIcon /> : <MoonIcon />}
      </button>
    </header>
  );
}
