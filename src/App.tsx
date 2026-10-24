import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Viewer, type View, type ViewerBridge } from './components/Viewer';
import { loadModel, type LoadedModel } from './cad/import';
import { disposeModel } from './cad/geometry';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { addPosition, findSnap, alignConnectors, compatible, type PartInstance, type Mate, type Snap } from './assembly/snapping';
import './style.css';
import {analyzeGeometry} from './cad/analyze';
import {applySuggestions, type Connector} from './contracts/connectors';
import {cloud, api, workspaceSecret, saveWorkspace, suggestNodes} from './cloud/client';
class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="webgl-error">The viewer could not render this model. Try another file or reload.</div> : this.props.children; }
}
const fixtures = [
  { name: 'Precision plate', file: 'plate.step', subtitle: '100 × 60 × 6 mm · four Ø8 mm holes', tag: 'STEP', icon: '▱' },
  { name: 'Two-body assembly', file: 'assembly.step', subtitle: 'Offset + 90° rotation · placement check', tag: 'STEP', icon: '▧' },
  { name: 'GLB reference', file: 'reference.glb', subtitle: '100 × 60 × 6 mm · meter-scale mesh', tag: 'GLB', icon: '◇' },
];
export default function App() {
  const [parts, setParts] = useState<PartInstance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mates, setMates] = useState<Mate[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [preview, setPreview] = useState<Snap | null>(null);
  const [notice, setNotice] = useState('Drag a library model into the workspace.');
  const [library, setLibrary] = useState<{key:string; name:string; file:File}[]>([]);
  const [history, setHistory] = useState<{parts:PartInstance[]; mates:Mate[]}[]>([]);
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const [view, setView] = useState<View>('Perspective'); const [reset, setReset] = useState(0);
  const [wireframe, setWireframe] = useState(false); const [filter, setFilter] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null); const controller = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, LoadedModel>());
  const bridge = useRef<ViewerBridge | null>(null);
  const live = useRef({parts,mates}); live.current = {parts,mates};
  const model = parts.find(p => p.id === selectedId)?.model ?? null;
  useEffect(() => () => { controller.current?.abort(); cache.current.forEach(m => disposeModel(m.object)); }, []);
  const [operation,setOperation]=useState('');
  const [revision,setRevision]=useState(0);
  const [cloudStatus,setCloudStatus]=useState('Loading saved workspace…');
  const [ready,setReady]=useState(false);
  async function restore(){
    if(!cloud){setCloudStatus('Local only');setReady(true);return;}
    setOperation('Loading workspace');
    try{
      const secret=workspaceSecret(); await cloud.mutation(api.data.open,{secret});
      const saved=await cloud.query(api.data.get,{secret});
      if(saved?.snapshot){
        const sources=new Map<string,LoadedModel>();const entries=[];
        for(const record of saved.snapshot.sources){
          const response=await fetch(record.url);if(!response.ok)throw new Error('Saved model download failed');
          const file=new File([await response.arrayBuffer()],record.asset.name);
          const source=await loadModel(file,new AbortController().signal,record.asset.sourceKind==='test_fixture');
          Object.assign(source,{asset:record.asset,storageId:record.storageId,connectors:record.connectors,geometryRevision:record.geometryRevision});
          sources.set(record.sourceId,source);cache.current.set(record.sourceId,source);
          if(record.asset.sourceKind==='test_fixture')cache.current.set(file.name,source);
          else entries.push({key:record.sourceId,name:file.name,file});
        }
        setParts(saved.snapshot.parts.map((p:PartInstance & {sourceId:string})=>({...p,model:{...sources.get(p.sourceId)!,object:clone(sources.get(p.sourceId)!.object) as LoadedModel['object']}})));
        setMates(saved.snapshot.mates);setLibrary(entries);setSelectedId(null);setHistory([]);
      }
      setRevision(saved?.revision??0);setCloudStatus('Convex connected · save to sync');
    }catch(e){setError(e instanceof Error?e.message:'Restore failed');setCloudStatus('Restore failed');}
    finally{setReady(true);setOperation('');}
  }
  useEffect(()=>{void restore();},[]);
  async function save(){setOperation('Saving workspace');try{setRevision(await saveWorkspace(parts,mates,cache.current,revision));setCloudStatus('Saved to Convex');}catch(e){setError(String(e));}finally{setOperation('');}}
  function updateNodes(source:LoadedModel,nodes:Connector[],geometryRevision=source.geometryRevision){
    for(const cached of cache.current.values())if(cached.asset.id===source.asset.id)Object.assign(cached,{connectors:nodes,geometryRevision});
    setParts(items=>items.map(p=>p.model.asset.id===source.asset.id?{...p,model:{...p.model,connectors:nodes,geometryRevision}}:p));
    setMates(items=>items.filter(m=>!parts.some(p=>p.model.asset.id===source.asset.id&&(p.id===m.movingId||p.id===m.targetId))));
  }
  async function analyze(){if(!model)return;setOperation('Finding attachment nodes');setError('');try{
    const source=[...cache.current.values()].find(m=>m.asset.id===model.asset.id)!;
    const result=await analyzeGeometry(source);updateNodes(source,result.candidates,result.geometryRevision);setNotice('Review the proposed nodes before snapping.');
  }catch(e){setError(String(e));}finally{setOperation('');}}
  async function recommend(){if(!model)return;setOperation('Bitdeer is reviewing nodes');setError('');try{
    const result=await suggestNodes(model);updateNodes(model,applySuggestions(model.connectors??[],result.result));setNotice(`Bitdeer suggestions ready · ${result.model}`);
  }catch(e){setError(String(e));}finally{setOperation('');}}
  function checkpoint() { setHistory(h => [...h.slice(-19), live.current]); }
  function place(source: LoadedModel, drop?: [number,number,number]) {
    const existing = live.current.parts;
    const instance: PartInstance = { id: crypto.randomUUID(), model: {...source, object:clone(source.object) as LoadedModel['object']}, position: addPosition(source,existing,drop) };
    const snap = snapEnabled && drop ? findSnap(instance,instance.position,existing) : null;
    if(snap) {instance.position = snap.position;instance.quaternion=snap.quaternion;}
    instance.model.object.position.set(...instance.position);
    checkpoint(); setParts([...existing,instance]); setSelectedId(instance.id);
    if(snap) setMates(m => [...m,{movingId:instance.id,targetId:snap.targetId,movingNodeId:snap.movingNodeId,targetNodeId:snap.targetNodeId}]);
    setNotice(snap ? 'Snapped · attachment nodes aligned' : 'Part added. Drag it near another part to snap.');
  }
  async function open(file: File, fixture = false, ownController?: AbortController, drop?: [number,number,number], key?:string) {
    if (!ownController) controller.current?.abort();
    const abort = ownController ?? new AbortController(); controller.current = abort;
    setError(''); setBusy(`Importing ${file.name}`);
    try {
      const next = await loadModel(file, abort.signal, fixture);
      if (abort.signal.aborted) { disposeModel(next.object); return; }
      const sourceKey = key ?? next.asset.id;
      cache.current.set(sourceKey,next);
      if(!fixture) setLibrary(l => [...l,{key:sourceKey,name:file.name,file}]);
      place(next,drop);
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Import failed.'); }
    finally { if (controller.current === abort) { setBusy(''); controller.current = null; } }
  }
  async function demo(key: string, drop?: [number,number,number]) {
    controller.current?.abort(); controller.current = null; setBusy(''); setError('');
    const cached = cache.current.get(key); if(cached) { place(cached,drop); return; }
    if(!fixtures.some(f => f.file === key)) return;
    const abort = new AbortController(); controller.current = abort; setBusy('Opening reference model');
    try {
      const response = await fetch(`/fixtures/${key}`, { signal: abort.signal });
      if (!response.ok) throw new Error('Reference model unavailable.');
      await open(new File([await response.arrayBuffer()], key), true, abort, drop,key);
    } catch (e) { if (!abort.signal.aborted) { setError(e instanceof Error ? e.message : 'Could not load reference'); setBusy(''); } }
  }
  function move(id:string, position:[number,number,number], snap:Snap|null) {
    checkpoint(); setParts(p => p.map(item => item.id === id ? {...item,position,quaternion:snap?.quaternion??item.quaternion} : item));
    setMates(m => [...m.filter(c => c.movingId !== id && c.targetId !== id), ...(snap ? [{movingId:id,targetId:snap.targetId,movingNodeId:snap.movingNodeId,targetNodeId:snap.targetNodeId}] : [])]);
    setNotice(snap ? 'Snapped · attachment nodes aligned' : 'Part moved · drag near an accepted node to snap');
  }
  function connectNodes(fromId:string,fromNode:string,toId:string,toNode:string) {
    const from=parts.find(p=>p.id===fromId),to=parts.find(p=>p.id===toId);
    const a=from?.model.connectors?.find(n=>n.id===fromNode),b=to?.model.connectors?.find(n=>n.id===toNode);
    if(!from||!to||!a||!b||fromId===toId)return;
    if(a.review==='rejected'||b.review==='rejected'||a.geometryRevision!==from.model.geometryRevision||b.geometryRevision!==to.model.geometryRevision)return;
    const acceptedA={...a,review:'accepted' as const},acceptedB={...b,review:'accepted' as const};
    if(!compatible(acceptedA,acceptedB)){setNotice('Choose matching node types and hole diameters.');return;}
    checkpoint();
    const snap=alignConnectors(from,acceptedA,to,acceptedB);
    const reviewed=(source:LoadedModel)=>({...source,connectors:source.connectors?.map(n=>(source.asset.id===from.model.asset.id&&n.id===a.id)||(source.asset.id===to.model.asset.id&&n.id===b.id)?{...n,review:'accepted' as const}:n)});
    for(const [key,source] of cache.current)cache.current.set(key,reviewed(source));
    setParts(items=>items.map(p=>({...p,model:reviewed(p.model),...(p.id===fromId?{position:snap.position,quaternion:snap.quaternion}:{})})));
    setMates(items=>[...items.filter(m=>m.movingId!==fromId&&m.targetId!==fromId),{movingId:fromId,targetId:toId,movingNodeId:a.id,targetNodeId:b.id}]);
    setSelectedId(fromId);setPreview(null);setNotice(`Connected ${a.id} → ${b.id} · nodes approved and aligned`);
  }
  function remove() { if(!selectedId)return; checkpoint(); setParts(p => p.filter(i => i.id !== selectedId)); setMates(m => m.filter(c => c.movingId !== selectedId && c.targetId !== selectedId));setSelectedId(null);setNotice('Part removed'); }
  function undo() { const last = history.at(-1); if(!last)return;setParts(last.parts);setMates(last.mates);setHistory(h => h.slice(0,-1));setSelectedId(null);setPreview(null);setNotice('Last change undone'); }
  const dimensions = model ? model.asset.bounds.max.map((v, i) => (v - model.asset.bounds.min[i]) * 1000) : null;
  return <main aria-busy={!!operation}>
    <header className="topbar"><a className="brand" href="/" aria-label="BuildFlow home"><span className="brand-mark">▧</span> buildflow<span className="brand-dot">.</span></a><span className="project-name">Hardware workspace <span>/</span> Untitled project</span><span className="local-pill"><i/> {cloudStatus}</span></header>
    <div className="workspace" style={operation?{pointerEvents:'none',opacity:.85}:undefined}>
      <section className={`stage ${dragging ? 'dragging' : ''}`} aria-label="3D model workspace" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); const point = bridge.current?.dropPoint(e.clientX,e.clientY); const key = e.dataTransfer.getData('application/x-buildflow-model'); if(key) void demo(key,point); else if (e.dataTransfer.files[0]) void open(e.dataTransfer.files[0],false,undefined,point); }}>
        <div className="starfield"/>
        <div className="stage-heading"><div className="eyebrow">DESIGN BEFORE YOU BUILD</div><h1>Your next build,<br/>in perspective.</h1><p>Bring your hardware into view.</p></div>
        <div className="canvas"><ViewerBoundary><Viewer parts={parts} selectedId={selectedId} view={view} reset={reset} wireframe={wireframe} snapEnabled={snapEnabled} onSelect={setSelectedId} onConnect={connectNodes} onNodeMessage={setNotice} onMove={move} onPreview={setPreview} bridge={bridge}/></ViewerBoundary></div>
        <div className="assembly-tools"><button aria-pressed={snapEnabled} className={snapEnabled ? 'active' : ''} onClick={() => setSnapEnabled(v => !v)}>⊞ Snap {snapEnabled ? 'on' : 'off'}</button><button disabled={!model || !!busy} onClick={() => model && place(model)}>＋ Duplicate</button><button disabled={!model || !!busy} onClick={remove}>Remove</button><button disabled={!history.length || !!busy} onClick={undo}>↶ Undo</button><span className={preview ? 'snap-message ready' : 'snap-message'} role="status">{preview ? 'Release to snap · nodes aligned' : notice}</span></div>
        <div className="viewbar" aria-label="Camera views">{(['Perspective', 'Front', 'Top', 'Side'] as View[]).map(v => <button key={v} className={view === v ? 'active' : ''} onClick={() => { setView(v); setReset(r => r + 1); }}>{v}</button>)}<span/><button title="Fit model in view" onClick={() => setReset(r => r + 1)}>↺ Reset</button><button aria-pressed={wireframe} onClick={() => setWireframe(v => !v)} className={wireframe ? 'active' : ''}>Wireframe</button></div>
        {!parts.length && !busy && <div className="empty-prompt"><span className="empty-icon">↥</span><strong>A space for your hardware.</strong><p>Drop a STEP or GLB model here<br/>or drag in a model from the library.</p><button className="primary" onClick={() => input.current?.click()}>Upload model <span>↗</span></button></div>}
        {busy && <div className="import-status" role="status"><span className="spinner"/><strong>{busy}</strong><small>Preparing geometry · original scale preserved</small><button onClick={() => { controller.current?.abort(); controller.current = null; setBusy(''); }}>Cancel import</button></div>}
        {dragging && <div className="drop-overlay">Drop to add a part</div>}
        <div className="stage-bottom"><span><i className="status-dot"/>{parts.length ? `${parts.length} parts · ${mates.length} snaps` : 'Ready to assemble'}</span><span>Drag part to move <b>·</b> Drag background to orbit <b>·</b> Shift bypasses snap</span></div>
      </section>
      <aside>
        <div className="cloud-controls"><button disabled={!ready||!!operation||!!busy} onClick={()=>void save()}>Save workspace</button><button disabled={!!operation||!!busy} onClick={()=>void restore()}>Reload saved</button></div>{operation&&<p role="status">{operation}…</p>}<div className="panel-heading"><div><div className="eyebrow">YOUR WORKBENCH</div><h2>Model library</h2></div><span className="count">{fixtures.length + library.length}</span></div>
        <label className="search"><span>⌕</span><input aria-label="Search reference models" placeholder="Search models" value={filter} onChange={e => setFilter(e.target.value)}/></label>
        <button className="upload" onClick={() => input.current?.click()}>＋ Import a model <span>STEP / GLB</span></button>
        <input ref={input} type="file" accept=".step,.stp,.glb" hidden onChange={e => { if (e.target.files?.[0]) void open(e.target.files[0]); e.target.value = ''; }}/>
        {error && <div className="error" role="alert"><strong>Action could not finish</strong><p>{error}</p><button onClick={() => setError('')}>Dismiss</button></div>}
        <div className="section-label">MODEL SOURCES <span>DRAG TO ADD</span></div>
        <div className="models">{fixtures.filter(f => `${f.name} ${f.tag}`.toLowerCase().includes(filter.toLowerCase())).map(f => <button className={`model-card ${model?.asset.name === f.file ? 'selected' : ''}`} key={f.file} draggable onDragStart={e => { e.dataTransfer.setData('application/x-buildflow-model',f.file); e.dataTransfer.effectAllowed = 'copy'; }} onDragEnd={() => setDragging(false)} title="Drag into workspace or click to add" onClick={() => void demo(f.file)}><span className="model-thumb">{f.icon}</span><span className="model-card-body"><span className="model-title">{f.name}<small>{f.tag}</small></span><span className="model-subtitle">{f.subtitle}</span></span><span className="model-arrow">↗</span></button>)}{!fixtures.some(f => `${f.name} ${f.tag}`.toLowerCase().includes(filter.toLowerCase())) && <p className="muted">No matching reference models.</p>}</div>
        {library.filter(item => item.name.toLowerCase().includes(filter.toLowerCase())).map(item => <button key={item.key} className="model-card uploaded-card" draggable onDragStart={e => {e.dataTransfer.setData('application/x-buildflow-model',item.key);e.dataTransfer.effectAllowed='copy';}} onDragEnd={() => setDragging(false)} onClick={() => void demo(item.key)}><span className="model-thumb">◇</span><span className="model-card-body"><span className="model-title">{item.name}</span><span className="model-subtitle">Uploaded · drag or click to add another</span></span><span>＋</span></button>)}
        {!!parts.length && <div className="assembly-list"><div className="section-label">IN WORKSPACE <span>{parts.length} PARTS</span></div>{parts.map((p,i) => <button className={p.id === selectedId ? 'active' : ''} key={p.id} onClick={() => setSelectedId(p.id)}><span>{String(i+1).padStart(2,'0')}</span>{p.model.asset.name}<small>{mates.some(m => m.movingId===p.id || m.targetId===p.id) ? 'SNAPPED' : 'FREE'}</small></button>)}</div>}
        {model ? <div className="details"><div className="section-label">MODEL INSPECTOR</div><h3>{model.asset.name}</h3><section className="node-panel"><h4>Attachment nodes</h4><button disabled={!!operation} onClick={()=>void analyze()}>Find geometry nodes</button><button disabled={!!operation||!model.connectors?.length} onClick={()=>void recommend()}>Recommend with Bitdeer</button><p>Click a dot, then a matching dot on another part to approve and connect that pair. Green nodes also snap while dragging. Amber nodes are suggestions.</p>{model.connectors?.map(node=><div className="node-row" key={node.id}><strong>{node.id} · {node.label}</strong><button disabled={node.review==='rejected'} onClick={()=>selectedId&&bridge.current?.chooseNode(selectedId,node.id)}>Connect using {node.id}</button><small>{node.aiSelected?'Bitdeer recommended · ':''}{node.kind}{node.diameterM?` · Ø${(node.diameterM*1000).toFixed(2)} mm`:''}</small><p>{node.aiReason??node.reason}</p><select aria-label={`Review ${node.id}`} value={node.review} onChange={e=>updateNodes(model,model.connectors!.map(n=>n.id===node.id?{...n,review:e.target.value as Connector['review']}:n))}><option value="suggested">Suggested</option><option value="accepted">Accept for snapping</option><option value="rejected">Reject</option></select></div>)}</section><span className="badge">{model.asset.sourceKind === 'test_fixture' ? 'Synthetic reference fixture' : 'Uploaded model'}</span><dl><div><dt>Bounds · X / Y / Z</dt><dd data-testid="bounds">{dimensions?.map(n => n.toFixed(2)).join(' × ')} mm</dd></div><div><dt>Triangles</dt><dd>{model.triangles.toLocaleString()}</dd></div><div><dt>Scene units</dt><dd>Meters</dd></div><div><dt>Scale</dt><dd>From file format</dd></div></dl><p className="detail-note">Snaps align accepted attachment nodes and opposing normals. Hole diameters must match within tolerance. Clearance and mechanical fit still need review. Moving a part detaches its snap.</p><p className="detail-note">{model.asset.originalFormat === 'glb' ? 'Mesh geometry. Dimensions reflect the file, not independent verification.' : 'STEP units resolved by OpenCascade. Curved surfaces are meshed at a requested 0.02 mm deflection.'}</p><button className="text-button" onClick={() => { const url = URL.createObjectURL(model.original); const a = document.createElement('a'); a.href = url; a.download = model.original.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>↓ Download original</button></div> : <div className="getting-started"><span>01 — START WITH GEOMETRY</span><h3>Real scale.<br/>A clearer perspective.</h3><p>Inspect a CAD model from every angle. Reference parts let you check the import pipeline before bringing in your own.</p></div>}
        <div className="panel-footer"><span className="footer-icon">◇</span><p>Product discovery and image-to-3D<br/>will join this workspace next.</p></div>
      </aside>
    </div>
  </main>;
}
