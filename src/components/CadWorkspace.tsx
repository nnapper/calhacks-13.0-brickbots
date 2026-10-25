import {validatePlanCount, layoutIssues} from '../assembly/ai-validation';
import {localCatalogPlan, fallbackPlan, primitiveBodyPlan, shelfArrangement} from '../assembly/fast-build';
import {Box3,Euler,Quaternion,Vector3} from 'three';
import {worldBox} from '../assembly/snapping';
import { createPortal } from 'react-dom';
import { Component, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Viewer, type View, type ViewerBridge } from './Viewer';
import { loadModel, type LoadedModel } from '../cad/import';
import { disposeModel } from '../cad/geometry';
import { placeholderFile, primitiveFile } from '../cad/placeholder';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { addPosition, findSnap, alignConnectors, compatible, type PartInstance, type Mate, type Snap } from '../assembly/snapping';
import { BY_SKU, shortName } from '../lib/catalog.js';
import { PRESET } from '../lib/preset.js';
import { compose, designFromSpec, knowsHow } from '../lib/composer.js';
import { unbrand } from '../lib/brand.js';
import { savedBuilds, toRecord, MAX_SAVED_BUILDS, type BuildSummary } from '../lib/savedBuilds';
import { analyzeGeometry } from '../cad/analyze';
import { applySuggestions, type Connector, type PairSuggestion } from '../contracts/connectors';
import { cloud, api, workspaceSecret, saveWorkspace, suggestNodes, suggestPairings, askPlanner, askClaudePlan, askClaudeArrangement, askArrangement, verifyArrangement, verifyPlan } from '../cloud/client';
import '../styles/cad.css';

class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="cad-webgl-error">The viewer could not render this model. Try another file or reload.</div> : this.props.children; }
}

const fixtures = [
  { name: 'Precision plate', file: 'plate.step', subtitle: '100 × 60 × 6 mm · four Ø8 mm holes', tag: 'STEP', icon: '▱' },
  { name: 'Two-body assembly', file: 'assembly.step', subtitle: 'Offset + 90° rotation · placement check', tag: 'STEP', icon: '▧' },
  { name: 'GLB reference', file: 'reference.glb', subtitle: '100 × 60 × 6 mm · meter-scale mesh', tag: 'GLB', icon: '◇' },
  { name: 'Grid plate 3×5', file: 'grid-plate-3x5.step', subtitle: '40 × 24 × 2.5 mm · 15 Ø4 holes, 8 mm grid', tag: 'BUILD', icon: '▦' },
  { name: 'Grid plate 4×4', file: 'grid-plate-4x4.step', subtitle: '32 × 32 × 2.5 mm · 16 Ø4 holes, 8 mm grid', tag: 'BUILD', icon: '▦' },
  { name: 'Flat beam 1×7', file: 'flat-beam-1x7.step', subtitle: '64 × 8 × 2.5 mm · 7 Ø4 holes, 8 mm grid', tag: 'BUILD', icon: '▬' },
  { name: 'Wall block', file: 'wall-block.step', subtitle: '48 × 24 × 4 mm · solid, connects face to face', tag: 'BUILD', icon: '▮' },
  { name: 'L-bracket', file: 'l-bracket.step', subtitle: '24 × 26.5 × 24 mm · 15 Ø4 holes on two legs', tag: 'BUILD', icon: '∟' },
];

function remainingMs(deadline: number) {
  return deadline - Date.now();
}

function subDeadline(deadline: number, milliseconds: number) {
  return Math.min(deadline, Date.now() + milliseconds);
}

function raceDeadline<T>(task: Promise<T>, deadline: number): Promise<T | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), Math.max(0, remainingMs(deadline)));
    task.then(value => { clearTimeout(timer); resolve(value); }).catch(() => { clearTimeout(timer); resolve(null); });
  });
}

export default function CadWorkspace({designsHost, onWorkspaceChange, actionsRef, pendingGoal, onPendingGoalConsumed, pendingPreset, onPendingPresetConsumed, onGoalResult, unit='mm', onUnit, measure=true, onMeasure}: {designsHost: HTMLElement | null; onWorkspaceChange?: (state: {parts:PartInstance[];mates:Mate[];selectedId:string|null;selectedIds:string[]})=>void; actionsRef?: {current:any}; pendingGoal?: string|null; onPendingGoalConsumed?: () => void; pendingPreset?: any; onPendingPresetConsumed?: () => void; onGoalResult?: (goal: string, result: {ok:boolean;output:string;detail?:string}) => void; unit?: string; onUnit?: (unit: string)=>void; measure?: boolean; onMeasure?: (on: boolean)=>void}) {
  const solidBoxes=useRef(new Set<string>());
  const stagedBuild=useRef<PartInstance[]|null>(null);
  const building=useRef(false);
  const [parts, setParts] = useState<PartInstance[]>([]);
  // Several parts can be selected at once (drag box or Shift-click); the last one picked is the primary part.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const setSelectedId = (id: string | null) => setSelectedIds(id ? [id] : []);
  const [boxSelect, setBoxSelect] = useState(false);
  const [alignOn, setAlignOn] = useState(true);
  const [mates, setMates] = useState<Mate[]>([]);
  const snapEnabled = true;
  const [preview, setPreview] = useState<Snap | null>(null);
  const [notice, setNotice] = useState('Drag a library model into the workspace.');
  const [library, setLibrary] = useState<{ key: string; name: string; file: File; generated?: boolean }[]>([]);
  const [history, setHistory] = useState<{ parts: PartInstance[]; mates: Mate[] }[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('Perspective');
  const [reset, setReset] = useState(0);
  const [wireframe, setWireframe] = useState(false);
  const [filter, setFilter] = useState('');
  const [dragging, setDragging] = useState(false);
  const [operation, setOperation] = useState('');
  // Brick's visible reasoning: it reads the request, lists the parts the build needs, then builds. Shown beside the canvas.
  type PlanItem = { name: string; qty: number; note?: string };
  const [planCard, setPlanCard] = useState<{ stage: 'thinking' | 'parts' | 'building' | 'done' | 'failed'; goal: string; summary?: string; items?: PlanItem[]; message?: string } | null>(null);
  const planCardRef = useRef<typeof planCard>(null); planCardRef.current = planCard;
  const planTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPlan = (card: NonNullable<typeof planCard> | null) => { if (planTimer.current) clearTimeout(planTimer.current); setPlanCard(card); if (card && (card.stage === 'done' || card.stage === 'failed')) planTimer.current = setTimeout(() => setPlanCard(null), 14000); };
  const itemsFromParts = (parts: { sku: string; qty?: number }[], notes: Record<string, string> = {}): PlanItem[] => {
    const grouped = new Map<string, PlanItem>();
    for (const p of parts) {
      const row = grouped.get(p.sku) ?? { name: shortName(BY_SKU[p.sku]?.name ?? p.sku).replace(/^\d{4} Series /, ''), qty: 0, note: notes[p.sku] };
      row.qty += p.qty ?? 1; grouped.set(p.sku, row);
    }
    return [...grouped.values()];
  };
  const [statusOffset, setStatusOffset] = useState({x: 0, y: 0});
  const [statusDragging, setStatusDragging] = useState(false);
  const [revision, setRevision] = useState(0);
  const [cloudStatus, setCloudStatus] = useState('Loading saved workspace…');
  const [ready, setReady] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, LoadedModel>());
  const bridge = useRef<ViewerBridge | null>(null);
  const live = useRef({ parts, mates });
  live.current = { parts, mates };
  const pairPartners = useRef(new Map<string, { partId: string; nodeId: string }>());
  const pairingBusy = useRef(false);
  const pairingPending = useRef(false);
  const runPairingRef = useRef<() => void>(() => {});
  const statusDrag = useRef<{pointerId:number; x:number; y:number; origin:{x:number; y:number}} | null>(null);
  const model = parts.find(p => p.id === selectedId)?.model ?? null;
  useEffect(()=>{onWorkspaceChange?.({parts,mates,selectedId,selectedIds});},[parts,mates,selectedId,selectedIds,onWorkspaceChange]);
  if(actionsRef)actionsRef.current={add:generateProduct,select:setSelectedId,remove:(id:string)=>{checkpoint();setParts(items=>items.filter(p=>p.id!==id));setMates(items=>items.filter(m=>m.movingId!==id&&m.targetId!==id));setSelectedIds(current=>current.filter(i=>i!==id));},run};
  const pairingKey = parts.map(p => `${p.id}:${p.model.asset.id}:${p.model.geometryRevision ?? ''}:${p.model.connectors?.length ?? 0}`).join('|');
  const pairingKeyRef = useRef(pairingKey);
  pairingKeyRef.current = pairingKey;

  useEffect(() => { runPairingRef.current(); }, [pairingKey]);
  useEffect(() => () => {
    controller.current?.abort();
    cache.current.forEach(model => disposeModel(model.object));
  }, []);

  async function restore(): Promise<number> {
    if (!cloud) { setCloudStatus('Local only'); setReady(true); return 0; }
    setOperation('Loading workspace');
    try {
      const secret = workspaceSecret();
      await cloud.mutation(api.data.open, { secret });
      const saved = await cloud.query(api.data.get, { secret });
      if (saved?.snapshot) {
        const sources = new Map<string, LoadedModel>();
        const entries: { key: string; name: string; file: File }[] = [];
        for (const record of saved.snapshot.sources) {
          const response = await fetch(record.url);
          if (!response.ok) throw new Error('Saved model download failed');
          const file = new File([await response.arrayBuffer()], record.asset.name);
          const source = await loadModel(file, new AbortController().signal, record.asset.sourceKind === 'test_fixture');
          Object.assign(source, { asset: record.asset, storageId: record.storageId, connectors: record.connectors, geometryRevision: record.geometryRevision });
          sources.set(record.sourceId, source);
          cache.current.set(record.sourceId, source);
          if (record.asset.sourceKind === 'test_fixture') cache.current.set(file.name, source);
          else entries.push({ key: record.sourceId, name: file.name, file });
        }
        setParts(saved.snapshot.parts.map((p: PartInstance & { sourceId: string }) => ({ ...p, model: { ...sources.get(p.sourceId)!, object: clone(sources.get(p.sourceId)!.object) as LoadedModel['object'] } })));
        setMates(saved.snapshot.mates);
        setLibrary(entries);
        setSelectedId(null);
        setHistory([]);
      }
      setRevision(saved?.revision ?? 0);
      setCloudStatus('Convex connected · save to sync');
      return saved?.snapshot?.parts?.length ?? 0;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
      setCloudStatus('Restore failed');
    } finally {
      setReady(true);
      setOperation('');
    }
    return 0;
  }

  // Restore a saved workspace, but only generate models after an explicit request.
  useEffect(() => { void restore(); }, []);

  // ---- Saved builds: up to five, kept in this browser so they survive a reload ----
  const [builds, setBuilds] = useState<BuildSummary[]>([]);
  const [buildsOpen, setBuildsOpen] = useState(false);
  const [buildName, setBuildName] = useState('');
  const refreshBuilds = () => savedBuilds.list().then(setBuilds).catch(() => setBuilds([]));
  useEffect(() => { void refreshBuilds(); }, []);

  async function saveBuild() {
    if (busy) return;
    setError('');
    try {
      await savedBuilds.save(await toRecord(buildName || `Build ${builds.length + 1}`, parts, mates));
      setBuildName('');
      await refreshBuilds();
      setNotice('Build saved in this browser');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this build');
    }
  }

  async function deleteBuild(id: string) {
    if (!window.confirm('Delete this saved build? This cannot be undone.')) return;
    try { await savedBuilds.remove(id); await refreshBuilds(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete this build'); }
  }

  async function openBuild(id: string) {
    if (busy) return;
    setError('');
    setBusy('Opening saved build');
    try {
      const record = await savedBuilds.get(id);
      if (!record) throw new Error('That saved build is no longer stored.');
      const sources = new Map<string, LoadedModel>();
      const entries: { key: string; name: string; file: File }[] = [];
      for (const saved of record.sources) {
        const file = new File([saved.bytes], saved.fileName);
        const source = await loadModel(file, new AbortController().signal, saved.asset.sourceKind === 'test_fixture');
        Object.assign(source, { asset: saved.asset, connectors: saved.connectors, geometryRevision: saved.geometryRevision });
        sources.set(saved.sourceId, source);
        cache.current.set(saved.sourceId, source);
        if (saved.asset.sourceKind === 'test_fixture') cache.current.set(file.name, source);
        else entries.push({ key: saved.sourceId, name: file.name, file });
      }
      const ids = record.parts.map(() => crypto.randomUUID());
      const instances: PartInstance[] = record.parts.map((p, i) => {
        const source = sources.get(p.sourceId)!;
        return { id: ids[i], scale: p.scale, position: p.position, quaternion: p.quaternion, model: { ...source, object: clone(source.object) as LoadedModel['object'] } };
      });
      checkpoint();
      setParts(instances);
      setMates(record.mates.map(m => ({ movingId: ids[m.moving], targetId: ids[m.target], axis: m.axis, side: m.side, movingNodeId: m.movingNodeId, targetNodeId: m.targetNodeId })));
      setLibrary(l => [...l, ...entries.filter(e => !l.some(x => x.key === e.key))]);
      setSelectedIds([]);
      setReset(r => r + 1);
      setBuildsOpen(false);
      setNotice(`Opened “${record.name}” · Undo brings back the previous build`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this build');
    } finally {
      setBusy('');
    }
  }

  async function save() {
    setOperation('Saving workspace');
    try {
      setRevision(await saveWorkspace(parts, mates, cache.current, revision));
      setCloudStatus('Saved to Convex');
    } catch (e) {
      setError(String(e));
    } finally {
      setOperation('');
    }
  }

  function updateNodes(source: LoadedModel, nodes: Connector[], geometryRevision = source.geometryRevision) {
    for (const [key, cached] of cache.current) if (cached.asset.id === source.asset.id) Object.assign(cached, { connectors: nodes, geometryRevision });
    setParts(items => items.map(p => p.model.asset.id === source.asset.id ? { ...p, model: { ...p.model, connectors: nodes, geometryRevision } } : p));
    setMates(items => items.filter(m => !parts.some(p => p.model.asset.id === source.asset.id && (p.id === m.movingId || p.id === m.targetId))));
  }

  async function analyze() {
    if (!model) return;
    setOperation('Finding attachment nodes');
    setError('');
    try {
      const source = [...cache.current.values()].find(m => m.asset.id === model.asset.id)!;
      const result = await analyzeGeometry(source);
      updateNodes(source, result.candidates, result.geometryRevision);
      setNotice('Review the proposed nodes before snapping.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOperation('');
    }
  }

  async function recommend() {
    if (!model) return;
    setOperation('Brick is reviewing nodes');
    setError('');
    try {
      const result = await suggestNodes(model);
      updateNodes(model, applySuggestions(model.connectors ?? [], result.result));
      setNotice('Brick suggestions ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOperation('');
    }
  }

  function checkpoint() { const snapshot=live.current; setHistory(h => [...h.slice(-19), snapshot]); }

  function place(source: LoadedModel, drop?: [number, number, number]): string {
    const existing = stagedBuild.current ?? live.current.parts;
    const instance: PartInstance = { id: crypto.randomUUID(), model: { ...source, object: clone(source.object) as LoadedModel['object'] }, position: addPosition(source, existing, drop) };
    const snap = snapEnabled && drop ? findSnap(instance, instance.position, existing, undefined, 0) : null;
    if (snap) { instance.position = snap.position; instance.quaternion = snap.quaternion; }
    instance.model.object.position.set(...instance.position);
    if(stagedBuild.current){stagedBuild.current.push(instance);return instance.id;}
    checkpoint();
    setParts([...existing, instance]);
    live.current = {parts: [...existing, instance], mates: live.current.mates};
    setSelectedId(instance.id);
    if (snap) setMates(m => [...m, { movingId: instance.id, targetId: snap.targetId, movingNodeId: snap.movingNodeId, targetNodeId: snap.targetNodeId }]);
    setNotice(snap ? 'Snapped · attachment nodes aligned' : 'Part added. Drag it near another part to snap.');
    return instance.id;
  }

  async function open(file: File, fixture = false, ownController?: AbortController, drop?: [number, number, number], key?: string, deadline?: number, analyzeNodes = true) {
    if (!ownController) controller.current?.abort();
    const abort = ownController ?? new AbortController();
    controller.current = abort;
    const deadlineTimer = deadline ? setTimeout(() => abort.abort(), Math.max(0, remainingMs(deadline))) : null;
    setError('');
    setBusy(`Importing ${file.name}`);
    try {
      const next = await loadModel(file, abort.signal, fixture);
      if (abort.signal.aborted) { disposeModel(next.object); return; }
      const sourceKey = key ?? next.asset.id;
      if (sourceKey.startsWith('generated:')) next.asset.productId = sourceKey.slice('generated:'.length);
      if (sourceKey.startsWith('placeholder:')) next.asset.productId = sourceKey.slice('placeholder:'.length);
      cache.current.set(sourceKey, next);
      if (!fixture) setLibrary(l => [...l, { key: sourceKey, name: file.name, file, generated: sourceKey.startsWith('generated:') }]);
      if (analyzeNodes) await findNodes(next);
      return place(next, drop);
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (controller.current === abort) { setBusy(''); controller.current = null; }
    }
  }

  async function generateProduct(sku: string, drop?: [number, number, number], forceBusy=false, deadline?: number, analyzeNodes = true):Promise<string|null> {
    if (busy && !forceBusy) return null;
    const cachedSource = [...cache.current.values()].find(source => source.asset.productId === sku);
    if (cachedSource) { const id=place(cachedSource, drop); setNotice('Generated CAD prototype reused · inspect before assembly'); return id; }
    setError('');
    // Prebuilt assets are served directly from Vite. The generator endpoint can be slow even for cached models,
    // so checking this URL first is the difference between a one-second import and a build that misses its deadline.
    try {
      const glb = await fetch(`/generated/${sku}/model.glb`, {method: 'HEAD'});
      if (glb.ok) {
        setBusy('Loading prebuilt model');
        const modelResponse = await fetch(`/generated/${sku}/model.glb`);
        if (!modelResponse.ok) throw new Error('Prebuilt model download failed');
        const partId=await open(new File([await modelResponse.arrayBuffer()], `${BY_SKU[sku]?.name ?? sku}.glb`), false, new AbortController(), drop, `generated:${sku}`, deadline, analyzeNodes);
        setNotice('Prebuilt CAD prototype added to model library · inspect before assembly');
        return partId ?? null;
      }
      const prebuilt = await fetch(`/generated/${sku}/model.step`, {method: 'HEAD'});
      if (prebuilt.ok) {
        setBusy('Loading prebuilt model');
        const modelResponse = await fetch(`/generated/${sku}/model.step`);
        if (!modelResponse.ok) throw new Error('Prebuilt model download failed');
        const partId=await open(new File([await modelResponse.arrayBuffer()], `${BY_SKU[sku]?.name ?? sku}.step`), false, new AbortController(), drop, `generated:${sku}`, deadline, analyzeNodes);
        setNotice('Prebuilt CAD prototype added to model library · inspect before assembly');
        return partId ?? null;
      }
    } catch {
      // Fall through to generation, which handles SKUs that have not been prebuilt.
    }
    setBusy('Generating');
    try {
      const response = await fetch('/geometry/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku }),
        signal: AbortSignal.timeout(Math.max(1, deadline ? remainingMs(deadline) : 180_000)),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail ?? `Generation failed (HTTP ${response.status})`);
      }
      const result = await response.json();
      const modelResponse = await fetch(result.stepUrl);
      if (!modelResponse.ok) throw new Error('Generated model download failed');
      const partId=await open(new File([await modelResponse.arrayBuffer()], `${result.name}.step`), false, new AbortController(), drop, `generated:${sku}`, deadline, analyzeNodes);
      setNotice('Generated CAD prototype added to model library · inspect before assembly');
      return partId ?? null;
    } catch (e) {
      // No generated model for this part: stand in with its category shape so it still counts in the build.
      try {
        const product = BY_SKU[sku];
        if (!product) throw e;
        const partId = await open(await placeholderFile(product), false, new AbortController(), drop, `placeholder:${sku}`, deadline);
        setNotice('No 3D model for this part yet · showing a placeholder shape');
        return partId ?? null;
      } catch {
        setError(e instanceof Error ? e.message : 'Generation failed');
        setBusy('');
      }
      return null;
    }
  }

  // Loads a catalog product's generated model (pre-built ones return instantly) and its attachment nodes without placing it.
  async function loadProductModel(sku: string): Promise<LoadedModel> {
    const cached = [...cache.current.values()].find(source => source.asset.productId === sku);
    if (cached) return cached;
    let file: File;
    try {
      const response = await fetch('/geometry/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail ?? `Model for ${sku} failed (HTTP ${response.status})`);
      }
      const result = await response.json();
      const modelResponse = await fetch(result.stepUrl);
      if (!modelResponse.ok) throw new Error('Generated model download failed');
      file = new File([await modelResponse.arrayBuffer()], `${result.name}.step`);
    } catch (error) {
      // Without the CAD service (the deployed site) the prebuilt model that ships with the app is used instead.
      const prebuilt = await fetch(`/generated/${sku}/model.glb`).catch(() => null);
      if (!prebuilt?.ok || /html/i.test(prebuilt.headers.get('content-type') ?? '')) throw error;
      file = new File([await prebuilt.arrayBuffer()], `${BY_SKU[sku]?.name ?? sku}.glb`);
    }
    const next = await loadModel(file, new AbortController().signal, false);
    next.asset.productId = sku;
    cache.current.set(`generated:${sku}`, next);
    setLibrary(l => [...l, { key: `generated:${sku}`, name: file.name, file, generated: true }]);
    await findNodes(next);
    return next;
  }

  // Replaces the workspace with a laid-out design: a preset, a composed build or one Claude specified (Undo brings the
  // previous build back). Every part has a prebuilt model, so this does not depend on a time budget.
  // With `beside`, the design is added to the right of what is already there instead of replacing it.
  async function placeDesign(preset: any, beside = false) {
    const sources = new Map<string, LoadedModel>();
    for (const sku of new Set<string>(preset.parts.map((p: { sku: string }) => p.sku))) sources.set(sku, await loadProductModel(sku));
    const ids = new Map<string, string>();
    const existing = beside ? live.current.parts : [];
    const left = Math.min(...preset.parts.map((p: { position: number[] }) => p.position[0]), 0) - 150;
    const right = existing.reduce((x, p) => Math.max(x, worldBox(p).max.x * 1000), Number.NEGATIVE_INFINITY);
    const shiftMm = Number.isFinite(right) ? right - left + 60 : 0;
    const instances: PartInstance[] = preset.parts.map((def: { key: string; sku: string; position: number[]; rotY: number; rotX?: number }) => {
      const source = sources.get(def.sku)!;
      const id = crypto.randomUUID();
      ids.set(def.key, id);
      const position = [(def.position[0] + shiftMm) / 1000, def.position[1] / 1000, def.position[2] / 1000] as [number, number, number];
      // rotX tilts the part first, then rotY turns it about the vertical axis.
      const quaternion = new Quaternion().setFromEuler(new Euler((def.rotX ?? 0) * Math.PI / 180, def.rotY * Math.PI / 180, 0, 'YXZ')).toArray() as [number, number, number, number];
      const model = { ...source, object: clone(source.object) as LoadedModel['object'] };
      model.object.position.set(...position);
      model.object.quaternion.set(...quaternion);
      return { id, model, position, quaternion };
    });
    const nextMates = preset.mates.map((m: { moving: string; target: string; axis: number; side: number }) => ({ movingId: ids.get(m.moving)!, targetId: ids.get(m.target)!, axis: m.axis, side: m.side }));
    checkpoint();
    const allParts = beside ? [...existing, ...instances] : instances;
    const allMates = beside ? [...live.current.mates, ...nextMates] : nextMates;
    live.current = { parts: allParts, mates: allMates };
    setParts(allParts);
    setMates(allMates);
    setSelectedId(null);
    setReset(r => r + 1);
    setNotice(preset.notes?.length ? `${preset.notes.join(' ')} · see Build health` : `${preset.name} loaded · see Build health`);
  }

  async function loadPreset(preset: any = PRESET) {
    // The ref is set synchronously by run(), so it also catches an AI build that has not repainted yet.
    if (busy || building.current) return;
    setError('');
    setBusy(`Loading example ${preset.name}`);
    try {
      await placeDesign(preset);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the example');
    } finally {
      setBusy('');
    }
    return null;
  }

  async function findNodes(source: LoadedModel) {
    if (source.asset.originalFormat === 'glb') return;
    setBusy(`Finding attachment nodes for ${source.asset.name}`);
    try {
      const result = await analyzeGeometry(source);
      source.connectors = result.candidates.map(n => ({ ...n, review: 'accepted' as const }));
      source.geometryRevision = result.geometryRevision;
    } catch (e) {
      setNotice('Could not find attachment nodes: ' + (e instanceof Error ? e.message : 'analysis unavailable') + ' Start npm run geometry.');
    }
  }

  async function demo(key: string, drop?: [number, number, number]) {
    controller.current?.abort();
    controller.current = null;
    setBusy('');
    setError('');
    const cached = cache.current.get(key);
    if (cached) { place(cached, drop); return; }
    if (!fixtures.some(f => f.file === key)) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy('Opening reference model');
    try {
      const response = await fetch(`/fixtures/${key}`, { signal: abort.signal });
      if (!response.ok) throw new Error('Reference model unavailable.');
      await open(new File([await response.arrayBuffer()], key), true, abort, drop, key);
    } catch (e) {
      if (!abort.signal.aborted) { setError(e instanceof Error ? e.message : 'Could not load reference'); setBusy(''); }
    }
  }

  const [scalePercent,setScalePercent]=useState('100');
  const [turnDegrees,setTurnDegrees]=useState('90');
  const clipboard=useRef<PartInstance[]>([]);
  const selectedPart=parts.find(p=>p.id===selectedId);
  useEffect(()=>{setScalePercent(String((selectedPart?.scale??1)*100));},[selectedId,selectedPart?.scale]);
  function transform(scale?:number,axis?:'x'|'y'|'z',targetId?:string,degreesArg?:number) {
    const p=live.current.parts.find(p=>p.id===(targetId??selectedId));if(!p)return;
    if(p.model.asset.productId&&scale!==undefined){setNotice('Real products keep their true size · only custom models can be scaled.');return;}
    if(scale!==undefined&&(!Number.isFinite(scale)||scale<.001||scale>1000)){setNotice('Enter a scale from 0.1% to 100000%.');return;}
    const degrees=degreesArg??Number(turnDegrees);if(axis&&!Number.isFinite(degrees)){setNotice('Enter a valid angle.');return;}
    const q=new Quaternion(...(p.quaternion??[0,0,0,1]));
    if(axis)q.premultiply(new Quaternion().setFromAxisAngle(new Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0),degrees*Math.PI/180));
    const nextScale=scale??p.scale??1;
    const localCenter=new Vector3(...p.model.asset.bounds.min).add(new Vector3(...p.model.asset.bounds.max)).multiplyScalar(.5);
    const center=worldBox(p).getCenter(new Vector3());
    const position=center.sub(localCenter.multiplyScalar(nextScale).applyQuaternion(q)).toArray() as [number,number,number];
    checkpoint();setParts(items=>items.map(item=>item.id===p.id?{...item,scale:nextScale,quaternion:q.toArray(),position}:item));
    setMates(items=>items.filter(m=>m.movingId!==p.id&&m.targetId!==p.id));setPreview(null);
    setNotice(axis?`Rotated ${degrees}° around ${axis.toUpperCase()}`:`Resized to ${nextScale*100}% · proportions locked`);
  }
  async function generateCustomBody(body:any, deadline?:number, analyzeNodes = true):Promise<{name:string;partId:string|null}> {
    let lastError:unknown=null;
    for(let attempt=0;attempt<2;attempt++){
      try{
        setBusy('Generating a custom body');
        const response=await fetch('/geometry/custom',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(Math.max(1, deadline?remainingMs(deadline):120_000))});
        if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.detail??`Body generation failed (HTTP ${response.status})`);}
        const result=await response.json();
        const meshFormat=result.stlUrl?'stl':'step';
        const modelResponse=await fetch(result.stlUrl??result.stepUrl);
        if(!modelResponse.ok)throw new Error('Generated model download failed');
        const bytes=new Uint8Array(await modelResponse.arrayBuffer());
        // A missing file can come back as the app's own HTML page with a 200 status; fail with a clear message instead of a parser error.
        if(/^\s*<(!doctype|html)/i.test(new TextDecoder().decode(bytes.slice(0,32))))throw new Error('The generated model was not available from the server. Restart npm run dev and try again.');
        // A mesh is the finalized output for a custom primitive; older geometry services still return STEP.
        if(meshFormat==='step'&&!new TextDecoder().decode(bytes.slice(0,12)).startsWith('ISO-10303'))throw new Error('The generated file did not download correctly.');
        const partId=await open(new File([bytes],`${result.name}.${meshFormat}`),false,new AbortController(),undefined,`generated:${result.slug}`,deadline,analyzeNodes);
        if(partId&&!(body.holesX>0&&body.holesY>0))solidBoxes.current.add(partId);
        if(partId&&analyzeNodes) {
          const source=cache.current.get(`generated:${result.slug}`);
          if(source?.connectors?.length&&source.geometryRevision) {
            // Mesh analysis is output-critical; Bitdeer refines connector intent without blocking the result.
            void suggestNodes(source).then(({result:suggestions}) => {
              const reviewed=applySuggestions(source.connectors ?? [], suggestions);
              updateNodes(source, reviewed, source.geometryRevision);
            }).catch(() => {});
          }
        }
        setBusy('');
        return {name:result.name,partId:partId??null};
      }catch(e){lastError=e;setBusy('');if(attempt===0&&(!deadline||remainingMs(deadline)>2000))await new Promise(r=>setTimeout(r,1200));}
    }
    // No CAD service (the deployed site): a plain box, cylinder or sphere is still made in the browser.
    if(!(body.holesX>0&&body.holesY>0)){
      try{
        const file=await primitiveFile(body);
        const key=`generated:local-${[body.shape??'box',body.lengthMm,body.widthMm,body.heightMm,body.name??''].join('-').replace(/[^a-z0-9.-]/gi,'_')}`;
        const partId=await open(file,false,new AbortController(),undefined,key,undefined,analyzeNodes);
        if(partId){solidBoxes.current.add(partId);return {name:body.name??'Custom body',partId};}
      }catch{/* fall through to the original error */}
    }
    throw lastError;
  }
  // A small, goal-relevant catalog keeps planning fast without starving the model of structure options.
  function toPlannerPart(p:any) {
    const dims=p.dims?Object.entries(p.dims).filter(([,v])=>typeof v==='number').map(([k,v])=>`${k} ${v} mm`).join(', '):undefined;
    const price=(p.prices??p.offers??[]).find((x:any)=>typeof x?.price==='number')?.price;
    return {sku:p.sku,name:p.name,price,dims,weightG:typeof p.weight_g==='number'?p.weight_g:undefined,category:p.category};
  }
  function planCatalog(goal:string,limit=48) {
    const all=Object.values(BY_SKU) as any[];
    if(all.length<=limit)return all.map(toPlannerPart);
    const words=new Set(goal.toLowerCase().split(/[^a-z0-9.]+/).filter(w=>w.length>2));
    const score=(p:any)=>{
      const hay=`${p.sku} ${p.name} ${p.category}`.toLowerCase();
      return [...words].reduce((n,w)=>n+(hay.includes(w)?2:0),0)+(p.inStock===false?-1:0);
    };
    const selected=new Map<string,any>();
    const add=(items:any[])=>{for(const p of items)if(selected.size<limit)selected.set(p.sku,p);};
    add(all.filter(p=>words.has(p.sku.toLowerCase())||words.has(p.name.toLowerCase())));
    for(const group of ['structure','motors','wheels','electronics','servos','gears']) add(all.filter(p=>p.group===group).slice(0,5));
    add([...all].sort((a,b)=>score(b)-score(a)||a.price-b.price));
    return [...selected.values()].map(toPlannerPart);
  }
  async function applyPlan(plan:any, deadline?:number, analyzeNodes = true):Promise<{report:string;executed:number;generated:string[]}> {
    const bits:string[][]=(plan.subsystems??[]).map(()=>[]);
    let executed=0;const generated:string[]=[];const jobs:any[]=[];
    (plan.subsystems??[]).forEach((subsystem:any,subsystemIndex:number)=>{
      for(const part of subsystem.parts??[])for(let i=0;i<part.qty;i++)jobs.push({kind:'part',subsystemIndex,sku:part.sku,reason:part.reason});
      for(const body of subsystem.customBodies??[])jobs.push({kind:'body',subsystemIndex,body,reason:body.reason??'commissioned by planner'});
    });
    for(let offset=0;offset<jobs.length;offset+=4){
      const chains=new Map<string,Promise<string|null>>();
      const batch=jobs.slice(offset,offset+4).map(async job=>{
        const key=job.kind==='part'?`part:${job.sku}`:`body:${JSON.stringify(job.body)}`;
        const previous=chains.get(key)??Promise.resolve(null);
        const next=previous.then(async()=>{
          if(job.kind==='part')return generateProduct(job.sku,undefined,true,deadline,analyzeNodes);
          return (await generateCustomBody(job.body,deadline,analyzeNodes)).partId;
        });
        chains.set(key,next);
        try{return {job,partId:await next,error:null};}
        catch(error){return {job,partId:null,error};}
      });
      const batchResults=await Promise.all(batch);
      const failed=batchResults.find(r=>r.error);
      if(failed)throw failed.error;
      for(const result of batchResults){
        if(!result.partId)throw new Error('Model import failed');
        generated.push(result.partId);executed++;
        const label=result.job.kind==='part'?result.job.sku:`${result.job.body.name??'Custom body'} (custom ${result.job.body.lengthMm}×${result.job.body.widthMm}×${result.job.body.heightMm} mm)`;
        bits[result.job.subsystemIndex].push(`• ${label} — ${result.job.reason}`);
      }
    }
    const lines=(plan.subsystems??[]).map((subsystem:any,index:number)=>`${subsystem.name} — ${subsystem.purpose}\n${bits[index].join('\n')}`);
    if(plan.assumptions?.length)lines.push(`Assumptions: ${plan.assumptions.map((a:any)=>`${a.label} = ${a.value}`).join(' · ')}`);
    return {report:[plan.summary,...lines.filter(Boolean)].join('\n\n'),executed,generated};
  }
  function arrangementParts(ids:string[]) {
    return (stagedBuild.current??live.current.parts).filter(p=>ids.includes(p.id)).map(p=>{
      const size=new Vector3(...p.model.asset.bounds.max).sub(new Vector3(...p.model.asset.bounds.min)).multiplyScalar(p.scale??1);
      return {id:p.id,name:p.model.asset.name,solidBox:solidBoxes.current.has(p.id),sizeMm:{x:size.x*1000,y:size.y*1000,z:size.z*1000}};
    });
  }
  function applyArrangement(items:any[]) {
    const byId=new Map(items.map((item:any)=>[item.partId,item]));
    const source=stagedBuild.current ? [...live.current.parts,...stagedBuild.current] : live.current.parts;
    const applied=items.filter((item:any)=>source.some(p=>p.id===item.partId)).length;
    checkpoint();
    const next=source.map(item=>{
      const placement=byId.get(item.id);
      if(!placement)return item;
      const degrees=placement.rotationDegrees??{x:0,y:0,z:0};
      const quaternion=new Quaternion().setFromEuler(new Euler(
        degrees.x*Math.PI/180,degrees.y*Math.PI/180,degrees.z*Math.PI/180,'XYZ'
      ));
      const localCenter=new Vector3(...item.model.asset.bounds.min).add(new Vector3(...item.model.asset.bounds.max)).multiplyScalar(.5);
      const center=new Vector3(placement.positionMm.x/1000,placement.positionMm.y/1000,placement.positionMm.z/1000);
      const position=center.clone().sub(localCenter.clone().multiplyScalar(item.scale??1).applyQuaternion(quaternion)).toArray() as [number,number,number];
      return {...item,quaternion:quaternion.toArray(),position};
    });
    const remainingMates=live.current.mates.filter(m=>!byId.has(m.movingId)&&!byId.has(m.targetId));
    live.current={parts:next,mates:remainingMates};setParts(next);setMates(remainingMates);setPreview(null);
    return applied;
  }
  // Gemini proposes the layout; Anthropic must approve it before it reaches the scene. Three reviews is the hard limit.
  async function arrangeAndVerify(goal:string,planSummary:string,ids:string[],deadline?:number):Promise<{ok:boolean;summary?:string;issues:string[]}> {
    const parts=arrangementParts(ids);
    if(!parts.length)return {ok:false,issues:['No generated parts were available to arrange.']};
    let previous:unknown=null;
    let issues='';
    for(let review=0;review<3;review++){
      setOperation(review?'Brick is revising the arrangement':'Brick is arranging the parts');
      const proposal=deadline
        ? await raceDeadline(askArrangement({goal,summary:planSummary,parts,previous:previous??undefined,issues:issues||undefined}),deadline)
        : await askArrangement({goal,summary:planSummary,parts,previous:previous??undefined,issues:issues||undefined});
      if(!proposal){issues='Brick missed the arrangement deadline.';break;}
      setOperation(`Brick review ${review+1} of 3`);
      const invalid=layoutIssues(parts,proposal.arrangement.parts);
      if(invalid.length){issues=invalid.join(' · ');previous=proposal.arrangement;continue;}
      const verdict=deadline
        ? await raceDeadline(verifyArrangement({goal,summary:planSummary,arrangement:proposal.arrangement,parts}),deadline)
        : await verifyArrangement({goal,summary:planSummary,arrangement:proposal.arrangement,parts});
      if(!verdict){issues='The arrangement reviewer missed the build deadline.';break;}
      if(verdict.approved){
        const applied=applyArrangement(proposal.arrangement.parts);
        if(applied!==parts.length)return {ok:false,issues:['The approved arrangement no longer matched the workspace parts.']};
        return {ok:true,summary:proposal.arrangement.summary,issues:[]};
      }
      issues=verdict.issues.join(' · ');
      previous=proposal.arrangement;
    }
    return {ok:false,issues:[issues||'The verifier did not approve the arrangement.']};
  }
  // Top search bar entry point: plan the goal with Gemini, build it, and report back.
  // Runs a build and closes out the plan card with how it ended.
  async function run(goal:string):Promise<{ok:boolean;output:string;detail?:string}> {
    const result=await runBuild(goal);
    if(result.output==='A build is already running')return result;
    const card=planCardRef.current;
    if(result.ok){if(card)showPlan({...card,goal,stage:'done'});}
    else showPlan({stage:'failed',goal,summary:card?.summary,items:card?.items,message:result.detail??result.output});
    return result;
  }
  async function runBuild(goal:string):Promise<{ok:boolean;output:string;detail?:string}> {
    if(building.current)return {ok:false,output:'A build is already running'};
    building.current=true;
    try{
      const deadline=Date.now()+30_000;
      // Convex may be temporarily unreachable. Never let workspace initialization hold the build lock.
      if(cloud) await raceDeadline(cloud.mutation(api.data.open, {secret: workspaceSecret()}), subDeadline(deadline, 2_000));
      const existingOnly=/\b(arrange|rearrange|organize|position|make|build|form|stack)\b/i.test(goal)&&/\b(existing|these|current|already|workspace)\b/i.test(goal);
      if(existingOnly){
        const ids=live.current.parts.map(p=>p.id);
        const result=await arrangeAndVerify(goal,'Rearrange the existing parts without adding or removing any.',ids,deadline);
        if(!result.ok){
          const fallback=shelfArrangement(arrangementParts(ids));
          const applied=applyArrangement(fallback.parts);
          if(applied!==ids.length)throw new Error(result.issues.join(' · '));
          return {ok:true,output:`${fallback.summary} The arrangement missed its deadline, so this compact fallback was applied.`};
        }
        return {ok:true,output:result.summary??'Existing parts arranged by Brick.'};
      }
      const catalog=planCatalog(goal);
      const primitivePlan=primitiveBodyPlan(goal);
      let fastPlan=primitivePlan
        ? {match:{sku:'primitive',name:goal},plan:primitivePlan}
        : localCatalogPlan(goal,catalog);
      const hasWork=live.current.parts.length>0;
      // New parts go beside whatever is already in the workspace, never on top of it.
      const placeBeside=(placements:any[])=>{
        const right=live.current.parts.reduce((x,p)=>Math.max(x,worldBox(p).max.x*1000),Number.NEGATIVE_INFINITY);
        const offset=Number.isFinite(right)?right+60:0;
        return placements.map(p=>({...p,positionMm:{...p.positionMm,x:p.positionMm.x+offset}}));
      };
      // Builds a parts plan and lays the new parts out next to the existing ones. Models load without a time limit.
      const buildParts=async(plan:any,analyze:boolean,useAiLayout:boolean)=>{
        const expected=validatePlanCount(goal,plan);
        if(expected+live.current.parts.length>100)throw new Error('This build would exceed the workspace limit of 100 parts.');
        stagedBuild.current=[];
        setOperation('Loading the parts');
        const {report,generated}=await applyPlan(plan,undefined,analyze);
        if(generated.length!==expected)throw new Error(`Expected ${expected} models but imported ${generated.length}.`);
        if(useAiLayout){
          // Claude proposes where each part goes; a bad layout is sent back once with the problems, then the shelf takes over.
          setOperation('Brick is arranging the parts');
          const parts=arrangementParts(generated);
          let previous:unknown=null,issues='';
          for(let attempt=0;attempt<2;attempt++){
            const proposal=await raceDeadline(askClaudeArrangement({goal,summary:plan.summary??'',parts,previous:previous??undefined,issues:issues||undefined}).catch(()=>null),Date.now()+30_000);
            if(!proposal)break;
            const invalid=layoutIssues(parts,proposal.parts);
            if(!invalid.length){
              if(applyArrangement(placeBeside(proposal.parts))===generated.length)return {report,expected,layout:`Arranged by Brick: ${proposal.summary}`};
              break;
            }
            issues=invalid.join(' · ');previous=proposal.parts;
          }
        }
        const fallback=shelfArrangement(arrangementParts(generated));
        const applied=applyArrangement(placeBeside(fallback.parts));
        if(applied!==generated.length)throw new Error('The parts could not be laid out.');
        return {report,expected,layout:hasWork?'Added beside the existing build.':'Placed in a compact layout.'};
      };

      if(fastPlan){
        setOperation('Preparing exact requested parts');
        const built=await buildParts(fastPlan.plan,false,false);
        return {ok:true,output:`${built.report}\n\nPlaced ${built.expected} parts. ${built.layout}`};
      }

      // 1. Claude plans the build from the catalog. A slow or failing planner moves on to the next option; it never ends the build.
      let claudeError='';
      const planCardItems=()=>planCardRef.current?.items;
      setOperation('Brick is planning the build');
      showPlan({ stage: 'thinking', goal });
      const claude=await raceDeadline(
        askClaudePlan(goal,live.current.parts.map(p=>({name:p.model.asset.name})),planCatalog(goal,120)).catch(e=>{claudeError=unbrand(e instanceof Error?e.message:String(e));return null;}),
        Date.now()+45_000);
      if(!claude&&!claudeError)claudeError='Brick did not answer in time.';
      if(claude){
        const {spec}=claude;
        try{
          if(spec.kind==='drive'||spec.kind==='duck'){
            setOperation('Laying out verified parts');
            const design=designFromSpec({body:spec.kind,...(spec.drive??{})});
            const notes:Record<string,string>={};for(const x of spec.extras)notes[x.sku]=x.reason;
            showPlan({stage:'parts',goal,summary:spec.summary,items:itemsFromParts([...design.parts,...spec.extras.flatMap(x=>Array.from({length:x.qty},()=>({sku:x.sku})))],notes)});
            await new Promise(r=>setTimeout(r,1200));
            showPlan({stage:'building',goal,summary:spec.summary,items:planCardItems()});
            await placeDesign(design,hasWork);
            let extra='';
            if(spec.extras.length){
              const built=await buildParts({summary:spec.summary,assumptions:[],subsystems:[{name:'Extras',purpose:'Added by the planner.',parts:spec.extras,customBodies:[]}]},true,false);
              extra=`\n\nExtras: ${spec.extras.map(x=>`${x.qty}× ${BY_SKU[x.sku]?.name??x.sku}`).join(', ')}.`;
            }
            return {ok:true,output:`${spec.summary}\n\n${design.name}: ${design.parts.length} parts, every wheel or joint checked in Build health.${extra}`};
          }
          const notes:Record<string,string>={};const flat:{sku:string;qty:number}[]=[];
          for(const sub of spec.subsystems){for(const p of sub.parts){notes[p.sku]=p.reason;flat.push({sku:p.sku,qty:p.qty});}}
          const bodies:PlanItem[]=spec.subsystems.flatMap((sub:any)=>sub.customBodies.map((b:any)=>({name:`${b.name} (custom ${b.shape??'box'})`,qty:1,note:b.reason})));
          showPlan({stage:'parts',goal,summary:spec.summary,items:[...itemsFromParts(flat,notes),...bodies]});
          await new Promise(r=>setTimeout(r,1200));
          showPlan({stage:'building',goal,summary:spec.summary,items:planCardItems()});
          const built=await buildParts({summary:spec.summary,assumptions:[],subsystems:spec.subsystems},true,true);
          return {ok:true,output:`${spec.summary}\n\n${built.report}\n\nPlaced ${built.expected} parts. ${built.layout}`};
        }catch(e){claudeError=unbrand(e instanceof Error?e.message:String(e));stagedBuild.current=null;}
      }

      // 2. The cloud planner, with a short budget.
      setOperation('Trying the cloud planner');
      const cloudPlan=await raceDeadline(askPlanner(goal,live.current.parts.map(p=>({id:p.id,name:p.model.asset.name,scale:p.scale??1})),catalog),Date.now()+12_000);
      if(cloudPlan){
        try{
          const built=await buildParts(cloudPlan.plan,true,true);
          return {ok:true,output:`${cloudPlan.plan.summary}\n\n${built.report}\n\nPlaced ${built.expected} parts. ${built.layout}`};
        }catch(e){stagedBuild.current=null;}
      }

      // 3. Always return something that fits the request: a layout composed from the description, or the closest catalog parts.
      setOperation('Building from catalog rules');
      if(!hasWork||knowsHow(goal)){
        const design=compose(goal);
        showPlan({stage:'building',goal,summary:design.notes[0],items:itemsFromParts(design.parts)});
        await placeDesign(design,hasWork);
        return {ok:true,detail:'rule-based',output:`${design.notes.join(' ')}\n\nBrick could not plan this one (${claudeError}), so it was built from catalog rules.`};
      }
      // With a build already in progress, a guess would only add unrelated parts to it, so say what happened instead.
      const detail=`Brick could not plan this one (${claudeError}). Nothing was added to your build; try rephrasing or retry.`;
      setError(detail);
      return {ok:false,output:'Build not applied',detail};
    }catch(e){
      const raw=e instanceof Error?e.message:String(e);
      const detail=/quota|RESOURCE_EXHAUSTED/i.test(raw)?'Brick has reached its daily limit. Try again later.':unbrand(raw);setError(detail);
      return {ok:false,output:'Build not applied',detail};
    }finally{stagedBuild.current=null;building.current=false;setBusy('');setOperation('');}
  }

  const pendingRun=useRef<string|null>(null);
  // A goal from the home screen or top bar starts a fresh design: wait for the saved workspace to restore, then clear it
  // so the plan is not mixed into an earlier build.
  useEffect(()=>{
    if(!pendingGoal||!ready||pendingRun.current===pendingGoal)return;
    // Strict Mode can invoke this effect twice for the same object before state propagates.
    pendingRun.current=pendingGoal;
    setTimeout(()=>{if(pendingRun.current===pendingGoal)pendingRun.current=null;},750);
    onPendingGoalConsumed?.();
    checkpoint();live.current={parts:[],mates:[]};setParts([]);setMates([]);setSelectedIds([]);
    void run(pendingGoal).then(result=>onGoalResult?.(pendingGoal,result));
  },[pendingGoal,ready]);
  // A design picked or described on the home screen loads once the saved workspace has been restored.
  useEffect(()=>{if(pendingPreset&&ready){onPendingPresetConsumed?.();void loadPreset(pendingPreset);}},[pendingPreset,ready]);
  useEffect(()=>{
    if(!selectedId)return;
    const done=(e:KeyboardEvent)=>{if(e.key==='Escape')setSelectedId(null);};
    window.addEventListener('keydown',done);
    return ()=>window.removeEventListener('keydown',done);
  },[selectedId]);
  function copyPart(){
    const items=live.current.parts.filter(p=>selectedIds.includes(p.id));
    if(!items.length)return;
    clipboard.current=items.map(p=>({...p,position:[...p.position] as [number,number,number],quaternion:[...(p.quaternion??[0,0,0,1])] as [number,number,number,number]}));
    setNotice(items.length>1?`${items.length} models copied · Ctrl/Cmd+V to paste`:'Model copied · Ctrl/Cmd+V to paste');
  }
  function pastePart(){
    const items=clipboard.current;if(!items.length)return;
    const box=new Box3();items.forEach(p=>box.union(worldBox(p)));
    const shift=box.getSize(new Vector3()).x+.01;
    const copies=items.map(p=>({...p,id:crypto.randomUUID(),model:{...p.model,object:clone(p.model.object) as LoadedModel['object']},position:[p.position[0]+shift,p.position[1],p.position[2]] as [number,number,number]}));
    checkpoint();setParts(existing=>[...existing,...copies]);setSelectedIds(copies.map(p=>p.id));clipboard.current=copies;
    setNotice(copies.length>1?`${copies.length} models pasted together`:'Model pasted · scale and rotation preserved');
  }
  function cutPart(){if(!selectedId)return;copyPart();remove();setNotice('Model cut · Ctrl/Cmd+V to paste');}
  const shortcuts=useRef({copyPart,pastePart,cutPart,undo});shortcuts.current={copyPart,pastePart,cutPart,undo};
  useEffect(()=>{const key=(e:KeyboardEvent)=>{const target=e.target as HTMLElement;if(target.closest('input,textarea,select,[contenteditable="true"]')||!(e.ctrlKey||e.metaKey)||e.altKey||e.repeat)return;if(window.getSelection()?.toString())return;if(e.key.toLowerCase()==='c'){if(live.current.parts.length){e.preventDefault();shortcuts.current.copyPart();}}if(e.key.toLowerCase()==='x'){if(live.current.parts.length){e.preventDefault();shortcuts.current.cutPart();}}if(e.key.toLowerCase()==='z'&&!e.shiftKey){e.preventDefault();shortcuts.current.undo();return;}if(e.key.toLowerCase()==='v'&&clipboard.current){e.preventDefault();shortcuts.current.pastePart();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);

  function move(id: string, position: [number, number, number], snap: Snap | null, quaternion?: [number, number, number, number]) {
    checkpoint();
    setParts(p => p.map(item => item.id === id ? { ...item, position, quaternion: snap?.quaternion ?? quaternion ?? item.quaternion } : item));
    setMates(m => [...m.filter(c => c.movingId !== id && c.targetId !== id), ...(snap ? [{ movingId: id, targetId: snap.targetId, movingNodeId: snap.movingNodeId, targetNodeId: snap.targetNodeId }] : [])]);
    setNotice(snap ? 'Clicked in' : 'Part moved · drag it near another part to click it in');
  }

  function connectNodes(fromId: string, fromNode: string, toId: string, toNode: string) {
    const from = parts.find(p => p.id === fromId);
    const to = parts.find(p => p.id === toId);
    const a = from?.model.connectors?.find(n => n.id === fromNode);
    const b = to?.model.connectors?.find(n => n.id === toNode);
    if (!from || !to || !a || !b || fromId === toId) return;
    if (a.review === 'rejected' || b.review === 'rejected' || a.geometryRevision !== from.model.geometryRevision || b.geometryRevision !== to.model.geometryRevision) return;
    const acceptedA = { ...a, review: 'accepted' as const };
    const acceptedB = { ...b, review: 'accepted' as const };
    if (!compatible(acceptedA, acceptedB,from.scale??1,to.scale??1)) { setNotice('Choose matching node types and hole diameters.'); return; }
    checkpoint();
    const snap = alignConnectors(from, acceptedA, to, acceptedB);
    const reviewed = (source: LoadedModel) => ({ ...source, connectors: source.connectors?.map(n => (source.asset.id === from.model.asset.id && n.id === a.id) || (source.asset.id === to.model.asset.id && n.id === b.id) ? { ...n, review: 'accepted' as const } : n) });
    for (const [key, source] of cache.current) cache.current.set(key, reviewed(source));
    setParts(items => items.map(p => ({ ...p, model: reviewed(p.model), ...(p.id === fromId ? { position: snap.position, quaternion: snap.quaternion } : {}) })));
    setMates(items => [...items.filter(m => m.movingId !== fromId && m.targetId !== fromId), { movingId: fromId, targetId: toId, movingNodeId: a.id, targetNodeId: b.id }]);
    setSelectedId(fromId);
    setPreview(null);
    setNotice(`Connected ${a.id} → ${b.id} · nodes approved and aligned`);
  }

  function applyPairSuggestions(pairs: PairSuggestion['pairs']) {
    const marks = new Map<string, Map<string, string>>();
    const partners = new Map<string, { partId: string; nodeId: string }>();
    const mark = (part: PartInstance, node: Connector, counterpart: PartInstance, counterpartNode: Connector, reason: string) => {
      let byNode = marks.get(part.model.asset.id);
      if (!byNode) { byNode = new Map(); marks.set(part.model.asset.id, byNode); }
      byNode.set(node.id, `${reason} · pairs with ${counterpart.model.asset.name} ${counterpartNode.id}`.slice(0, 600));
      partners.set(`${part.id}:${node.id}`, { partId: counterpart.id, nodeId: counterpartNode.id });
    };
    for (const pair of pairs) {
      const moving = live.current.parts.find(p => p.id === pair.movingPartId);
      const target = live.current.parts.find(p => p.id === pair.targetPartId);
      const a = moving?.model.connectors?.find(n => n.id === pair.movingNodeId);
      const b = target?.model.connectors?.find(n => n.id === pair.targetNodeId);
      if (!moving || !target || !a || !b || a.review === 'rejected' || b.review === 'rejected' || a.geometryRevision !== moving.model.geometryRevision || b.geometryRevision !== target.model.geometryRevision) continue;
      if (!compatible({ ...a, review: 'accepted' }, { ...b, review: 'accepted' },moving.scale??1,target.scale??1)) continue;
      mark(moving, a, target, b, pair.reason);
      mark(target, b, moving, a, pair.reason);
    }
    pairPartners.current = partners;
    if (!marks.size) return;
    const reviewed = (source: LoadedModel) => {
      const byNode = marks.get(source.asset.id);
      if (!byNode) return source;
      return { ...source, connectors: source.connectors?.map(n => {
        const reason = byNode.get(n.id);
        if (reason !== undefined) return { ...n, aiSelected: true, aiReason: reason };
        if (n.aiSelected || n.aiReason !== undefined) { const { aiSelected, aiReason, ...rest } = n; return rest as Connector; }
        return n;
      }) };
    };
    for (const [key, source] of cache.current) cache.current.set(key, reviewed(source));
    setParts(items => items.map(p => ({ ...p, model: reviewed(p.model) })));
  }

  function runPairing() {
    if (!cloud || building.current) return;
    const eligible = parts.filter(p => p.model.connectors?.length && p.model.geometryRevision);
    if (eligible.length < 2) return;
    // Bitdeer accepts at most 128 total nodes. Prefer holes and already-reviewed nodes, then cap the payload.
    const budget = Math.max(2, Math.floor(128 / eligible.length));
    const reviewable = eligible.map(part => {
      const nodes = [...(part.model.connectors ?? [])].sort((a, b) => {
        const accepted = Number(a.review === 'accepted') - Number(b.review === 'accepted');
        const kind = Number(a.kind === 'hole') - Number(b.kind === 'hole');
        const area = (b.areaM2 ?? 0) - (a.areaM2 ?? 0);
        return accepted || kind || area;
      }).slice(0, budget);
      return {...part, model: {...part.model, connectors: nodes}};
    });
    if (pairingBusy.current) { pairingPending.current = true; return; }
    pairingBusy.current = true;
    const requested = pairingKeyRef.current;
    void (async () => {
      try {
        const result = await suggestPairings(reviewable);
        if (pairingKeyRef.current === requested) applyPairSuggestions(result.result ?? []);
      } catch { /* Background pairing stays silent when it fails. */ }
      finally {
        pairingBusy.current = false;
        if (pairingPending.current) { pairingPending.current = false; runPairingRef.current(); }
      }
    })();
  }
  runPairingRef.current = runPairing;

  function connectFromButton(partId: string, nodeId: string) {
    const armed = bridge.current?.armed?.() ?? true;
    const partner = armed ? undefined : pairPartners.current.get(`${partId}:${nodeId}`);
    const target = partner ? live.current.parts.find(p => p.id === partner.partId && p.id !== partId) : undefined;
    const node = target?.model.connectors?.find(n => n.id === partner!.nodeId);
    if (partner && target && node && node.review !== 'rejected') { connectNodes(partId, nodeId, partner.partId, partner.nodeId); return; }
    bridge.current?.chooseNode(partId, nodeId);
  }

  function remove() {
    if (!selectedIds.length) return;
    const doomed = new Set(selectedIds);
    checkpoint();
    setParts(p => p.filter(i => !doomed.has(i.id)));
    setMates(m => m.filter(c => !doomed.has(c.movingId) && !doomed.has(c.targetId)));
    setSelectedIds([]);
    setNotice(doomed.size > 1 ? `${doomed.size} parts removed` : 'Part removed');
  }

  // Moving or turning a selected group: connections inside the group stay, connections to outside parts are released.
  function moveMany(moves: { id: string; position: [number, number, number]; quaternion?: [number, number, number, number] }[]) {
    const ids = new Set(moves.map(m => m.id));
    checkpoint();
    setParts(p => p.map(item => { const m = moves.find(x => x.id === item.id); return m ? { ...item, position: m.position, quaternion: m.quaternion ?? item.quaternion } : item; }));
    setMates(m => m.filter(c => ids.has(c.movingId) === ids.has(c.targetId)));
    setPreview(null);
    setNotice(`${moves.length} parts moved together`);
  }

  function undo() {
    const last = history.at(-1);
    if (!last) return;
    setParts(last.parts);
    setMates(last.mates);
    setHistory(h => h.slice(0, -1));
    setSelectedId(null);
    setPreview(null);
    setNotice('Last change undone');
  }

  const dimensions = model ? model.asset.bounds.max.map((v, i) => (v - model.asset.bounds.min[i]) * 1000 * (selectedPart?.scale??1)) : null;
  const filteredFixtures = fixtures.filter(f => `${f.name} ${f.tag}`.toLowerCase().includes(filter.toLowerCase()));
  const filteredLibrary = library.filter(item => item.name.toLowerCase().includes(filter.toLowerCase()));
  function startStatusDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    statusDrag.current = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: statusOffset};
    setStatusDragging(true);
    event.preventDefault();
  }
  function dragStatus(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = statusDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const halfWidth = event.currentTarget.offsetWidth / 2;
    const halfHeight = event.currentTarget.offsetHeight / 2;
    const maxX = window.innerWidth / 2 - halfWidth - 8;
    const maxY = window.innerHeight / 2 - halfHeight - 8;
    setStatusOffset({
      x: Math.min(maxX, Math.max(-maxX, drag.origin.x + event.clientX - drag.x)),
      y: Math.min(maxY, Math.max(-maxY, drag.origin.y + event.clientY - drag.y)),
    });
  }
  function endStatusDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (statusDrag.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    statusDrag.current = null;
    setStatusDragging(false);
  }
  const statusDragProps = {
    onPointerDown: startStatusDrag,
    onPointerMove: dragStatus,
    onPointerUp: endStatusDrag,
    onPointerCancel: endStatusDrag,
    style: {transform: `translate(calc(-50% + ${statusOffset.x}px), calc(-50% + ${statusOffset.y}px))`},
  };

  return (
    <section
      className={`cad-stage${dragging ? ' dragging' : ''}`}
      aria-busy={!!operation || !!busy}
      aria-label="3D model workspace"
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragging(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        const point = bridge.current?.dropPoint(e.clientX, e.clientY);
        const sku = e.dataTransfer.getData('application/x-buildflow-catalog') || e.dataTransfer.getData('text/plain');
        const key = e.dataTransfer.getData('application/x-buildflow-model');
        if (sku && BY_SKU[sku] && !BY_SKU[sku].custom) void generateProduct(sku, point);
        else if (key) void demo(key, point);
        else if (e.dataTransfer.files[0]) void open(e.dataTransfer.files[0], false, undefined, point);
      }}
    >
      <div className="cad-canvas">
        <ViewerBoundary>
          <Viewer
            parts={parts}
            selectedId={selectedId}
            view={view}
            reset={reset}
            wireframe={wireframe}
            measure={measure}
            unit={unit}
            snapEnabled={snapEnabled}
            mates={mates}
            onSelect={setSelectedId}
            selectedIds={selectedIds}
            onSelectMany={setSelectedIds}
            onMoveMany={moveMany}
            boxSelect={boxSelect}
            align={alignOn}
            onConnect={connectNodes}
            onNodeMessage={setNotice}
            onMove={move}
            onPreview={setPreview}
            bridge={bridge}
          />
        </ViewerBoundary>
      </div>

      {selectedId && <aside className="cad-keys" aria-label="Keyboard controls for the selected part">
        <strong>{selectedIds.length > 1 ? `${selectedIds.length} parts selected` : 'Selected part'}</strong>
        {selectedIds.length > 1 && <div><span>Drag a part</span>Moves the group</div>}
        {selectedIds.length > 1 && <div><span><kbd>Shift</kbd>click</span>Add or remove</div>}
        <div><span><kbd>A</kbd><kbd>D</kbd></span>{selectedIds.length > 1 ? 'Turn group 30°' : 'Turn 30°'}</div>
        <div><span><kbd>W</kbd><kbd>S</kbd></span>{selectedIds.length > 1 ? 'Tip group 30°' : 'Tip 30°'}</div>
        {selectedIds.length <= 1 && <div><span>Drag arrows</span>Slide along an axis</div>}
        <div><span><kbd>{navigator.platform.includes('Mac')?'⌘':'Ctrl'}</kbd><kbd>C</kbd></span>Copy</div>
        <div><span><kbd>{navigator.platform.includes('Mac')?'⌘':'Ctrl'}</kbd><kbd>X</kbd></span>Cut</div>
        <div><span><kbd>{navigator.platform.includes('Mac')?'⌘':'Ctrl'}</kbd><kbd>V</kbd></span>Paste</div>
        <div><span><kbd>Esc</kbd></span>Deselect</div>
      </aside>}

      <div className="cad-toolbar">
        <div className="cad-viewbar" aria-label="Camera views">
          {(['Perspective', 'Front', 'Top', 'Side'] as View[]).map(v => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => { setView(v); setReset(r => r + 1); }}>{v}</button>
          ))}
          <span />
          <button title="Fit model in view" onClick={() => setReset(r => r + 1)}>Reset</button>
          <button aria-pressed={wireframe} className={wireframe ? 'active' : ''} onClick={() => setWireframe(v => !v)}>Wireframe</button>
          <span />
          <button aria-pressed={boxSelect} className={boxSelect ? 'active' : ''} title="Drag a box around parts to select several (or hold Shift and drag)" onClick={() => setBoxSelect(v => !v)}>Box select</button>
          <button aria-pressed={alignOn} className={alignOn ? 'active' : ''} title="Line parts up with their neighbours while you drag" onClick={() => setAlignOn(v => !v)}>Align</button>
        </div>
        <div className="cad-builds">
          <button className="pillbtn" type="button" aria-expanded={buildsOpen} onClick={() => setBuildsOpen(o => !o)}>Saved builds {builds.length}/{MAX_SAVED_BUILDS}</button>
          {buildsOpen && <div className="cad-builds-panel" role="dialog" aria-label="Saved builds">
            <form onSubmit={e => { e.preventDefault(); void saveBuild(); }}>
              <input value={buildName} maxLength={60} placeholder="Name this build" aria-label="Build name" onChange={e => setBuildName(e.target.value)} />
              <button type="submit" disabled={!parts.length || !!busy || builds.length >= MAX_SAVED_BUILDS}>Save current</button>
            </form>
            {builds.length >= MAX_SAVED_BUILDS && <p className="cad-builds-note">Five builds saved. Delete one to save another.</p>}
            {!builds.length && <p className="cad-builds-note">Nothing saved yet. Saved builds stay in this browser after a reload.</p>}
            <ul>
              {builds.map(b => (
                <li key={b.id}>
                  <button type="button" className="open" disabled={!!busy} onClick={() => void openBuild(b.id)} title="Open this build">
                    <b>{b.name}</b><span>{b.partCount} parts · {new Date(b.savedAt).toLocaleDateString()}</span>
                  </button>
                  <button type="button" className="del" aria-label={`Delete ${b.name}`} title="Delete" onClick={() => void deleteBuild(b.id)}>×</button>
                </li>
              ))}
            </ul>
          </div>}
        </div>
        <div className="cad-measure" role="group" aria-label="Measurement guide">
          <button className="pillbtn" type="button" aria-pressed={measure} onClick={() => onMeasure?.(!measure)}>Measure</button>
          {measure && <div className="unitswitch">
            {['mm', 'in'].map(u => <button key={u} type="button" aria-pressed={unit === u} onClick={() => onUnit?.(u)}>{u}</button>)}
          </div>}
        </div>

      </div>

      <div className="cad-actions">
        <button disabled={!model || !!busy} onClick={()=>{copyPart();pastePart();}}>+ Duplicate</button>
        <button disabled={!model||!!busy} onClick={copyPart}>Copy</button><button disabled={!!busy} onClick={pastePart}>Paste</button>
        {selectedPart&&!selectedPart.model.asset.productId&&<div className="cad-transform-controls"><label>Scale % <input aria-label="Uniform scale percent" type="number" min="0.1" max="100000" step="any" value={scalePercent} onChange={e=>setScalePercent(e.target.value)}/></label><button disabled={!!busy} onClick={()=>transform(Number(scalePercent)/100)}>Apply scale</button><label>Rotate ° <input aria-label="Rotation angle degrees" type="number" value={turnDegrees} onChange={e=>setTurnDegrees(e.target.value)}/></label>{(['x','y','z'] as const).map(axis=><button disabled={!!busy} key={axis} onClick={()=>transform(undefined,axis)}>Rotate {axis.toUpperCase()}</button>)}</div>}
        <button disabled={!model || !!busy} onClick={remove}>Remove</button>
        <button disabled={!history.length || !!busy} onClick={undo}>Undo</button>
        <span className={preview ? 'cad-snap-message ready' : 'cad-snap-message'} role="status">{preview ? 'Nodes aligned' : notice}</span>
      </div>

      {!parts.length && !busy && !operation && (
        <div className="cad-empty-prompt">
          <span className="cad-empty-icon">↥</span>
          <strong>A space for your hardware.</strong>
          <p>Drop a STEP, STL, or GLB model here<br />or drag a product from Parts.</p>
          <button className="cad-primary" onClick={() => input.current?.click()}>Upload model</button>

        </div>
      )}

      {busy && (
        <div className={`cad-import-status${statusDragging ? ' dragging' : ''}`} role="status" {...statusDragProps}>
          <span className="cad-spinner" />
          <strong>{busy}</strong>
          <small>Preparing geometry · original scale preserved</small>
          <button onClick={() => { controller.current?.abort(); controller.current = null; setBusy(''); }}>Cancel import</button>
        </div>
      )}

      {operation && !busy && (
        <div className={`cad-import-status${statusDragging ? ' dragging' : ''}`} role="status" {...statusDragProps}>
          <span className="cad-spinner" />
          <strong>{operation}</strong>
          <small>Planning can take up to two minutes · keep this tab open</small>
        </div>
      )}

      {dragging && <div className="cad-drop-overlay">Drop to add a part</div>}
      {planCard && <aside className="cad-plan" aria-label="Brick's plan" data-stage={planCard.stage}>
        <header>
          <b>Brick</b>
          <button type="button" aria-label="Close" onClick={() => showPlan(null)}>×</button>
        </header>
        <ol className="cad-plan-steps">
          {(['thinking', 'parts', 'building', 'done'] as const).map((step, i) => {
            const order = ['thinking', 'parts', 'building', 'done'];
            const at = planCard.stage === 'failed' ? 0 : order.indexOf(planCard.stage);
            return <li key={step} className={i < at ? 'past' : i === at ? 'now' : ''}>{['Reading your request', 'Choosing parts', 'Building', 'Done'][i]}</li>;
          })}
        </ol>
        <p className="cad-plan-goal">“{planCard.goal}”</p>
        {planCard.summary && <p className="cad-plan-summary">{planCard.summary}</p>}
        {!!planCard.items?.length && <ul className="cad-plan-parts">
          {planCard.items.map((item, i) => <li key={i}><span>{item.qty}×</span> {item.name}{item.note && <small>{item.note}</small>}</li>)}
        </ul>}
        {planCard.stage === 'failed' && <p className="cad-plan-error">{planCard.message}</p>}
      </aside>}
      {error && <div className="cad-error" role="alert"><strong>Action could not finish</strong><p>{error}</p><button onClick={() => setError('')}>Dismiss</button></div>}

      {designsHost && createPortal(
        <div className="cad-designs" aria-label="My Designs library and inspector">
          <div className="cad-drawer-head">
            <div>
              <span className="cad-eyebrow">CAD WORKSPACE</span>
              <h3>My Designs</h3>
              <small>{cloudStatus}</small>
            </div>
          </div>
          <div className="cad-drawer-scroll">
            <div className="cad-controls">
              <label className="cad-search">
                <span>⌕</span>
                <input aria-label="Search models" placeholder="Search models" value={filter} onChange={e => setFilter(e.target.value)} />
              </label>
              <button className="cad-upload" onClick={() => input.current?.click()}>+ Import a model<span>STEP / STL / GLB</span></button>
              <div className="cad-cloud">
                <button disabled={!ready || !!operation || !!busy} onClick={() => void save()}>Save</button>
                <button disabled={!!operation || !!busy} onClick={() => void restore()}>Reload saved</button>
              </div>
              {operation && <p className="cad-status" role="status">{operation}…</p>}
            </div>

            <div className="cad-models">
              {filteredFixtures.map(f => (
                <button
                  className={`cad-model-card ${model?.asset.name === f.file ? 'selected' : ''}`}
                  key={f.file}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData('application/x-buildflow-model', f.file); e.dataTransfer.effectAllowed = 'copy'; }}
                  onDragEnd={() => setDragging(false)}
                  title="Drag into workspace or click to add"
                  onClick={() => void demo(f.file)}
                >
                  <span className="cad-model-thumb">{f.icon}</span>
                  <span className="cad-model-body">
                    <span className="cad-model-title">{f.name}<small>{f.tag}</small></span>
                    <span className="cad-model-subtitle">{f.subtitle}</span>
                  </span>
                </button>
              ))}
              {filteredLibrary.map(item => (
                <button
                  className={`cad-model-card uploaded${model?.asset.name === item.name ? ' selected' : ''}`}
                  key={item.key}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData('application/x-buildflow-model', item.key); e.dataTransfer.effectAllowed = 'copy'; }}
                  onDragEnd={() => setDragging(false)}
                  onClick={() => void demo(item.key)}
                >
                  <span className="cad-model-thumb">{item.generated ? '✦' : '◇'}</span>
                  <span className="cad-model-body">
                    <span className="cad-model-title">{item.name}</span>
                    <span className="cad-model-subtitle">{item.generated ? 'Generated · drag or click to reuse' : 'Uploaded · drag or click to reuse'}</span>
                  </span>
                </button>
              ))}
              {!filteredFixtures.length && !filteredLibrary.length && <p className="cad-muted">No matching models.</p>}
            </div>

            {model && (
              <div className="cad-details">
                <div className="cad-section-label">MODEL INSPECTOR</div>
                <h4>{model.asset.name}</h4>
                <section className="cad-node-panel">
                  <h5>Attachment nodes</h5>
                  <button disabled={!!operation} onClick={() => void analyze()}>Find geometry nodes</button>
                  <button disabled={!!operation || !model.connectors?.length} onClick={() => void recommend()}>Recommend with Brick</button>
                  <p>Click a dot, then a matching dot on another part to approve and connect that pair. Green nodes also snap while dragging. Amber nodes are suggestions.</p>
                  {model.connectors?.map(node => (
                    <div className="cad-node-row" key={node.id}>
                      <strong>{node.id} · {node.label}</strong>
                      <button disabled={node.review === 'rejected'} onClick={() => selectedId && connectFromButton(selectedId, node.id)}>Connect using {node.id}</button>
                      <small>{node.aiSelected ? 'Brick recommended · ' : ''}{node.kind}{node.diameterM ? ` · Ø${(node.diameterM * 1000 * (selectedPart?.scale??1)).toFixed(2)} mm` : ''}</small>
                      <p>{node.aiReason ?? node.reason}</p>
                      <select
                        aria-label={`Review ${node.id}`}
                        value={node.review}
                        onChange={e => updateNodes(model, model.connectors!.map(n => n.id === node.id ? { ...n, review: e.target.value as Connector['review'] } : n))}
                      >
                        <option value="suggested">Suggested</option>
                        <option value="accepted">Accept for snapping</option>
                        <option value="rejected">Reject</option>
                      </select>
                    </div>
                  ))}
                </section>
                <dl>
                  <div><dt>Bounds · X / Y / Z</dt><dd>{dimensions?.map(n => n.toFixed(2)).join(' × ')} mm</dd></div>
                  <div><dt>Triangles</dt><dd>{model.triangles.toLocaleString()}</dd></div>
                  <div><dt>Scene units</dt><dd>Meters</dd></div>
                  <div><dt>Scale</dt><dd>{model.asset.originalFormat === 'stl' ? 'Assumed mm' : 'From file format'}</dd></div>
                </dl>
                <p className="cad-note">Snaps align accepted attachment nodes and opposing normals. Hole diameters must match within tolerance. Clearance and mechanical fit still need review.</p>
              </div>
            )}
          </div>
        </div>, designsHost
      )}

      <input ref={input} type="file" accept=".step,.stp,.stl,.glb" hidden onChange={e => { if (e.target.files?.[0]) void open(e.target.files[0]); e.target.value = ''; }} />
      <div className="cad-bottom">
        <span><i className="cad-status-dot" />{parts.length ? `${parts.length} parts · ${mates.length} snaps` : 'Ready to assemble'}</span>
        <span>Drag a part to move it <b>·</b> Select a part, then <b>A/D</b> turn it <b>·</b> <b>W/S</b> tip it <b>·</b> Shift skips snapping</span>
      </div>
    </section>
  );
}
