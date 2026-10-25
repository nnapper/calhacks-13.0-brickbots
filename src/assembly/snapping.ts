import * as THREE from 'three';
import type { Connector } from '../contracts/connectors';
import type { LoadedModel } from '../cad/import';
export type PartInstance = { id: string; model: LoadedModel; scale?:number; position: [number, number, number]; quaternion?:[number,number,number,number] };
export type Snap = { targetId: string; position: [number, number, number]; point: [number, number, number]; axis: number; side: number; distance: number; quaternion?:[number,number,number,number]; movingNodeId?:string; targetNodeId?:string };
export type Mate = { movingId: string; targetId: string; axis?: number; side?: number; movingNodeId?:string; targetNodeId?:string };
export function localBox(part: PartInstance) {
  return new THREE.Box3(new THREE.Vector3(...part.model.asset.bounds.min), new THREE.Vector3(...part.model.asset.bounds.max));
}
export function worldBox(part: PartInstance, position = part.position) { return localBox(part).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion(...(part.quaternion??[0,0,0,1])),new THREE.Vector3().setScalar(part.scale??1))); }
export function overlaps(a: THREE.Box3, b: THREE.Box3) {
  return [0, 1, 2].every(i => Math.min(a.max.getComponent(i), b.max.getComponent(i)) - Math.max(a.min.getComponent(i), b.min.getComponent(i)) > 1e-7);
}
// Placement aid: aligns opposing axis-aligned bounding-box face centers.
// No hole, surface, fastener, or mechanical-compatibility inference is made.
export function findBoundsSnap(moving: PartInstance, position: [number, number, number], parts: PartInstance[], threshold?: number): Snap | null {
  const box = worldBox(moving, position), center = box.getCenter(new THREE.Vector3()), half = box.getSize(new THREE.Vector3()).multiplyScalar(.5);
  const limit = threshold ?? THREE.MathUtils.clamp(half.length() * .35, .004, .025);
  let best: Snap | null = null;
  for (const target of parts) {
    if (target.id === moving.id) continue;
    const other = worldBox(target), otherCenter = other.getCenter(new THREE.Vector3()), otherHalf = other.getSize(new THREE.Vector3()).multiplyScalar(.5);
    for (let axis = 0; axis < 3; axis++) for (const side of [-1, 1]) {
      const from = center.clone(); from.setComponent(axis, from.getComponent(axis) - side * half.getComponent(axis));
      const to = otherCenter.clone(); to.setComponent(axis, to.getComponent(axis) + side * otherHalf.getComponent(axis));
      const distance = from.distanceTo(to);
      if (distance > limit || (best && distance >= best.distance)) continue;
      const candidate = new THREE.Vector3(...position).add(to.clone().sub(from));
      const movedBox = worldBox(moving, candidate.toArray());
      if (parts.some(p => p.id !== moving.id && overlaps(movedBox, worldBox(p)))) continue;
      best = { targetId: target.id, position: candidate.toArray(), point: to.toArray(), axis, side, distance };
    }
  }
  return best;
}
export function addPosition(model: LoadedModel, parts: PartInstance[], drop?: [number, number, number]): [number, number, number] {
  const min = model.asset.bounds.min, max = model.asset.bounds.max;
  if (drop) return [drop[0] - (min[0] + max[0]) / 2, -min[1], drop[2] - (min[2] + max[2]) / 2];
  const right = parts.length ? Math.max(...parts.map(p => worldBox(p).max.x)) + .025 : -(max[0] - min[0]) / 2;
  return [right - min[0], -min[1], -(min[2] + max[2]) / 2];
}

export function connectorFrame(node:Connector):THREE.Quaternion {
 const z=new THREE.Vector3(...node.normal).normalize();const x=new THREE.Vector3(...node.tangent).addScaledVector(z,-new THREE.Vector3(...node.tangent).dot(z)).normalize();
 if(z.lengthSq()<.9||x.lengthSq()<.9)throw new Error('Invalid connector orientation');
 const y=z.clone().cross(x).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
export function compatible(a:Connector,b:Connector,scaleA=1,scaleB=1){
 if(a.review!=='accepted'||b.review!=='accepted'||a.kind!==b.kind)return false;
 if(a.kind==='hole')return a.diameterM!==undefined&&b.diameterM!==undefined&&Math.abs(a.diameterM*scaleA-b.diameterM*scaleB)<=Math.max(.0001,Math.min(a.diameterM*scaleA,b.diameterM*scaleB)*.02);
 return true;
}
// `opposed` turns the part so the two connector normals face each other; false leaves them pointing the same way,
// which is how a part with a plain through-hole goes on from its other side.
export function alignConnectors(moving:PartInstance,a:Connector,target:PartInstance,b:Connector,opposed=true):Snap {
 const targetQ=new THREE.Quaternion(...(target.quaternion??[0,0,0,1]));
 const q=targetQ.clone().multiply(connectorFrame(b)).multiply(opposed?new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI):new THREE.Quaternion()).multiply(connectorFrame(a).invert()).normalize();
 const point=new THREE.Vector3(...b.position).multiplyScalar(target.scale??1).applyQuaternion(targetQ).add(new THREE.Vector3(...target.position));
 const position=point.clone().sub(new THREE.Vector3(...a.position).multiplyScalar(moving.scale??1).applyQuaternion(q));
 return {targetId:target.id,position:position.toArray(),point:point.toArray(),quaternion:q.toArray(),movingNodeId:a.id,targetNodeId:b.id,axis:0,side:1,distance:0};
}
// A mate fixes the hole axis and position but not the spin about it, and a plain hole accepts the part from either side.
// Keep the facing and the exact spin the user already gave the part, so it clicks in the way it was held instead of being turned.
function keepOrientation(moving:PartInstance,a:Connector,target:PartInstance,b:Connector):Snap {
 const axis=new THREE.Vector3(...b.normal).applyQuaternion(new THREE.Quaternion(...(target.quaternion??[0,0,0,1]))).normalize();
 const current=new THREE.Quaternion(...(moving.quaternion??[0,0,0,1])),pure=new THREE.Quaternion(axis.x,axis.y,axis.z,0);
 let best:{q:THREE.Quaternion;snap:Snap}|null=null,bestScore=-1;
 for(const opposed of a.kind==='hole'?[true,false]:[true]){
  const snap=alignConnectors(moving,a,target,b,opposed),aligned=new THREE.Quaternion(...snap.quaternion!);
  // The spin about the axis that leaves the part closest to how it is held: maximise cos(h)*A + sin(h)*B.
  const h=Math.atan2(pure.clone().multiply(aligned).dot(current),aligned.dot(current));
  const q=new THREE.Quaternion().setFromAxisAngle(axis,2*h).multiply(aligned).normalize(),score=Math.abs(q.dot(current));
  if(score>bestScore+1e-9){best={q,snap};bestScore=score;}
 }
 const {q,snap}=best!;
 const position=new THREE.Vector3(...snap.point).sub(new THREE.Vector3(...a.position).multiplyScalar(moving.scale??1).applyQuaternion(q));
 return {...snap,quaternion:q.toArray(),position:position.toArray()};
}
const FACE_PENALTY=1.6;
const TURN_COST_M=.004;
// A connection point that already holds a part (in a mate that does not involve `moving`) is taken and cannot be snapped to again.
function takenNodes(moving:PartInstance,mates:Mate[]=[]){
 const taken=new Set<string>();
 for(const m of mates){if(m.movingId===moving.id||m.targetId===moving.id)continue;
  if(m.movingNodeId)taken.add(m.movingId+':'+m.movingNodeId);if(m.targetNodeId)taken.add(m.targetId+':'+m.targetNodeId);}
 return taken;
}
// `mates` marks connection points as taken; `accept` can veto a placement, e.g. one that would push solid into solid.
export function findSnap(moving:PartInstance,position:[number,number,number],parts:PartInstance[],threshold?:number,floorY?:number,mates?:Mate[],accept?:(snap:Snap)=>boolean):Snap|null {
 const q=new THREE.Quaternion(...(moving.quaternion??[0,0,0,1]));const limit=threshold??THREE.MathUtils.clamp(localBox(moving).getSize(new THREE.Vector3()).length()*.15,.003,.02);
 const taken=takenNodes(moving,mates);
 let best:Snap|null=null,bestScore=Infinity;
 for(const a of moving.model.connectors??[]){if(a.geometryRevision!==moving.model.geometryRevision||a.review!=='accepted')continue;const from=new THREE.Vector3(...a.position).multiplyScalar(moving.scale??1).applyQuaternion(q).add(new THREE.Vector3(...position));
  for(const target of parts){if(target.id===moving.id)continue;for(const b of target.model.connectors??[]){if(b.geometryRevision!==target.model.geometryRevision||taken.has(target.id+':'+b.id)||!compatible(a,b,moving.scale??1,target.scale??1))continue;
   const to=new THREE.Vector3(...b.position).multiplyScalar(target.scale??1).applyQuaternion(new THREE.Quaternion(...(target.quaternion??[0,0,0,1]))).add(new THREE.Vector3(...target.position));const distance=from.distanceTo(to);
   if(distance>limit)continue;
   const candidate={...keepOrientation(moving,a,target,b),distance};
   // A mate that would push the part below the build surface is not a valid placement.
   if(floorY!==undefined&&worldBox({...moving,quaternion:candidate.quaternion},candidate.position).min.y<floorY-1e-6)continue;
   if(accept&&!accept(candidate))continue;
   // Face points are looser than holes, and a corner touches three faces, so prefer a hole that fits and the pairing that turns the part least.
   const turn=new THREE.Quaternion(...candidate.quaternion!).angleTo(q);
   const score=distance*(a.kind==='surface'?FACE_PENALTY:1)+turn*TURN_COST_M;
   if(score>=bestScore)continue;
   best=candidate;bestScore=score;
  }}
 }return best;
}

export type Alignment = { position: [number, number, number]; guides: { axis: 0 | 2; value: number; label: 'center' | 'edge'; targetId: string }[] };
// Soft alignment for free placement: nudges a part so its centre or an edge lines up with another part along x and z,
// and rests it on (or under) that part when it ends up centred over it and almost touching. Returns null when nothing is close.
export function findAlignment(moving: PartInstance, position: [number, number, number], parts: PartInstance[], threshold?: number): Alignment | null {
  const box = worldBox(moving, position);
  const limit = threshold ?? THREE.MathUtils.clamp(box.getSize(new THREE.Vector3()).length() * .12, .003, .012);
  const adjust: [number, number, number] = [0, 0, 0];
  const guides: Alignment['guides'] = [];
  for (const axis of [0, 2] as const) {
    const lo = box.min.getComponent(axis), hi = box.max.getComponent(axis), mid = (lo + hi) / 2;
    let best: { delta: number; score: number; value: number; label: 'center' | 'edge'; targetId: string } | null = null;
    for (const target of parts) {
      if (target.id === moving.id) continue;
      const other = worldBox(target), tlo = other.min.getComponent(axis), thi = other.max.getComponent(axis);
      const options: [number, number, 'center' | 'edge'][] = [[(tlo + thi) / 2 - mid, (tlo + thi) / 2, 'center'], [tlo - lo, tlo, 'edge'], [thi - hi, thi, 'edge']];
      for (const [delta, value, label] of options) {
        // Centring wins over edge-flush when they are nearly as close.
        const score = Math.abs(delta) * (label === 'center' ? .6 : 1);
        if (Math.abs(delta) <= limit && (!best || score < best.score)) best = { delta, score, value, label, targetId: target.id };
      }
    }
    if (best) { adjust[axis] = best.delta; guides.push({ axis, value: best.value, label: best.label, targetId: best.targetId }); }
  }
  if (!guides.length) return null;
  const aligned: [number, number, number] = [position[0] + adjust[0], position[1], position[2] + adjust[2]];
  const moved = worldBox(moving, aligned);
  for (const id of new Set(guides.map(g => g.targetId))) {
    const target = parts.find(p => p.id === id); if (!target) continue;
    const other = worldBox(target);
    if (!overlaps2d(moved, other)) continue;
    const onTop = moved.min.y - other.max.y, below = moved.max.y - other.min.y;
    const dy = Math.abs(onTop) <= limit ? -onTop : Math.abs(below) <= limit ? -below : 0;
    if (dy && moved.min.y + dy >= -1e-9) { aligned[1] += dy; break; }
  }
  return { position: aligned, guides };
}
function overlaps2d(a: THREE.Box3, b: THREE.Box3) {
  return [0, 2].every(i => Math.min(a.max.getComponent(i), b.max.getComponent(i)) - Math.max(a.min.getComponent(i), b.min.getComponent(i)) > 1e-7);
}
