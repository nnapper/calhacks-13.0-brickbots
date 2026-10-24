import { Canvas, useThree, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Grid, Box, Html, Billboard } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { findSnap, compatible, worldBox, localBox, type PartInstance, type Snap, type Mate } from '../assembly/snapping';
import { playSnapSound } from '../assembly/clickSound';
export type View = 'Perspective' | 'Front' | 'Top' | 'Side';
export type ViewerBridge = { chooseNode:(partId:string,nodeId:string)=>void; dropPoint: (x: number, y: number) => [number, number, number] | undefined };
type Props = { mates?: Mate[]; parts: PartInstance[]; selectedId: string | null; view: View; reset: number; wireframe: boolean; snapEnabled: boolean; onConnect:(fromId:string,fromNode:string,toId:string,toNode:string)=>void; onNodeMessage:(message:string)=>void; onSelect: (id: string | null) => void; onMove: (id: string, position: [number, number, number], snap: Snap | null, quaternion?: [number, number, number, number]) => void; onPreview: (snap: Snap | null) => void; bridge: React.RefObject<ViewerBridge | null> };
// Brief green glow where two parts click together. It expands and fades out completely.
function SnapGlow({ point, radius, since }: { point: [number, number, number]; radius: number; since: number }) {
  const ring = useRef<THREE.Mesh>(null); const core = useRef<THREE.Mesh>(null); const { invalidate } = useThree();
  useFrame(() => {
    const t = Math.min((performance.now() - since) / 600, 1);
    if (ring.current) { ring.current.scale.setScalar(.6 + t * 1.6); (ring.current.material as THREE.MeshBasicMaterial).opacity = .95 * (1 - t); }
    if (core.current) { core.current.scale.setScalar(1 + t); (core.current.material as THREE.MeshBasicMaterial).opacity = .8 * (1 - t); }
    if (t < 1) invalidate();
  });
  return <Billboard position={point}>
    <mesh ref={ring} renderOrder={10} raycast={() => {}}><ringGeometry args={[radius * .75, radius, 40]}/><meshBasicMaterial color="#4dff9a" depthTest={false} transparent/></mesh>
    <mesh ref={core} renderOrder={10} raycast={() => {}}><circleGeometry args={[radius * .45, 24]}/><meshBasicMaterial color="#4dff9a" depthTest={false} transparent/></mesh>
  </Billboard>;
}
function Scene(props: Props) {
  const { parts, selectedId, view, reset, wireframe, snapEnabled, onSelect, onMove, onPreview, bridge } = props;
  const { camera, size, invalidate, gl } = useThree();
  const [armed,setArmed]=useState<{partId:string;nodeId:string}|null>(null);
  const [glow,setGlow]=useState<{point:[number,number,number];since:number}|null>(null);
  const [rotating,setRotating]=useState(false);
  const hintKey=useRef<string|null>(null);
  const glowTimer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function flash(point:[number,number,number]){playSnapSound('engage');setGlow({point,since:performance.now()});clearTimeout(glowTimer.current);glowTimer.current=setTimeout(()=>setGlow(null),700);}
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
  const rotatingRef = useRef(false); rotatingRef.current = rotating;
  useEffect(() => { setRotating(false); }, [selectedId]);
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
  // Turn the selected part (30° for A/D, 90° tips for W/S) about the connection it is attached by (or its center if free), then re-snap if it lands on a node.
  function rotate(axis: 'x' | 'y', direction: 1 | -1) {
    const { parts: all, selectedId: id, mates: joined } = latest.current; const p = all.find(i => i.id === id); if (!p) return;
    const q = new THREE.Quaternion(...(p.quaternion ?? [0, 0, 0, 1]));
    const delta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis === 'y' ? 0 : 1, axis === 'y' ? 1 : 0, 0), direction * (axis === 'y' ? Math.PI / 6 : Math.PI / 2));
    const mate = (joined ?? []).find(m => m.movingId === p.id || m.targetId === p.id);
    const node = mate && p.model.connectors?.find(n => n.id === (mate.movingId === p.id ? mate.movingNodeId : mate.targetNodeId));
    const pivot = node ? new THREE.Vector3(...node.position).applyQuaternion(q).add(new THREE.Vector3(...p.position)) : worldBox(p).getCenter(new THREE.Vector3());
    const turned = delta.clone().multiply(q);
    const position = pivot.clone().add(new THREE.Vector3(...p.position).sub(pivot).applyQuaternion(delta)).toArray() as [number, number, number];
    const lowest = worldBox({ ...p, quaternion: turned.toArray() }, position).min.y; if (lowest < 0) position[1] -= lowest;
    const moved = { ...p, position, quaternion: turned.toArray() } as PartInstance;
    const snap = findSnap(moved, position, all, undefined, 0);
    if (snap) flash(snap.point);
    latest.current.onMove(p.id, snap?.position ?? position, snap, snap ? undefined : turned.toArray());
  }
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
    hintKey.current = null;
    latest.current.onPreview(null); gl.domElement.style.cursor = ''; invalidate();
  }
  useEffect(() => {
    const cancel = () => end(true);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { cancel(); setArmed(null); setRotating(false); latest.current.onNodeMessage('Connection selection cancelled'); return; }
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || target?.closest('input,select,textarea,[contenteditable]')) return;
      const k = e.key.toLowerCase();
      if (k === 'r') { const id = latest.current.selectedId; if (id) { setRotating(v => { latest.current.onNodeMessage(v ? 'Rotate finished' : 'Rotate mode · A/D turn · W/S tip · click outside to finish'); return !v; }); } return; }
      if (!rotatingRef.current || !'adws'.includes(k) || k.length !== 1) return;
      e.preventDefault(); rotate(k === 'a' || k === 'd' ? 'y' : 'x', k === 'a' || k === 'w' ? 1 : -1);
    };
    window.addEventListener('blur', cancel); window.addEventListener('keydown', key);
    gl.domElement.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key); gl.domElement.removeEventListener('pointercancel', cancel); if (controls.current) controls.current.enabled = true; };
  }, [gl]);
  function down(e: ThreeEvent<PointerEvent>, p: PartInstance) {
    if (e.button !== 0) return;
    e.stopPropagation(); onSelect(p.id);
    if (rotating && p.id === selectedId) return;
    // Parts slide on a horizontal plane at the grabbed height; vertical placement comes from snapping onto other parts.
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), e.point);
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
    const lowest = worldBox(p, raw).min.y; if (lowest < 0) raw[1] -= lowest;
    const snap = snapEnabled && !e.shiftKey ? findSnap(p, raw, parts, undefined, 0) : null;
    p.model.object.position.set(...(snap?.position ?? raw));
    p.model.object.quaternion.set(...(snap?.quaternion??p.quaternion??[0,0,0,1]));
    active.snap = snap;
    const key = snap ? `${snap.targetId}:${snap.movingNodeId}:${snap.targetNodeId}` : null;
    if (key !== hintKey.current) { hintKey.current = key; if (snap) flash(snap.point); }
    if (selection.current) selection.current.position.copy(p.model.object.position);
    if(selection.current)selection.current.quaternion.copy(p.model.object.quaternion);
    onPreview(snap); invalidate();
  }
  const selectedBox = selected ? localBox(selected) : null;
  const cell = 10 ** Math.floor(Math.log10(span / 5));
  const ringRadius = Math.max(.003, Math.min(.012, span * .04));
  return <>
    <ambientLight intensity={1.3}/><hemisphereLight args={['#edf5ff','#55535b',1.5]}/><directionalLight position={[3,5,4]} intensity={3}/><directionalLight position={[-3,1,-2]} intensity={2}/>
    {parts.map(p => <primitive key={p.id} object={p.model.object} position={p.position} quaternion={p.quaternion??[0,0,0,1]} dispose={null} onPointerDown={(e:ThreeEvent<PointerEvent>) => down(e,p)} onPointerMove={move} onPointerUp={(e:ThreeEvent<PointerEvent>) => { if (drag.current) { e.stopPropagation(); end(); } }} />)}
    {selected && selectedBox && <group ref={selection} position={selected.position} quaternion={selected.quaternion??[0,0,0,1]}><Box args={selectedBox.getSize(new THREE.Vector3()).multiplyScalar(1.012).toArray()} position={selectedBox.getCenter(new THREE.Vector3())} raycast={() => {}}><meshBasicMaterial color={rotating ? "#65d9ff" : "#c5e7a8"} wireframe transparent opacity={rotating ? .95 : .55} depthTest={false}/></Box></group>}
    {glow && <SnapGlow key={glow.since} point={glow.point} radius={ringRadius} since={glow.since}/>}
    {rotating && selected && <Html position={[worldBox(selected).getCenter(new THREE.Vector3()).x, worldBox(selected).max.y, worldBox(selected).getCenter(new THREE.Vector3()).z]} center style={{pointerEvents:'none',transform:'translateY(-34px)',whiteSpace:'nowrap',fontSize:12,fontWeight:600,color:'#04222c',padding:'4px 10px',borderRadius:12,background:'#65d9ff',boxShadow:'0 2px 10px #0007'}}>Rotating · A / D turn · W / S tip · click outside to finish</Html>}
    <Grid position={[bounds.center.x, -.0001, bounds.center.z]} args={[span*10,span*10]} cellSize={cell} sectionSize={cell*5} cellThickness={.65} sectionThickness={1} cellColor="#494e56" sectionColor="#8a929b" fadeDistance={span*12}/>
    <OrbitControls ref={controls} makeDefault enableDamping minDistance={span*.02} maxDistance={span*100}/>
    <GizmoHelper alignment="bottom-right" margin={[65,65]}><GizmoViewport axisColors={['#e19090','#b1d2a2','#9cbce5']} labelColor="black"/></GizmoHelper>
  </>;
}
export function Viewer(props: Props) {
  return <Canvas frameloop="demand" dpr={[1,1.75]} camera={{position:[.2,.15,.2],fov:40}} gl={{antialias:true}} onPointerMissed={() => props.onSelect(null)} fallback={<div className="webgl-error">WebGL is unavailable. Enable hardware acceleration.</div>}><Scene {...props}/></Canvas>;
}
