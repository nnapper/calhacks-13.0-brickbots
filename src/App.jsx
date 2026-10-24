import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { BY_SKU, shortName } from "./lib/catalog.js";
import { planBuild } from "./lib/planner.js";
import { buildCheck, buildReducer, buildTotals } from "./lib/build.js";
import { getScene } from "./scene/sceneInstance.js";
import { useTheme } from "./hooks/useTheme.js";
import TopBar from "./components/TopBar.jsx";
import Home from "./components/Home.jsx";
import Stage from "./components/Stage.jsx";
import PartsPanel from "./components/PartsPanel.jsx";
import BuildPanel from "./components/BuildPanel.jsx";
import Receipt from "./components/Receipt.jsx";
import Balloons from "./components/Balloons.jsx";
import { PlayIcon } from "./components/Icons.jsx";

const DROP_STAGGER_MS = 170;

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [view, setView] = useState("home");
  const [prompt, setPrompt] = useState("");
  const [build, dispatch] = useReducer(buildReducer, undefined, () =>
    buildReducer({}, { type: "set", items: planBuild("4-wheel rover") })
  );
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(true);
  const [bomOpen, setBomOpen] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState({ text: "", visible: false });

  const animateNext = useRef(false);
  const timers = useRef([]);
  const toastTimer = useRef(null);

  const totals = useMemo(() => buildTotals(build), [build]);
  const check = useMemo(() => buildCheck(totals), [totals]);
  const focus = hovered ?? selected;
  const focusCallout = useMemo(
    () => (focus && build[focus] ? [{ sku: focus, label: shortName(BY_SKU[focus].name), dx: 70, dy: -80 }] : []),
    [build, focus]
  );

  const showToast = useCallback((text) => {
    setToast({ text, visible: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2000);
  }, []);

  useEffect(() => {
    getScene().onPick = setSelected;
  }, []);
  useEffect(() => {
    getScene().setBuild(build, BY_SKU, { animate: animateNext.current });
  }, [build]);
  useEffect(() => {
    getScene().setGlow(view === "build" ? focus : null);
  }, [view, focus]);
  useEffect(() => {
    getScene().applyTheme();
  }, [theme]);

  const assemble = useCallback(
    (text) => {
      timers.current.forEach(clearTimeout);
      animateNext.current = false;
      setSelected(null);
      dispatch({ type: "clear" });
      const steps = planBuild(text).flatMap(({ sku, qty }) => Array(qty).fill(sku));
      steps.forEach((sku, i) =>
        timers.current.push(
          setTimeout(() => {
            animateNext.current = true;
            dispatch({ type: "add", sku });
          }, 250 + i * DROP_STAGGER_MS)
        )
      );
      timers.current.push(setTimeout(() => showToast(`Assembled ${steps.length} parts from your description`), 400 + steps.length * DROP_STAGGER_MS));
    },
    [showToast]
  );

  const start = (text) => {
    setPrompt(text);
    setView("build");
    assemble(text);
  };

  const addPart = (sku, delta = 1) => {
    animateNext.current = true;
    dispatch({ type: "add", sku, delta });
    if (delta > 0) {
      showToast(`Added ${shortName(BY_SKU[sku].name)}`);
      setSelected(sku);
    } else if (selected === sku && (build[sku] ?? 0) + delta <= 0) {
      setSelected(null);
    }
  };

  const simulate = () => {
    if (!totals.count) return;
    setSimulating(true);
    getScene().simulate(() => setSimulating(false));
  };

  const closeReceipt = useCallback(() => setReceiptOpen(false), []);

  return (
    <div className="app" data-view={view}>
      <TopBar
        view={view}
        prompt={prompt}
        onPrompt={(text) => {
          setPrompt(text);
          assemble(text);
        }}
        onHome={() => setView("home")}
        totals={totals}
        onCart={() => setReceiptOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {view === "home" ? (
        <Home build={build} onStart={start} />
      ) : (
        <section className="build">
          <section
            className={`stagewrap${dragOver ? " drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const sku = e.dataTransfer.getData("text/plain");
              if (BY_SKU[sku]) addPart(sku);
            }}
          >
            <Stage mode="build" />
            <Balloons items={focusCallout} />
            <div className="hint">Drag to orbit · scroll to zoom · drop parts here</div>
            <button className="simbtn" type="button" onClick={simulate} disabled={simulating || !totals.count}>
              <PlayIcon />
              {simulating ? "Driving…" : "Simulate drive"}
            </button>
          </section>

          <PartsPanel onAdd={addPart} collapsed={!partsOpen} onToggle={() => setPartsOpen((o) => !o)} />
          <BuildPanel
            build={build}
            totals={totals}
            check={check}
            selected={selected}
            onSelect={setSelected}
            onHover={setHovered}
            onAdd={addPart}
            onWhereToBuy={() => setReceiptOpen(true)}
            collapsed={!bomOpen}
            onToggle={() => setBomOpen((o) => !o)}
          />
        </section>
      )}

      <Receipt open={receiptOpen} build={build} buildName={prompt} onClose={closeReceipt} onToast={showToast} />
      <div className={`toast${toast.visible ? " show" : ""}`} role="status">{toast.text}</div>
    </div>
  );
}
