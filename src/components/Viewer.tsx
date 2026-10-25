import { Canvas, useThree, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Grid, Box, Html, Billboard, Line } from '@react-three/drei';
import { formatLength } from '../lib/units.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { findSnap, findAlignment, compatible, worldBox, localBox, type PartInstance, type Snap, type Mate } from '../assembly/snapping';
import { collides, startingContacts, SNAP_SHRINK } from '../assembly/collision';
import { partsInRect, type Rect } from '../assembly/selection';
import { playSnapSound } from '../assembly/clickSound';
export type View = 'Perspective' | 'Front' | 'Top' | 'Side';
export type ViewerBridge = { chooseNode:(partId:string,nodeId:string)=>void; armed:()=>boolean; dropPoint: (x: number, y: number) => [number, number, number] | undefined };
type Move = { id: string; position: [number, number, number]; quaternion?: [number, number, number, number] };
type Props = { selectedIds?: string[]; onSelectMany?: (ids: string[]) => void; onMoveMany?: (moves: Move[]) => void; boxSelect?: boolean; align?: boolean; onMarquee?: (rect: Rect | null) => void; measure?: boolean; unit?: string; mates?: Mate[]; parts: PartInstance[]; selectedId: string | null; view: View; reset: number; wireframe: boolean; snapEnabled: boolean; onConnect:(fromId:string,fromNode:string,toId:string,toNode:string)=>void; onNodeMessage:(message:string)=>void; onSelect: (id: string | null) => void; onMove: (id: string, position: [number, number, number], snap: Snap | null, quaternion?: [number, number, number, number]) => void; onPreview: (snap: Snap | null) => void; bridge: React.RefObject<ViewerBridge | null> };
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
function useDarkTheme() {
  const read = () => document.documentElement.dataset.theme === 'dark';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}
function Scene(props: Props) {
  const dark = useDarkTheme();
  const { parts, selectedId, view, reset, wireframe, snapEnabled, onSelect, onMove, onPreview, bridge } = props;
  const selectedIds = props.selectedIds ?? (selectedId ? [selectedId] : []);
  const [guides, setGuides] = useState<{ axis: 0 | 2; value: number }[]>([]);
  const alignKey = useRef<string | null>(null);
  const { camera, size, invalidate, gl } = useThree();
  const [armed,setArmed]=useState<{partId:string;nodeId:string}|null>(null);
  const [glow,setGlow]=useState<{point:[number,number,number];since:number}|null>(null);
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
    if(!compatible({...a,review:'accepted'},{...b,review:'accepted'},from?.scale??1,part.scale??1)){props.onNodeMessage('These nodes differ in type or hole diameter. Choose another dot.');return;}
    props.onConnect(armed.partId,armed.nodeId,part.id,nodeId);setArmed(null);
  }
  const controls = useRef<OrbitControlsImpl>(null);
  const drag = useRef<{ id: string; plane: THREE.Plane; offset: THREE.Vector3; start: [number,number,number]; snap: Snap | null; exempt: Set<string>; last: [number, number, number]; pointerId: number; target: {releasePointerCapture:(id:number)=>void}; started: boolean; startX: number; startY: number; group?: { id: string; start: THREE.Vector3 }[] } | null>(null);
  const latest = useRef(props); latest.current = props;
  // Wireframe box of every selected part; `selection` is the primary part's box, kept in step while it is dragged.
  const boxRefs = useRef(new Map<string, THREE.Group>());
  const selection = { get current() { return boxRefs.current.get(latest.current.selectedId ?? '') ?? null; } };
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
    bridge.current = { chooseNode:(partId,nodeId)=>{const part=parts.find(p=>p.id===partId);if(part)chooseNode(part,nodeId);}, armed:()=>!!armed, dropPoint: (x, y) => {
      const rect = gl.domElement.getBoundingClientRect(); const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera);
      const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      return point && point.distanceTo(bounds.center) < span * 20 ? point.toArray() : undefined;
    }};
    return () => { bridge.current = null; };
  }, [bridge, camera, gl, bounds, span, parts, armed]);
  // Turn the selected part (30° per press) about the connection it is attached by (or its center if free), then re-snap if it lands on a node.
  function rotate(axis: 'x' | 'y', direction: 1 | -1) {
    const ids = latest.current.selectedIds ?? [];
    if (ids.length > 1) { rotateGroup(axis, direction, ids); return; }
    const { parts: all, selectedId: id, mates: joined } = latest.current; const p = all.find(i => i.id === id); if (!p) return;
    const q = new THREE.Quaternion(...(p.quaternion ?? [0, 0, 0, 1]));
    const delta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis === 'y' ? 0 : 1, axis === 'y' ? 1 : 0, 0), direction * Math.PI / 6);
    const mate = (joined ?? []).find(m => m.movingId === p.id || m.targetId === p.id);
    const node = mate && p.model.connectors?.find(n => n.id === (mate.movingId === p.id ? mate.movingNodeId : mate.targetNodeId));
    const pivot = node ? new THREE.Vector3(...node.position).multiplyScalar(p.scale??1).applyQuaternion(q).add(new THREE.Vector3(...p.position)) : worldBox(p).getCenter(new THREE.Vector3());
    const turned = delta.clone().multiply(q);
    const position = pivot.clone().add(new THREE.Vector3(...p.position).sub(pivot).applyQuaternion(delta)).toArray() as [number, number, number];
    const lowest = worldBox({ ...p, quaternion: turned.toArray() }, position).min.y; if (lowest < 0) position[1] -= lowest;
    const moved = { ...p, position, quaternion: turned.toArray() } as PartInstance;
    const exempt = startingContacts(p, all, joined);
    if (collides(p, position, turned.toArray() as [number, number, number, number], all, exempt)) { latest.current.onNodeMessage('Blocked: turning here would push into another part'); return; }
    const snap = findSnap(moved, position, all, undefined, 0, joined, s => !collides(p, s.position, s.quaternion ?? (turned.toArray() as [number, number, number, number]), all, exempt, SNAP_SHRINK));
    if (snap) flash(snap.point);
    latest.current.onMove(p.id, snap?.position ?? position, snap, snap ? undefined : turned.toArray());
  }
  // A selected group turns as one rigid piece about the centre of the group (30° per press).
  function rotateGroup(axis: 'x' | 'y', direction: 1 | -1, ids: string[]) {
    const members = latest.current.parts.filter(p => ids.includes(p.id)); if (members.length < 2) return;
    const box = new THREE.Box3(); members.forEach(p => box.union(worldBox(p)));
    const pivot = box.getCenter(new THREE.Vector3());
    const delta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis === 'y' ? 0 : 1, axis === 'y' ? 1 : 0, 0), direction * Math.PI / 6);
    const moves = members.map(p => {
      const turned = delta.clone().multiply(new THREE.Quaternion(...(p.quaternion ?? [0, 0, 0, 1])));
      const position = pivot.clone().add(new THREE.Vector3(...p.position).sub(pivot).applyQuaternion(delta)).toArray() as [number, number, number];
      return { id: p.id, position, quaternion: turned.toArray() as [number, number, number, number], part: p };
    });
    const lowest = Math.min(...moves.map(m => worldBox({ ...m.part, quaternion: m.quaternion }, m.position).min.y));
    if (lowest < 0) moves.forEach(m => { m.position[1] -= lowest; });
    latest.current.onMoveMany?.(moves.map(({ id, position, quaternion }) => ({ id, position, quaternion })));
  }
  function end(cancel = false) {
    const active = drag.current; if (!active) return;
    drag.current = null;
    setGuides([]); alignKey.current = null;
    if (controls.current) controls.current.enabled = true;
    try { active.target.releasePointerCapture(active.pointerId); } catch { /* capture already released */ }
    if (active.group) {
      const members = active.group.map(g => ({ g, part: latest.current.parts.find(p => p.id === g.id) })).filter(m => m.part) as { g: { id: string; start: THREE.Vector3 }; part: PartInstance }[];
      if (cancel) members.forEach(({ g, part }) => { part.model.object.position.copy(g.start); boxRefs.current.get(g.id)?.position.copy(g.start); });
      else {
        const moves = members.filter(({ g, part }) => part.model.object.position.distanceTo(g.start) > 1e-9).map(({ part }) => ({ id: part.id, position: part.model.object.position.toArray() as [number, number, number] }));
        if (moves.length) latest.current.onMoveMany?.(moves);
      }
      hintKey.current = null; latest.current.onPreview(null); gl.domElement.style.cursor = ''; invalidate();
      return;
    }
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
      if (e.key === 'Escape') { cancel(); setArmed(null); latest.current.onNodeMessage('Connection selection cancelled'); return; }
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || target?.closest('input,select,textarea,[contenteditable]')) return;
      const k = e.key.toLowerCase();
      if (!latest.current.selectedId || !'adws'.includes(k) || k.length !== 1) return;
      e.preventDefault(); rotate(k === 'a' || k === 'd' ? 'y' : 'x', k === 'a' || k === 'w' ? 1 : -1);
    };
    window.addEventListener('blur', cancel); window.addEventListener('keydown', key);
    gl.domElement.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key); gl.domElement.removeEventListener('pointercancel', cancel); if (controls.current) controls.current.enabled = true; };
  }, [gl]);
  // Drag-box selection: with Box select on (or Shift held), dragging empty space draws a translucent rectangle
  // and selects every part it touches. Capture phase, so it runs before camera orbit and part dragging.
  useEffect(() => {
    const el = gl.domElement;
    let start: { x: number; y: number } | null = null, moved = false;
    const local = (e: PointerEvent): Rect => {
      const b = el.getBoundingClientRect();
      return { left: Math.min(start!.x, e.clientX) - b.left, top: Math.min(start!.y, e.clientY) - b.top, right: Math.max(start!.x, e.clientX) - b.left, bottom: Math.max(start!.y, e.clientY) - b.top };
    };
    const finish = () => { start = null; moved = false; latest.current.onMarquee?.(null); if (controls.current) controls.current.enabled = true; };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !(latest.current.boxSelect || e.shiftKey) || !latest.current.onSelectMany) return;
      const b = el.getBoundingClientRect();
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), camera);
      const targets: THREE.Object3D[] = latest.current.parts.map(p => p.model.object); if (gizmo.current) targets.push(gizmo.current);
      if (ray.intersectObjects(targets, true).length) return; // pressing a part or an arrow works as usual
      e.stopImmediatePropagation();
      start = { x: e.clientX, y: e.clientY }; moved = false;
      if (controls.current) controls.current.enabled = false;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
      moved = true; latest.current.onMarquee?.(local(e));
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const rect = moved ? local(e) : null;
      const additive = e.shiftKey;
      try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      finish();
      if (!rect) return;
      const b = el.getBoundingClientRect(); const v = new THREE.Vector3();
      const inside = partsInRect(latest.current.parts, point => { v.copy(point).project(camera); return { x: (v.x * .5 + .5) * b.width, y: (-v.y * .5 + .5) * b.height }; }, rect);
      const before = latest.current.selectedIds ?? [];
      latest.current.onSelectMany?.(additive ? [...new Set([...before, ...inside])] : inside);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && start) finish(); };
    el.addEventListener('pointerdown', down, true); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    window.addEventListener('keydown', escape);
    return () => { el.removeEventListener('pointerdown', down, true); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); window.removeEventListener('keydown', escape); };
  }, [gl, camera]);
  // Axis arrows: drag an arrow to slide the selected part along that world axis only.
  const gizmo = useRef<THREE.Group>(null);
  const axisDrag = useRef<{ id: string; axis: THREE.Vector3; t0: number; startPos: THREE.Vector3; startCenter: THREE.Vector3; exempt: Set<string>; pointerId: number; target: {releasePointerCapture:(id:number)=>void} } | null>(null);
  function axisT(ray: THREE.Ray, origin: THREE.Vector3, axis: THREE.Vector3) {
    const w0 = origin.clone().sub(ray.origin), b = axis.dot(ray.direction), d = axis.dot(w0), e = ray.direction.dot(w0), den = 1 - b * b;
    return Math.abs(den) < 1e-6 ? null : (b * e - d) / den;
  }
  function arrowDown(e: ThreeEvent<PointerEvent>, p: PartInstance, axis: THREE.Vector3) {
    if (e.button !== 0) return; e.stopPropagation();
    const startCenter = worldBox(p).getCenter(new THREE.Vector3()); const t0 = axisT(e.ray, startCenter, axis); if (t0 === null) return;
    const target = e.target as unknown as {setPointerCapture:(id:number)=>void; releasePointerCapture:(id:number)=>void};
    target.setPointerCapture(e.pointerId);
    axisDrag.current = { id: p.id, axis, t0, startPos: new THREE.Vector3(...p.position), startCenter, exempt: startingContacts(p, latest.current.parts, latest.current.mates), pointerId: e.pointerId, target };
    if (controls.current) controls.current.enabled = false;
  }
  function arrowMove(e: ThreeEvent<PointerEvent>) {
    const a = axisDrag.current; if (!a) return; e.stopPropagation();
    const p = parts.find(i => i.id === a.id); if (!p) return;
    const t = axisT(e.ray, a.startCenter, a.axis); if (t === null) return;
    const pos = a.startPos.clone().addScaledVector(a.axis, t - a.t0).toArray() as [number, number, number];
    const lowest = worldBox(p, pos).min.y; if (lowest < 0) pos[1] -= lowest;
    // Sliding along an arrow stops at solid parts too.
    if (collides(p, pos, p.quaternion, parts, a.exempt)) return;
    p.model.object.position.set(...pos);
    selection.current?.position.set(...pos);
    gizmo.current?.position.set(...pos);
    invalidate();
  }
  function arrowUp(e: ThreeEvent<PointerEvent>) {
    const a = axisDrag.current; if (!a) return; e.stopPropagation(); axisDrag.current = null;
    try { a.target.releasePointerCapture(a.pointerId); } catch { /* capture already released */ }
    if (controls.current) controls.current.enabled = true;
    const p = latest.current.parts.find(i => i.id === a.id); if (!p) return;
    const pos = p.model.object.position.toArray() as [number, number, number];
    if (new THREE.Vector3(...pos).distanceTo(a.startPos) < 1e-9) return;
    const snap = snapEnabled && !e.shiftKey ? findSnap(p, pos, latest.current.parts, undefined, 0, latest.current.mates, s => !collides(p, s.position, s.quaternion ?? p.quaternion, latest.current.parts, a.exempt, SNAP_SHRINK)) : null;
    if (snap) flash(snap.point);
    latest.current.onMove(p.id, snap?.position ?? pos, snap);
  }
  function down(e: ThreeEvent<PointerEvent>, p: PartInstance) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const ids = latest.current.selectedIds ?? [];
    // Shift-click adds a part to the selection or takes it out.
    if (e.shiftKey && latest.current.onSelectMany) { latest.current.onSelectMany(ids.includes(p.id) ? ids.filter(i => i !== p.id) : [...ids, p.id]); return; }
    // Pressing a part that is already in a group keeps the group so the whole group can be dragged.
    const inGroup = ids.length > 1 && ids.includes(p.id);
    if (!inGroup) onSelect(p.id);
    // Parts slide on a horizontal plane at the grabbed height; vertical placement comes from snapping onto other parts.
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), e.point);
    const target = e.target as unknown as {setPointerCapture:(id:number)=>void; releasePointerCapture:(id:number)=>void};
    target.setPointerCapture(e.pointerId);
    drag.current = { id: p.id, plane, offset: p.model.object.position.clone().sub(e.point), start: [...p.position], snap: null, exempt: inGroup ? new Set<string>() : startingContacts(p, parts, latest.current.mates), last: [...p.position], pointerId: e.pointerId, target, started: false, startX: e.clientX, startY: e.clientY,
      group: inGroup ? parts.filter(x => ids.includes(x.id)).map(x => ({ id: x.id, start: x.model.object.position.clone() })) : undefined };
    if (controls.current) controls.current.enabled = false;
    gl.domElement.style.cursor = 'grabbing';
  }
  function move(e: ThreeEvent<PointerEvent>) {
    const active = drag.current; if (!active) return; e.stopPropagation();
    // A click must not nudge a part: dragging starts only after the pointer has moved a few pixels.
    if (!active.started) { if (Math.hypot(e.clientX - active.startX, e.clientY - active.startY) < 5) return; active.started = true; }
    const p = parts.find(p => p.id === active.id); if (!p) return;
    const point = e.ray.intersectPlane(active.plane, new THREE.Vector3()); if (!point) return;
    if (active.group) {
      // A group moves rigidly; its parts keep their positions relative to each other.
      const primaryStart = active.group.find(g => g.id === active.id)!.start;
      const delta = point.add(active.offset).sub(primaryStart);
      const members = active.group.map(g => ({ g, part: parts.find(x => x.id === g.id) })).filter(m => m.part) as { g: { id: string; start: THREE.Vector3 }; part: PartInstance }[];
      const lowest = Math.min(...members.map(({ g, part }) => worldBox(part, g.start.clone().add(delta).toArray() as [number, number, number]).min.y));
      if (lowest < 0) delta.y -= lowest;
      members.forEach(({ g, part }) => { const next = g.start.clone().add(delta); part.model.object.position.copy(next); boxRefs.current.get(g.id)?.position.copy(next); });
      active.snap = null; invalidate(); return;
    }
    const raw = point.add(active.offset).toArray();
    const lowest = worldBox(p, raw).min.y; if (lowest < 0) raw[1] -= lowest;
    // A connection only counts when the part can actually go there: solid may not end up inside solid.
    const snap = snapEnabled && !e.shiftKey ? findSnap(p, raw, parts, undefined, 0, props.mates, s => !collides(p, s.position, s.quaternion ?? p.quaternion, parts, active.exempt, SNAP_SHRINK)) : null;
    // With no connection point nearby, line the part up with its neighbours (centre or edge) and show guide lines.
    const align = !snap && snapEnabled && props.align !== false && !e.shiftKey ? findAlignment(p, raw as [number, number, number], parts) : null;
    if (align) { raw[0] = align.position[0]; raw[1] = align.position[1]; raw[2] = align.position[2]; }
    const guideKey = align ? align.guides.map(g => `${g.axis}:${g.value.toFixed(4)}`).join('|') : null;
    if (guideKey !== alignKey.current) {
      alignKey.current = guideKey; setGuides(align ? align.guides.map(g => ({ axis: g.axis, value: g.value })) : []);
      if (align) { const first = align.guides[0]; const other = parts.find(x => x.id === first.targetId); props.onNodeMessage(`${first.label === 'center' ? 'Centred with' : 'Edge aligned with'} ${other?.model.asset.name ?? 'part'}`); }
    }
    // Free movement stops at solid parts but slides along them: try the full move, then each horizontal axis alone.
    let placed = (snap?.position ?? raw) as [number, number, number], blocked = false;
    if (!snap) {
      const tries: [number, number, number][] = [placed, [placed[0], placed[1], active.last[2]], [active.last[0], placed[1], placed[2]]];
      const free = tries.find(t => !collides(p, t, p.quaternion, parts, active.exempt));
      blocked = !free; placed = free ?? active.last;
    }
    active.last = placed;
    gl.domElement.style.cursor = blocked ? 'not-allowed' : 'grabbing';
    p.model.object.position.set(...placed);
    p.model.object.quaternion.set(...(snap?.quaternion??p.quaternion??[0,0,0,1]));
    active.snap = snap;
    const key = snap ? `${snap.targetId}:${snap.movingNodeId}:${snap.targetNodeId}` : null;
    if (key !== hintKey.current) { hintKey.current = key; if (snap) flash(snap.point); }
    if (selection.current) selection.current.position.copy(p.model.object.position);
    if(selection.current)selection.current.quaternion.copy(p.model.object.quaternion);
    if (gizmo.current) { gizmo.current.position.copy(p.model.object.position); gizmo.current.quaternion.copy(p.model.object.quaternion); }
    onPreview(snap); invalidate();
  }
  const selectedParts = selectedIds.map(id => parts.find(p => p.id === id)).filter(Boolean) as PartInstance[];
  const ringRadius = Math.max(.003, Math.min(.012, span * .04));
  return <>
    <ambientLight intensity={1.3}/><hemisphereLight args={['#edf5ff','#55535b',1.5]}/><directionalLight position={[3,5,4]} intensity={3}/><directionalLight position={[-3,1,-2]} intensity={2}/>
    {parts.map(p => <primitive key={p.id} object={p.model.object} scale={p.scale??1} position={p.position} quaternion={p.quaternion??[0,0,0,1]} dispose={null} onPointerDown={(e:ThreeEvent<PointerEvent>) => down(e,p)} onPointerMove={move} onPointerUp={(e:ThreeEvent<PointerEvent>) => { if (drag.current) { e.stopPropagation(); end(); } }} />)}
    {selectedParts.map(part => { const box = localBox(part); return <group key={part.id} ref={(g: THREE.Group | null) => { if (g) boxRefs.current.set(part.id, g); else boxRefs.current.delete(part.id); }} scale={part.scale??1} position={part.position} quaternion={part.quaternion??[0,0,0,1]}><Box args={box.getSize(new THREE.Vector3()).multiplyScalar(1.012).toArray()} position={box.getCenter(new THREE.Vector3())} raycast={() => {}}><meshBasicMaterial color="#c5e7a8" wireframe transparent opacity={.55} depthTest={false}/></Box></group>; })}
    {guides.map((g, i) => { const a = g.axis === 0 ? new THREE.Vector3(g.value, .0004, bounds.center.z - span * 1.5) : new THREE.Vector3(bounds.center.x - span * 1.5, .0004, g.value); const b = g.axis === 0 ? new THREE.Vector3(g.value, .0004, bounds.center.z + span * 1.5) : new THREE.Vector3(bounds.center.x + span * 1.5, .0004, g.value); return <Line key={i} points={[a, b]} color="#e08a3c" lineWidth={1.6} dashed dashSize={span * .02} gapSize={span * .012} depthTest={false}/>; })}
    {selected && selectedIds.length <= 1 && (() => { const sz = worldBox(selected).getSize(new THREE.Vector3()); const len = Math.max(sz.x, sz.y, sz.z) * .5 + span * .05, r = len * .028;
      const q = new THREE.Quaternion(...(selected.quaternion ?? [0, 0, 0, 1])); const localCenter = localBox(selected).getCenter(new THREE.Vector3()).multiplyScalar(selected.scale ?? 1);
      return <group ref={gizmo} position={selected.position} quaternion={q}><group position={localCenter}>{([['#ff5d5d',[1,0,0]],['#5dd66a',[0,1,0]],['#5d9bff',[0,0,1]]] as [string,[number,number,number]][]).map(([color, a]) => { const local = new THREE.Vector3(...a); const aim = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), local);
        return <group key={color} quaternion={aim} renderOrder={20} onPointerDown={(e:ThreeEvent<PointerEvent>) => arrowDown(e, selected, local.clone().applyQuaternion(q))} onPointerMove={arrowMove} onPointerUp={arrowUp} onPointerOver={() => { gl.domElement.style.cursor = 'grab'; }} onPointerOut={() => { if (!axisDrag.current) gl.domElement.style.cursor = ''; }}>
          <mesh position={[0, len / 2, 0]} renderOrder={20}><cylinderGeometry args={[r, r, len, 10]}/><meshBasicMaterial color={color} depthTest={false} transparent opacity={.95}/></mesh>
          <mesh position={[0, len + r * 2.6, 0]} renderOrder={20}><coneGeometry args={[r * 2.6, r * 5.2, 16]}/><meshBasicMaterial color={color} depthTest={false} transparent opacity={.95}/></mesh>
        </group>; })}</group></group>; })()}
    {props.measure && selected && (() => {
      // Model bounds of the selected part: width, height and depth lines with their sizes in the chosen unit.
      const { min: lo, max: hi } = worldBox(selected); const dim = (m: number) => formatLength(m * 1000, props.unit ?? 'mm');
      const x0 = new THREE.Vector3(lo.x, lo.y, hi.z), x1 = new THREE.Vector3(hi.x, lo.y, hi.z), z1 = new THREE.Vector3(hi.x, lo.y, lo.z), y1 = new THREE.Vector3(hi.x, hi.y, hi.z);
      const tag = (from: THREE.Vector3, to: THREE.Vector3, size: number) => <Html position={from.clone().lerp(to, .5)} center zIndexRange={[5, 0]} style={{pointerEvents:'none'}}><span className="cad-dim">{dim(size)}</span></Html>;
      const color = dark ? '#9aa8f0' : '#5269bd';
      return <group>
        <Line points={[x0, x1]} color={color} lineWidth={1.4} depthTest={false}/>{tag(x0, x1, hi.x - lo.x)}
        <Line points={[x1, z1]} color={color} lineWidth={1.4} depthTest={false}/>{tag(x1, z1, hi.z - lo.z)}
        <Line points={[x1, y1]} color={color} lineWidth={1.4} depthTest={false}/>{tag(x1, y1, hi.y - lo.y)}
      </group>;
    })()}
    {glow && <SnapGlow key={glow.since} point={glow.point} radius={ringRadius} since={glow.since}/>}
    <Grid position={[0, -.0001, 0]} args={[1, 1]} infiniteGrid cellSize={.01} sectionSize={.1} cellThickness={.65} sectionThickness={1} cellColor={dark?"#4a5278":"#202020"} sectionColor={dark?"#8e9ad0":"#000000"} fadeDistance={2.5} fadeStrength={1.5}/>
    <OrbitControls ref={controls} makeDefault enableDamping minDistance={span*.02} maxDistance={span*100}/>
    <GizmoHelper alignment="bottom-right" margin={[44,44]}><GizmoViewport axisScale={[.38,.012,.012]} axisHeadScale={.45} axisColors={['#e19090','#b1d2a2','#9cbce5']} labelColor={dark?"white":"black"}/></GizmoHelper>
  </>;
}
export function Viewer(props: Props) {
  const [marquee, setMarquee] = useState<Rect | null>(null);
  return <div className="cad-viewer">
    <Canvas frameloop="demand" dpr={[1,1.75]} camera={{position:[.2,.15,.2],fov:40}} gl={{antialias:true}} onPointerMissed={() => props.onSelect(null)} fallback={<div className="webgl-error">WebGL is unavailable. Enable hardware acceleration.</div>}><Scene {...props} onMarquee={setMarquee}/></Canvas>
    {marquee && <div className="cad-marquee" style={{ left: marquee.left, top: marquee.top, width: marquee.right - marquee.left, height: marquee.bottom - marquee.top }}/>}
  </div>;
}
