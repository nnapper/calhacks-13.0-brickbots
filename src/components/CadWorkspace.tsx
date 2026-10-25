import {validatePlanCount, layoutIssues} from '../assembly/ai-validation';
import {Euler,Quaternion,Vector3} from 'three';
import {worldBox} from '../assembly/snapping';
import { createPortal } from 'react-dom';
import { Component, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Viewer, type View, type ViewerBridge } from './Viewer';
import { loadModel, type LoadedModel } from '../cad/import';
import { disposeModel } from '../cad/geometry';
import { placeholderFile } from '../cad/placeholder';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { addPosition, findSnap, alignConnectors, compatible, type PartInstance, type Mate, type Snap } from '../assembly/snapping';
import { BY_SKU } from '../lib/catalog.js';
import { PRESET } from '../lib/preset.js';
import { analyzeGeometry } from '../cad/analyze';
import { applySuggestions, type Connector, type PairSuggestion } from '../contracts/connectors';
import { cloud, api, workspaceSecret, saveWorkspace, suggestNodes, suggestPairings, askPlanner, askArrangement, verifyArrangement, verifyPlan } from '../cloud/client';
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

export default function CadWorkspace({designsHost, onWorkspaceChange, actionsRef, pendingGoal, onPendingGoalConsumed, unit='mm', onUnit, measure=true, onMeasure}: {designsHost: HTMLElement | null; onWorkspaceChange?: (state: {parts:PartInstance[];mates:Mate[];selectedId:string|null})=>void; actionsRef?: {current:any}; pendingGoal?: string|null; onPendingGoalConsumed?: () => void; unit?: string; onUnit?: (unit: string)=>void; measure?: boolean; onMeasure?: (on: boolean)=>void}) {
  const solidBoxes=useRef(new Set<string>());
  const stagedBuild=useRef<PartInstance[]|null>(null);
  const building=useRef(false);
  const [parts, setParts] = useState<PartInstance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  useEffect(()=>{onWorkspaceChange?.({parts,mates,selectedId});},[parts,mates,selectedId,onWorkspaceChange]);
  if(actionsRef)actionsRef.current={add:generateProduct,select:setSelectedId,remove:(id:string)=>{checkpoint();setParts(items=>items.filter(p=>p.id!==id));setMates(items=>items.filter(m=>m.movingId!==id&&m.targetId!==id));setSelectedId(current=>current===id?null:current);},run};
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

  // First visit with nothing saved: start from the example rover so the workspace is never an empty grid.
  useEffect(() => {
    void restore().then(restored => {
      let seen = false;
      try { seen = !!localStorage.getItem('brickbots.example-seen'); } catch { /* storage unavailable */ }
      if (restored || seen) return;
      try { localStorage.setItem('brickbots.example-seen', '1'); } catch { /* storage unavailable */ }
      void loadPreset();
    });
  }, []);

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
    setOperation('Bitdeer is reviewing nodes');
    setError('');
    try {
      const result = await suggestNodes(model);
      updateNodes(model, applySuggestions(model.connectors ?? [], result.result));
      setNotice(`Bitdeer suggestions ready · ${result.model}`);
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

  async function open(file: File, fixture = false, ownController?: AbortController, drop?: [number, number, number], key?: string) {
    if (!ownController) controller.current?.abort();
    const abort = ownController ?? new AbortController();
    controller.current = abort;
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
      await findNodes(next);
      return place(next, drop);
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      if (controller.current === abort) { setBusy(''); controller.current = null; }
    }
  }

  async function generateProduct(sku: string, drop?: [number, number, number]):Promise<string|null> {
    if (busy) return null;
    const cachedSource = [...cache.current.values()].find(source => source.asset.productId === sku);
    if (cachedSource) { const id=place(cachedSource, drop); setNotice('Generated CAD prototype reused · inspect before assembly'); return id; }
    setError('');
    setBusy('Generating');
    try {
      const response = await fetch('/geometry/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail ?? `Generation failed (HTTP ${response.status})`);
      }
      const result = await response.json();
      const modelResponse = await fetch(result.stepUrl);
      if (!modelResponse.ok) throw new Error('Generated model download failed');
      const partId=await open(new File([await modelResponse.arrayBuffer()], `${result.name}.step`), false, new AbortController(), drop, `generated:${sku}`);
      setNotice('Generated CAD prototype added to model library · inspect before assembly');
      return partId ?? null;
    } catch (e) {
      // No generated model for this part: stand in with its category shape so it still counts in the build.
      try {
        const product = BY_SKU[sku];
        if (!product) throw e;
        const partId = await open(await placeholderFile(product), false, new AbortController(), drop, `placeholder:${sku}`);
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
    const file = new File([await modelResponse.arrayBuffer()], `${result.name}.step`);
    const next = await loadModel(file, new AbortController().signal, false);
    next.asset.productId = sku;
    cache.current.set(`generated:${sku}`, next);
    setLibrary(l => [...l, { key: `generated:${sku}`, name: file.name, file, generated: true }]);
    await findNodes(next);
    return next;
  }

  // Replaces the workspace with the example rover (Undo brings the previous build back).
  async function loadPreset() {
    if (busy) return;
    setError('');
    setBusy(`Loading example ${PRESET.name}`);
    try {
      const sources = new Map<string, LoadedModel>();
      for (const sku of new Set<string>(PRESET.parts.map((p: { sku: string }) => p.sku))) sources.set(sku, await loadProductModel(sku));
      const ids = new Map<string, string>();
      const instances: PartInstance[] = PRESET.parts.map((def: { key: string; sku: string; position: number[]; rotY: number }) => {
        const source = sources.get(def.sku)!;
        const id = crypto.randomUUID();
        ids.set(def.key, id);
        const position = def.position.map(v => v / 1000) as [number, number, number];
        const quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), def.rotY * Math.PI / 180).toArray() as [number, number, number, number];
        const model = { ...source, object: clone(source.object) as LoadedModel['object'] };
        model.object.position.set(...position);
        model.object.quaternion.set(...quaternion);
        return { id, model, position, quaternion };
      });
      checkpoint();
      setParts(instances);
      setMates(PRESET.mates.map((m: { moving: string; target: string; axis: number; side: number }) => ({ movingId: ids.get(m.moving)!, targetId: ids.get(m.target)!, axis: m.axis, side: m.side })));
      setSelectedId(null);
      setReset(r => r + 1);
      setNotice(`Example ${PRESET.name} loaded · each motor shaft fits its wheel bore · see Build health`);
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
  const clipboard=useRef<PartInstance|null>(null);
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
  async function generateCustomBody(body:any):Promise<{name:string;partId:string|null}> {
    let lastError:unknown=null;
    for(let attempt=0;attempt<2;attempt++){
      try{
        setBusy('Generating a custom body');
        const response=await fetch('/geometry/custom',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120_000)});
        if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.detail??`Body generation failed (HTTP ${response.status})`);}
        const result=await response.json();
        const modelResponse=await fetch(result.stepUrl);
        if(!modelResponse.ok)throw new Error('Generated model download failed');
        const bytes=new Uint8Array(await modelResponse.arrayBuffer());
        // A HTML error page or truncated download would surface as a cryptic parse error; catch it here instead.
        if(!new TextDecoder().decode(bytes.slice(0,12)).startsWith('ISO-10303'))throw new Error('The generated file did not download correctly.');
        const partId=await open(new File([bytes],`${result.name}.step`),false,new AbortController(),undefined,`generated:${result.slug}`);
        if(partId&&!(body.holesX>0&&body.holesY>0))solidBoxes.current.add(partId);
        setBusy('');
        return {name:result.name,partId:partId??null};
      }catch(e){lastError=e;setBusy('');if(attempt===0)await new Promise(r=>setTimeout(r,1200));}
    }
    throw lastError;
  }
  // Gemini planner: decompose a vague goal into subsystems with assumed specs, then execute the plan.
  function planCatalog() {
    return Object.values(BY_SKU).slice(0,120).map((p:any)=>{
      const dims=p.dimensions_mm?Object.entries(p.dimensions_mm).filter(([,v])=>typeof v==='number').map(([k,v])=>`${k} ${v} mm`).join(', '):undefined;
      const price=(p.prices??[]).find((x:any)=>typeof x?.price==='number')?.price;
      return {sku:p.sku,name:p.name,price,dims,weightG:typeof p.weight_g==='number'?p.weight_g:undefined,category:p.category};
    });
  }
  async function applyPlan(plan:any):Promise<{report:string;executed:number;generated:string[]}> {
    const lines:string[]=[];let actions=0;let executed=0;const generated:string[]=[];
    for(const subsystem of plan.subsystems??[]){
      const bits:string[]=[];
      for(const part of subsystem.parts??[]){
        for(let i=0;i<part.qty;i++,actions++){
          try{const partId=await generateProduct(part.sku);if(!partId)throw new Error('Model import failed');generated.push(partId);executed++;bits.push(`• ${part.sku} — ${part.reason}`);}
          catch(e){throw new Error(`${part.sku}: ${e instanceof Error?e.message:String(e)}`);}
        }
      }
      for(const body of subsystem.customBodies??[]){

        try{const bodyPart=await generateCustomBody(body);if(!bodyPart.partId)throw new Error('Custom model import failed');generated.push(bodyPart.partId);executed++;bits.push(`• ${bodyPart.name} (custom ${body.lengthMm}×${body.widthMm}×${body.heightMm} mm) — ${body.reason??'commissioned by planner'}`);}
        catch(e){throw new Error(`Custom body: ${e instanceof Error?e.message:String(e)}`);}
        actions++;
      }
      lines.push(`${subsystem.name} — ${subsystem.purpose}\n${bits.join('\n')}`);
    }
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
  async function arrangeAndVerify(goal:string,planSummary:string,ids:string[]):Promise<{ok:boolean;summary?:string;issues:string[]}> {
    const parts=arrangementParts(ids);
    if(!parts.length)return {ok:false,issues:['No generated parts were available to arrange.']};
    let previous:unknown=null;
    let issues='';
    for(let review=0;review<3;review++){
      setOperation(review?'Gemini is revising the arrangement':'Gemini is arranging the parts');
      const proposal=await askArrangement({goal,summary:planSummary,parts,previous:previous??undefined,issues:issues||undefined});
      setOperation(`Anthropic review ${review+1} of 3`);
      const invalid=layoutIssues(parts,proposal.arrangement.parts);
      if(invalid.length){issues=invalid.join(' · ');previous=proposal.arrangement;continue;}
      const verdict=await verifyArrangement({goal,summary:planSummary,arrangement:proposal.arrangement,parts});
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
  async function run(goal:string):Promise<{ok:boolean;output:string;detail?:string}> {
    if(building.current)return {ok:false,output:'A build is already running'};
    building.current=true;
    try{
      const existingOnly=/\b(arrange|rearrange|organize|position|make|build|form|stack)\b/i.test(goal)&&/\b(existing|these|current|already|workspace)\b/i.test(goal);
      if(existingOnly){
        const result=await arrangeAndVerify(goal,'Rearrange the existing parts without adding or removing any.',live.current.parts.map(p=>p.id));
        if(!result.ok)throw new Error(result.issues.join(' · '));
        return {ok:true,output:result.summary??'Existing parts arranged and reviewed by Anthropic.'};
      }
      setOperation('Gemini is planning the requested inventory');
      const plan=await askPlanner(goal,live.current.parts.map(p=>({id:p.id,name:p.model.asset.name,scale:p.scale??1})),planCatalog());
      const expected=validatePlanCount(goal,plan.plan);
      if(expected+live.current.parts.length>100)throw new Error('This build would exceed the workspace limit of 100 parts.');
      setOperation('Anthropic is checking quantities and design intent');
      const review=await verifyPlan(goal,plan.plan);
      if(!review.approved)throw new Error(`Inventory review rejected: ${review.issues.join(' · ')}`);
      stagedBuild.current=[];
      setOperation(`Preparing ${expected} parts before arrangement`);
      const {report,generated}=await applyPlan(plan.plan);
      if(generated.length!==expected)throw new Error(`Expected ${expected} models but imported ${generated.length}.`);
      const arrangement=await arrangeAndVerify(goal,plan.plan.summary,generated);
      if(!arrangement.ok)throw new Error(`Arrangement not approved: ${arrangement.issues.join(' · ')}`);
      return {ok:true,output:`${report}\n\nPlaced ${expected} parts. Gemini arrangement reviewed by Anthropic: ${arrangement.summary??''}`};
    }catch(e){
      const raw=e instanceof Error?e.message:String(e);
      const detail=/quota|RESOURCE_EXHAUSTED/i.test(raw)?'Gemini has reached its daily quota. Enable billing or wait for reset.':raw;setError(detail);
      return {ok:false,output:'Build not applied',detail};
    }finally{stagedBuild.current=null;building.current=false;setBusy('');setOperation('');}
  }

  useEffect(()=>{if(pendingGoal){onPendingGoalConsumed?.();void run(pendingGoal);}},[pendingGoal]);
  useEffect(()=>{
    if(!selectedId)return;
    const done=(e:KeyboardEvent)=>{if(e.key==='Escape')setSelectedId(null);};
    window.addEventListener('keydown',done);
    return ()=>window.removeEventListener('keydown',done);
  },[selectedId]);
  function copyPart(){const p=live.current.parts.find(p=>p.id===selectedId);if(p){clipboard.current={...p,position:[...p.position],quaternion:[...(p.quaternion??[0,0,0,1])]};setNotice('Model copied · Ctrl/Cmd+V to paste');}}
  function pastePart(){const p=clipboard.current;if(!p)return;const width=worldBox(p).getSize(new Vector3()).x;const instance={...p,id:crypto.randomUUID(),model:{...p.model,object:clone(p.model.object) as LoadedModel['object']},position:[p.position[0]+width+.01,p.position[1],p.position[2]] as [number,number,number]};checkpoint();setParts(items=>[...items,instance]);setSelectedId(instance.id);clipboard.current=instance;setNotice('Model pasted · scale and rotation preserved');}
  function cutPart(){if(!selectedId)return;copyPart();remove();setNotice('Model cut · Ctrl/Cmd+V to paste');}
  const shortcuts=useRef({copyPart,pastePart,cutPart});shortcuts.current={copyPart,pastePart,cutPart};
  useEffect(()=>{const key=(e:KeyboardEvent)=>{const target=e.target as HTMLElement;if(target.closest('input,textarea,select,[contenteditable="true"]')||!(e.ctrlKey||e.metaKey)||e.altKey||e.repeat)return;if(window.getSelection()?.toString())return;if(e.key.toLowerCase()==='c'){if(live.current.parts.length){e.preventDefault();shortcuts.current.copyPart();}}if(e.key.toLowerCase()==='x'){if(live.current.parts.length){e.preventDefault();shortcuts.current.cutPart();}}if(e.key.toLowerCase()==='v'&&clipboard.current){e.preventDefault();shortcuts.current.pastePart();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);

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
    if (!selectedId) return;
    checkpoint();
    setParts(p => p.filter(i => i.id !== selectedId));
    setMates(m => m.filter(c => c.movingId !== selectedId && c.targetId !== selectedId));
    setSelectedId(null);
    setNotice('Part removed');
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
            onConnect={connectNodes}
            onNodeMessage={setNotice}
            onMove={move}
            onPreview={setPreview}
            bridge={bridge}
          />
        </ViewerBoundary>
      </div>

      {selectedId && <aside className="cad-keys" aria-label="Keyboard controls for the selected part">
        <strong>Selected part</strong>
        <div><span><kbd>A</kbd><kbd>D</kbd></span>Turn 30°</div>
        <div><span><kbd>W</kbd><kbd>S</kbd></span>Tip 30°</div>
        <div><span>Drag arrows</span>Slide along an axis</div>
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
          <button title="Load the example 4-wheel-drive rover" disabled={!!busy} onClick={() => void loadPreset()}>Example</button>
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

      {!parts.length && !busy && (
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
                  <button disabled={!!operation || !model.connectors?.length} onClick={() => void recommend()}>Recommend with Bitdeer</button>
                  <p>Click a dot, then a matching dot on another part to approve and connect that pair. Green nodes also snap while dragging. Amber nodes are suggestions.</p>
                  {model.connectors?.map(node => (
                    <div className="cad-node-row" key={node.id}>
                      <strong>{node.id} · {node.label}</strong>
                      <button disabled={node.review === 'rejected'} onClick={() => selectedId && connectFromButton(selectedId, node.id)}>Connect using {node.id}</button>
                      <small>{node.aiSelected ? 'Bitdeer recommended · ' : ''}{node.kind}{node.diameterM ? ` · Ø${(node.diameterM * 1000 * (selectedPart?.scale??1)).toFixed(2)} mm` : ''}</small>
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
