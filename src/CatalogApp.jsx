import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BY_SKU } from "./lib/catalog.js";
import { loadSavedCad, removeCad } from "./lib/custom.js";
import { useTheme } from "./hooks/useTheme.js";
import TopBar from "./components/TopBar.jsx";
import Home from "./components/Home.jsx";
import CadWorkspace from "./components/CadWorkspace";
import PartsPanel from "./components/PartsPanel.jsx";
import WorkspacePanel from "./components/WorkspacePanel.jsx";
import {workspaceMetrics} from "./lib/workspace-metrics.js";
import Receipt from "./components/Receipt.jsx";


export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [view, setView] = useState("home");
  const [prompt, setPrompt] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [liveVersion, setLiveVersion] = useState(0); // bumped when live prices replace catalog prices
  const [workspace,setWorkspace]=useState({parts:[],mates:[],selectedId:null});
  const cadActions=useRef(null);
  const [designsHost, setDesignsHost] = useState(null);
  const [partsOpen, setPartsOpen] = useState(true);
  const [bomOpen, setBomOpen] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiHistory, setAiHistory] = useState(() => { try { return JSON.parse(localStorage.getItem("buildflow.aiHistory") ?? "[]"); } catch { return []; } });
  const [pendingGoal, setPendingGoal] = useState(null);
  const [toast, setToast] = useState({ text: "", visible: false });
  const unit = "mm";

  const toastTimer = useRef(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "build") setView("build");
  }, []);

  const totals = useMemo(() => workspaceMetrics(workspace.parts,workspace.mates,BY_SKU), [workspace, liveVersion]);
  const showToast = useCallback((text) => {
    setToast({ text, visible: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2000);
  }, []);

  const assemble = useCallback((text)=>{showToast('Choose catalog parts or import models to build your design. Metrics follow the actual workspace.');},[showToast]);
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
      if (result) recordAi({ query: text, ok: !!result.ok, output: result.output, detail: result.detail });
      else recordAi({ query: text, ok: false, output: "More Context Required", detail: "Open the build workspace first." });
      showToast(result?.ok ? `Built from plan · ${result.output.split("\n").length} sections` : "More Context Required");
    } catch (e) {
      recordAi({ query: text, ok: false, output: "More Context Required", detail: e instanceof Error ? e.message : String(e) });
      showToast("More Context Required");
    } finally { setAiBusy(false); }
  }, [aiBusy, recordAi, showToast]);

  const start = (text) => {
    setPrompt(text);
    setView("build");
    assemble(text);
  };

  const addPart = (sku) => {
    if(BY_SKU[sku]?.custom){showToast('Import the original STL in My Designs to add it to this workspace.');return;}
    void cadActions.current?.add(sku);
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
        <Home build={totals.build} onStart={start} />
      ) : (
        <section className="build">
          <section className="stagewrap">
            <CadWorkspace designsHost={designsHost} onWorkspaceChange={setWorkspace} actionsRef={cadActions} pendingGoal={pendingGoal} onPendingGoalConsumed={() => setPendingGoal(null)} />
          </section>

          <PartsPanel designsHostRef={setDesignsHost} onAdd={addPart} onLive={onLive} onRemoveCustom={removeCustom} version={liveVersion} unit={unit} collapsed={!partsOpen} onToggle={() => setPartsOpen((o) => !o)} />
          <WorkspacePanel metrics={totals} selectedId={workspace.selectedId} onSelect={id=>cadActions.current?.select(id)} onRemove={id=>cadActions.current?.remove(id)} onWhereToBuy={()=>setReceiptOpen(true)} collapsed={!bomOpen} onToggle={()=>setBomOpen(o=>!o)} />
        </section>
      )}

      <Receipt open={receiptOpen} build={totals.build} buildName={prompt} onClose={closeReceipt} onToast={showToast} onLive={onLive} />
      <div className={`toast${toast.visible ? " show" : ""}`} role="status">{toast.text}</div>
    </div>
  );
}
