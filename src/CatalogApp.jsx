import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BY_SKU, RAW_BY_SKU } from "./lib/catalog.js";
import { evaluateBuild } from "./compatibility/checks.js";
import "./styles/compatibility.css";
import { loadSavedCad, removeCad } from "./lib/custom.js";
import { useTheme } from "./hooks/useTheme.js";
import TopBar from "./components/TopBar.jsx";
import Home from "./components/Home.jsx";
import CadWorkspace from "./components/CadWorkspace";
import PartsPanel from "./components/PartsPanel.jsx";
import WorkspacePanel from "./components/WorkspacePanel.jsx";
import {workspaceMetrics} from "./lib/workspace-metrics.js";
import Receipt from "./components/Receipt.jsx";
import { compose } from "./lib/composer.js";
import { unbrand } from "./lib/brand.js";
import ElasticBuildHealth from "./components/ElasticBuildHealth.jsx";


export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [view, setView] = useState("home");
  const [prompt, setPrompt] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [liveVersion, setLiveVersion] = useState(0); // bumped when live prices replace catalog prices
  const [workspace,setWorkspace]=useState({parts:[],mates:[],selectedId:null,selectedIds:[]});
  const cadActions=useRef(null);
  const [designsHost, setDesignsHost] = useState(null);
  const [partsOpen, setPartsOpen] = useState(true);
  const [bomOpen, setBomOpen] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiHistory, setAiHistory] = useState(() => { try { return JSON.parse(localStorage.getItem("buildflow.aiHistory") ?? "[]"); } catch { return []; } });
  const [pendingGoal, setPendingGoal] = useState(null);
  const [pendingPreset, setPendingPreset] = useState(null);
  const [toast, setToast] = useState({ text: "", visible: false });
  const [unit, setUnit] = useState("mm");
  const [measureOn, setMeasureOn] = useState(true);

  const toastTimer = useRef(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "build") setView("build");
  }, []);

  const totals = useMemo(() => workspaceMetrics(workspace.parts,workspace.mates,BY_SKU), [workspace, liveVersion]);
  // Spec facts fetched on demand for connected parts whose saved catalog data is thin (server/compatibility.js).
  const [online, setOnline] = useState({});
  const [checking, setChecking] = useState(false);
  const [lookupError, setLookupError] = useState(false);
  const askedSkus = useRef(new Set());
  useEffect(() => {
    const byId = new Map(workspace.parts.map((p) => [p.id, p]));
    const wanted = new Set();
    for (const m of workspace.mates) {
      for (const id of [m.movingId, m.targetId]) {
        const sku = byId.get(id)?.model.asset.productId;
        if (sku && !askedSkus.current.has(sku)) wanted.add(sku);
      }
    }
    if (!wanted.size) return;
    const batch = [...wanted].slice(0, 16);
    batch.forEach((sku) => askedSkus.current.add(sku));
    setChecking(true);
    fetch("/api/compatibility/specs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skus: batch }) })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(({ records }) => { setOnline((o) => ({ ...o, ...records })); setLookupError(false); })
      .catch(() => { batch.forEach((sku) => askedSkus.current.delete(sku)); setLookupError(true); })
      .finally(() => setChecking(false));
  }, [workspace.parts, workspace.mates]);
  const health = useMemo(
    () => evaluateBuild(workspace.parts, workspace.mates, BY_SKU, RAW_BY_SKU, online),
    [workspace, online, liveVersion]
  );
  const showToast = useCallback((text) => {
    setToast({ text, visible: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2000);
  }, []);

  const recordAi = useCallback((entry) => {
    setAiHistory((h) => {
      const next = [entry, ...h.filter((x) => x.query !== entry.query)].slice(0, 3);
      try { localStorage.setItem("buildflow.aiHistory", JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);
  const runGoal = useCallback(async (text) => {
    if (aiBusy) return;
    setAiBusy(true);
    try {
      const result = await cadActions.current?.run?.(text);
      if (result) recordAi({ query: text, ok: !!result.ok, output: unbrand(result.output), detail: unbrand(result.detail) });
      else recordAi({ query: text, ok: false, output: "More Context Required", detail: "Open the build workspace first." });
      showToast(result?.ok ? `Built from plan · ${result.output.split("\n").length} sections` : "More Context Required");
    } catch (e) {
      recordAi({ query: text, ok: false, output: "More Context Required", detail: unbrand(e instanceof Error ? e.message : String(e)) });
      showToast("More Context Required");
    } finally { setAiBusy(false); }
  }, [aiBusy, recordAi, showToast]);

  // The home screen's prompt goes to the same AI helper as the top search bar (Claude plans the parts from the catalog).
  // If the helper cannot answer, the rule-based composer lays out a design instead, and says so.
  const homeGoal = useRef(null);
  const start = (text) => {
    text = text.trim();
    if (!text) return;
    setPrompt(text);
    homeGoal.current = text;
    setPendingGoal(text);
    setView("build");
  };
  const onGoalResult = useCallback((goal, result) => {
    recordAi({ query: goal, ok: !!result.ok, output: unbrand(result.output), detail: unbrand(result.detail) });
    if (homeGoal.current !== goal) return;
    homeGoal.current = null;
    if (result.ok) { showToast(result.detail === "rule-based" ? "Brick could not plan this one, so it was built from catalog rules" : "Built by Brick"); return; }
    setPendingPreset(compose(goal));
    showToast("Brick could not build this, so a rule-based design was used instead");
  }, [recordAi, showToast]);
  // An empty workspace: nothing is loaded, restored or generated, and Undo brings back whatever was there before.
  const startBlank = () => {
    setPrompt("");
    setPendingPreset({ id: "blank", name: "Blank canvas", parts: [], mates: [], notes: ["Blank canvas · add parts from the library or ask Brick to build something."] });
    setView("build");
  };
  // A ready-made example from the home screen.
  const startPreset = (preset) => {
    setPrompt(preset.name);
    setPendingPreset(preset);
    setView("build");
  };

  const addPart = (sku) => {
    if(BY_SKU[sku]?.custom){showToast('Import the original STL in My Designs to add it to this workspace.');return;}
    return cadActions.current?.add(sku);
  };

  // Panel and receipt +/-: plus places more copies in the workspace (one at a time, each must finish loading);
  // minus removes the most recently placed copy.
  const adjustPart = async (sku, delta) => {
    if (delta > 0) {
      for (let i = 0; i < delta; i++) {
        await addPart(sku);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      return;
    }
    const row = [...totals.rows].reverse().find((r) => r.product?.sku === sku);
    if (row) cadActions.current?.remove(row.id);
  };

  const closeReceipt = useCallback(() => setReceiptOpen(false), []);
  const onLive = useCallback(() => setLiveVersion((v) => v + 1), []); // catalog changed: live prices or uploaded CAD

  useEffect(() => {
    loadSavedCad().then((parts) => parts.length && onLive());
  }, [onLive]);

  const removeCustom = async (sku) => {
    await removeCad(sku);
    onLive();
  };

  return (
    <div className="app" data-view={view}>
      <TopBar
        view={view}
        onHome={() => setView("home")}
        totals={totals}
        onCart={() => setReceiptOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onAiSearch={(text) => { if (view !== "build") { setPrompt(text); setView("build"); setPendingGoal(text); } else void runGoal(text); }}
        aiBusy={aiBusy}
        aiHistory={aiHistory}
      />

      {view === "home" ? (
        <Home build={totals.build} onStart={start} onPreset={startPreset} onBlank={startBlank} />
      ) : (
        <section className="build" data-parts-open={partsOpen} data-build-open={bomOpen}>
          <section className="stagewrap">
            <CadWorkspace unit={unit} onUnit={setUnit} measure={measureOn} onMeasure={setMeasureOn} designsHost={designsHost} onWorkspaceChange={setWorkspace} actionsRef={cadActions} pendingGoal={pendingGoal} onPendingGoalConsumed={() => setPendingGoal(null)} pendingPreset={pendingPreset} onPendingPresetConsumed={() => setPendingPreset(null)} onGoalResult={onGoalResult} />
            <ElasticBuildHealth parts={workspace.parts} mates={workspace.mates} />
          </section>

          <PartsPanel designsHostRef={setDesignsHost} onAdd={addPart} onLive={onLive} onRemoveCustom={removeCustom} version={liveVersion} unit={unit} collapsed={!partsOpen} onToggle={() => setPartsOpen((o) => !o)} />
          <WorkspacePanel health={health} checking={checking} lookupError={lookupError} metrics={totals} onAdjust={adjustPart} selectedId={workspace.selectedId} selectedIds={workspace.selectedIds} onSelect={id=>cadActions.current?.select(id)} onRemove={id=>cadActions.current?.remove(id)} onWhereToBuy={()=>setReceiptOpen(true)} collapsed={!bomOpen} onToggle={()=>setBomOpen(o=>!o)} />
        </section>
      )}

      <Receipt open={receiptOpen} build={totals.build} onAdjust={adjustPart} buildName={prompt} onClose={closeReceipt} onToast={showToast} onLive={onLive} />
      <div className={`toast${toast.visible ? " show" : ""}`} role="status">{toast.text}</div>
    </div>
  );
}
