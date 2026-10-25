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
  const [toast, setToast] = useState({ text: "", visible: false });
  const [unit, setUnit] = useState("mm");
  const [measureOn, setMeasureOn] = useState(true);

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

  const start = (text) => {
    setPrompt(text);
    setView("build");
    assemble(text);
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
        <Home build={totals.build} onStart={start} />
      ) : (
        <section className="build">
          <section className="stagewrap">
            <CadWorkspace unit={unit} onUnit={setUnit} measure={measureOn} onMeasure={setMeasureOn} designsHost={designsHost} onWorkspaceChange={setWorkspace} actionsRef={cadActions} />
          </section>

          <PartsPanel designsHostRef={setDesignsHost} onAdd={addPart} onLive={onLive} onRemoveCustom={removeCustom} version={liveVersion} unit={unit} collapsed={!partsOpen} onToggle={() => setPartsOpen((o) => !o)} />
          <WorkspacePanel metrics={totals} onAdjust={adjustPart} selectedId={workspace.selectedId} onSelect={id=>cadActions.current?.select(id)} onRemove={id=>cadActions.current?.remove(id)} onWhereToBuy={()=>setReceiptOpen(true)} collapsed={!bomOpen} onToggle={()=>setBomOpen(o=>!o)} />
        </section>
      )}

      <Receipt open={receiptOpen} build={totals.build} onAdjust={adjustPart} buildName={prompt} onClose={closeReceipt} onToast={showToast} onLive={onLive} />
      <div className={`toast${toast.visible ? " show" : ""}`} role="status">{toast.text}</div>
    </div>
  );
}
