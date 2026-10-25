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
export function alignConnectors(moving:PartInstance,a:Connector,target:PartInstance,b:Connector):Snap {
 const targetQ=new THREE.Quaternion(...(target.quaternion??[0,0,0,1]));
 const q=targetQ.clone().multiply(connectorFrame(b)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI)).multiply(connectorFrame(a).invert()).normalize();
 const point=new THREE.Vector3(...b.position).multiplyScalar(target.scale??1).applyQuaternion(targetQ).add(new THREE.Vector3(...target.position));
 const position=point.clone().sub(new THREE.Vector3(...a.position).multiplyScalar(moving.scale??1).applyQuaternion(q));
 return {targetId:target.id,position:position.toArray(),point:point.toArray(),quaternion:q.toArray(),movingNodeId:a.id,targetNodeId:b.id,axis:0,side:1,distance:0};
}
// A mate fixes the hole axis and position but not the spin about it. Pick the 30° step about that axis closest to
// how the part is already oriented, so a part the user turned stays turned when it clicks in.
function keepRoll(moving:PartInstance,a:Connector,target:PartInstance,b:Connector,snap:Snap):Snap {
 const axis=new THREE.Vector3(...b.normal).applyQuaternion(new THREE.Quaternion(...(target.quaternion??[0,0,0,1]))).normalize();
 const aligned=new THREE.Quaternion(...snap.quaternion!),current=new THREE.Quaternion(...(moving.quaternion??[0,0,0,1]));
 let best=aligned,bestScore=-1;
 for(let k=0;k<12;k++){const candidate=new THREE.Quaternion().setFromAxisAngle(axis,k*Math.PI/6).multiply(aligned);const score=Math.abs(candidate.dot(current));if(score>bestScore+1e-9){best=candidate;bestScore=score;}}
 const position=new THREE.Vector3(...snap.point).sub(new THREE.Vector3(...a.position).multiplyScalar(moving.scale??1).applyQuaternion(best));
 return {...snap,quaternion:best.toArray(),position:position.toArray()};
}
const FACE_PENALTY=1.6;
const TURN_COST_M=.004;
export function findSnap(moving:PartInstance,position:[number,number,number],parts:PartInstance[],threshold?:number,floorY?:number):Snap|null {
 const q=new THREE.Quaternion(...(moving.quaternion??[0,0,0,1]));const limit=threshold??THREE.MathUtils.clamp(localBox(moving).getSize(new THREE.Vector3()).length()*.15,.003,.02);
 let best:Snap|null=null,bestScore=Infinity;
 for(const a of moving.model.connectors??[]){if(a.geometryRevision!==moving.model.geometryRevision||a.review!=='accepted')continue;const from=new THREE.Vector3(...a.position).multiplyScalar(moving.scale??1).applyQuaternion(q).add(new THREE.Vector3(...position));
  for(const target of parts){if(target.id===moving.id)continue;for(const b of target.model.connectors??[]){if(b.geometryRevision!==target.model.geometryRevision||!compatible(a,b,moving.scale??1,target.scale??1))continue;
   const to=new THREE.Vector3(...b.position).multiplyScalar(target.scale??1).applyQuaternion(new THREE.Quaternion(...(target.quaternion??[0,0,0,1]))).add(new THREE.Vector3(...target.position));const distance=from.distanceTo(to);
   if(distance>limit)continue;
   const candidate={...keepRoll(moving,a,target,b,alignConnectors(moving,a,target,b)),distance};
   // A mate that would push the part below the build surface is not a valid placement.
   if(floorY!==undefined&&worldBox({...moving,quaternion:candidate.quaternion},candidate.position).min.y<floorY-1e-6)continue;
   // Face points are looser than holes, and a corner touches three faces, so prefer a hole that fits and the pairing that turns the part least.
   const turn=new THREE.Quaternion(...candidate.quaternion!).angleTo(q);
   const score=distance*(a.kind==='surface'?FACE_PENALTY:1)+turn*TURN_COST_M;
   if(score>=bestScore)continue;
   best=candidate;bestScore=score;
  }}
 }return best;
}
