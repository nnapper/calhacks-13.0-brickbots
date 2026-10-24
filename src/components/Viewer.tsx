import { Canvas, useThree, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Grid, Box, Html } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { findSnap, compatible, worldBox, localBox, type PartInstance, type Snap } from '../assembly/snapping';
export type View = 'Perspective' | 'Front' | 'Top' | 'Side';
export type ViewerBridge = { chooseNode:(partId:string,nodeId:string)=>void; dropPoint: (x: number, y: number) => [number, number, number] | undefined };
type Props = { parts: PartInstance[]; selectedId: string | null; view: View; reset: number; wireframe: boolean; snapEnabled: boolean; onConnect:(fromId:string,fromNode:string,toId:string,toNode:string)=>void; onNodeMessage:(message:string)=>void; onSelect: (id: string | null) => void; onMove: (id: string, position: [number, number, number], snap: Snap | null) => void; onPreview: (snap: Snap | null) => void; bridge: React.RefObject<ViewerBridge | null> };
function NodeMarkers({part,children}:{part:PartInstance;children:React.ReactNode}) {
 const group=useRef<THREE.Group>(null);
 useFrame(()=>{if(group.current){group.current.position.copy(part.model.object.position);group.current.quaternion.copy(part.model.object.quaternion);}});
 return <group ref={group} position={part.position} quaternion={part.quaternion??[0,0,0,1]}>{children}</group>;
}
function Scene(props: Props) {
  const { parts, selectedId, view, reset, wireframe, snapEnabled, onSelect, onMove, onPreview, bridge } = props;
  const { camera, size, invalidate, gl } = useThree();
  const [armed,setArmed]=useState<{partId:string;nodeId:string}|null>(null);
  useEffect(()=>{if(armed&&!parts.some(p=>p.id===armed.partId&&p.model.connectors?.some(n=>n.id===armed.nodeId&&n.review!=='rejected')))setArmed(null);},[parts,armed]);
  function chooseNode(part:PartInstance,nodeId:string){
    if(!armed||armed.partId===part.id){
      if(armed?.partId===part.id&&armed.nodeId===nodeId){setArmed(null);props.onNodeMessage('Connection selection cancelled');return;}
      setArmed({partId:part.id,nodeId});onSelect(part.id);props.onNodeMessage(`${nodeId} selected · click a matching node on another part (Escape cancels)`);return;
    }
    const from=parts.find(p=>p.id===armed.partId),a=from?.model.connectors?.find(n=>n.id===armed.nodeId),b=part.model.connectors?.find(n=>n.id===nodeId);
    if(!a||!b||a.geometryRevision!==from?.model.geometryRevision||b.geometryRevision!==part.model.geometryRevision){setArmed(null);return;}
    if(!compatible({...a,review:'accepted'},{...b,review:'accepted'})){props.onNodeMessage('These nodes differ in type or hole diameter. Choose another dot.');return;}
    props.onConnect(armed.partId,armed.nodeId,part.id,nodeId);setArmed(null);
  }
  const controls = useRef<OrbitControlsImpl>(null);
  const drag = useRef<{ id: string; plane: THREE.Plane; offset: THREE.Vector3; start: [number,number,number]; snap: Snap | null; pointerId: number; target: {releasePointerCapture:(id:number)=>void} } | null>(null);
  const latest = useRef(props); latest.current = props;
  const selection = useRef<THREE.Group>(null);
  // Fit only on add/remove, explicit view changes, reset, and resize; never during a drag.
  const ids = parts.map(p => p.id).join(',');
  const bounds = useMemo(() => {
    const box = new THREE.Box3(); parts.forEach(p => box.union(worldBox(p)));
    if (box.isEmpty()) box.set(new THREE.Vector3(-.05, 0, -.05), new THREE.Vector3(.05, .05, .05));
    return { box, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };
    // Position updates should not reframe the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, reset, view]);
  const span = Math.max(...bounds.size.toArray(), .001);
  const selected = parts.find(p => p.id === selectedId);
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const radius = Math.max(bounds.size.length() / 2, .00001);
    const angle = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * size.width / size.height));
    const directions = { Perspective: [1, .75, 1], Front: [0, 0, 1], Top: [0, 1, .0001], Side: [1, 0, 0] };
    camera.up.set(0, 1, 0);
    camera.position.copy(bounds.center).add(new THREE.Vector3(...directions[view]).normalize().multiplyScalar(radius / Math.sin(angle) * 1.3));
    camera.near = radius / 1000; camera.far = radius * 1000; camera.updateProjectionMatrix();
    controls.current?.target.copy(bounds.center); controls.current?.update(); invalidate();
  }, [bounds, view, reset, camera, size.width, size.height, invalidate]);
  useEffect(() => {
    parts.forEach(p => p.model.object.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if ('wireframe' in m) m.wireframe = wireframe; }); })); invalidate();
  }, [parts, wireframe, invalidate]);
  useEffect(() => {
    bridge.current = { chooseNode:(partId,nodeId)=>{const part=parts.find(p=>p.id===partId);if(part)chooseNode(part,nodeId);}, dropPoint: (x, y) => {
      const rect = gl.domElement.getBoundingClientRect(); const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera);
      const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      return point && point.distanceTo(bounds.center) < span * 20 ? point.toArray() : undefined;
    }};
    return () => { bridge.current = null; };
  }, [bridge, camera, gl, bounds, span, parts, armed]);
  function end(cancel = false) {
    const active = drag.current; if (!active) return;
    drag.current = null;
    if (controls.current) controls.current.enabled = true;
    try { active.target.releasePointerCapture(active.pointerId); } catch { /* capture already released */ }
    const p = latest.current.parts.find(p => p.id === active.id);
    if (p) {
      if (cancel) { p.model.object.position.set(...active.start); p.model.object.quaternion.set(...(p.quaternion??[0,0,0,1])); selection.current?.position.set(...active.start); }
      else if (p.model.object.position.distanceTo(new THREE.Vector3(...active.start)) > 1e-9 || active.snap) latest.current.onMove(p.id, p.model.object.position.toArray(), active.snap);
    }
    latest.current.onPreview(null); gl.domElement.style.cursor = ''; invalidate();
  }
  useEffect(() => {
    const cancel = () => end(true);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') {cancel();setArmed(null);latest.current.onNodeMessage('Connection selection cancelled');} };
    window.addEventListener('blur', cancel); window.addEventListener('keydown', key);
    gl.domElement.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key); gl.domElement.removeEventListener('pointercancel', cancel); if (controls.current) controls.current.enabled = true; };
  }, [gl]);
  function down(e: ThreeEvent<PointerEvent>, p: PartInstance) {
    if (e.button !== 0) return;
    e.stopPropagation(); onSelect(p.id);
    const normal = camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, e.point);
    const target = e.target as unknown as {setPointerCapture:(id:number)=>void; releasePointerCapture:(id:number)=>void};
    target.setPointerCapture(e.pointerId);
    drag.current = { id: p.id, plane, offset: p.model.object.position.clone().sub(e.point), start: [...p.position], snap: null, pointerId: e.pointerId, target };
    if (controls.current) controls.current.enabled = false;
    gl.domElement.style.cursor = 'grabbing';
  }
  function move(e: ThreeEvent<PointerEvent>) {
    const active = drag.current; if (!active) return; e.stopPropagation();
    const p = parts.find(p => p.id === active.id); if (!p) return;
    const point = e.ray.intersectPlane(active.plane, new THREE.Vector3()); if (!point) return;
    const raw = point.add(active.offset).toArray();
    const snap = snapEnabled && !e.shiftKey ? findSnap(p, raw, parts) : null;
    p.model.object.position.set(...(snap?.position ?? raw));
    p.model.object.quaternion.set(...(snap?.quaternion??p.quaternion??[0,0,0,1]));
    active.snap = snap;
    if (selection.current) selection.current.position.copy(p.model.object.position);
    if(selection.current)selection.current.quaternion.copy(p.model.object.quaternion);
    onPreview(snap); invalidate();
  }
  const selectedBox = selected ? localBox(selected) : null;
  const cell = 10 ** Math.floor(Math.log10(span / 5));
  return <>
    <ambientLight intensity={1.3}/><hemisphereLight args={['#edf5ff','#55535b',1.5]}/><directionalLight position={[3,5,4]} intensity={3}/><directionalLight position={[-3,1,-2]} intensity={2}/>
    {parts.map(p => <primitive key={p.id} object={p.model.object} position={p.position} quaternion={p.quaternion??[0,0,0,1]} dispose={null} onPointerDown={(e:ThreeEvent<PointerEvent>) => down(e,p)} onPointerMove={move} onPointerUp={(e:ThreeEvent<PointerEvent>) => { if (drag.current) { e.stopPropagation(); end(); } }} />)}
    {selected && selectedBox && <group ref={selection} position={selected.position} quaternion={selected.quaternion??[0,0,0,1]}><Box args={selectedBox.getSize(new THREE.Vector3()).multiplyScalar(1.012).toArray()} position={selectedBox.getCenter(new THREE.Vector3())} raycast={() => {}}><meshBasicMaterial color="#c5e7a8" wireframe transparent opacity={.55} depthTest={false}/></Box></group>}
    {parts.map(p=><NodeMarkers key={`nodes-${p.id}`} part={p}>{p.model.connectors?.filter(n=>n.review!=='rejected').map(n=><mesh key={n.id} position={n.position} onPointerDown={(e:ThreeEvent<PointerEvent>)=>{e.stopPropagation();}} onPointerUp={(e:ThreeEvent<PointerEvent>)=>{e.stopPropagation();}} onClick={(e:ThreeEvent<MouseEvent>)=>{e.stopPropagation();chooseNode(p,n.id);}}><sphereGeometry args={[Math.max(.001,Math.min(.003,span*.014)),12,8]}/><meshBasicMaterial color={armed?.partId===p.id&&armed.nodeId===n.id?'#65d9ff':n.review==='accepted'?'#b5ef8d':'#ffc66d'} depthTest={false}/>{p.id===selectedId&&<Html center style={{pointerEvents:'none',fontSize:10,color:'#fff',padding:'1px 3px',background:'#172027aa',transform:'translateY(-12px)'}}>{n.id}</Html>}</mesh>)}</NodeMarkers>)}
    <Grid position={[bounds.center.x, -.0001, bounds.center.z]} args={[span*10,span*10]} cellSize={cell} sectionSize={cell*5} cellThickness={.65} sectionThickness={1} cellColor="#494e56" sectionColor="#8a929b" fadeDistance={span*12}/>
    <OrbitControls ref={controls} makeDefault enableDamping minDistance={span*.02} maxDistance={span*100}/>
    <GizmoHelper alignment="bottom-right" margin={[65,65]}><GizmoViewport axisColors={['#e19090','#b1d2a2','#9cbce5']} labelColor="black"/></GizmoHelper>
  </>;
}
export function Viewer(props: Props) {
  return <Canvas frameloop="demand" dpr={[1,1.75]} camera={{position:[.2,.15,.2],fov:40}} gl={{antialias:true}} onPointerMissed={() => props.onSelect(null)} fallback={<div className="webgl-error">WebGL is unavailable. Enable hardware acceleration.</div>}><Scene {...props}/></Canvas>;
}
