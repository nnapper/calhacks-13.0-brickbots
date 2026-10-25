import {describe,it,expect} from 'vitest';
import {Vector3,Quaternion} from 'three';
import plate from './fixtures/plate-nodes.json';
import assembly from './fixtures/assembly-nodes.json';
import {analysisSchema,type Connector} from '../contracts/connectors';
import {alignConnectors,compatible,findSnap,type PartInstance} from './snapping';
const nodes=[...analysisSchema.parse(plate).candidates,...analysisSchema.parse(assembly).candidates].map((n,i)=>({...n,id:`node-${i}`,review:'accepted' as const}));
function part(id:string,node:Connector,q:Quaternion):PartInstance{return {id,position:[.17,-.08,.23],quaternion:q.toArray(),model:{geometryRevision:node.geometryRevision,connectors:[node],asset:{bounds:{min:[-.05,-.03,-.003],max:[.1,.06,.03]}}}} as PartInstance;}
const rotations=[new Quaternion(),new Quaternion().setFromAxisAngle(new Vector3(1,2,3).normalize(),1.17),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI)];
describe('every extracted reference node pair',()=>{
 for(const a of nodes)for(const b of nodes){
  it(`${a.id} ${a.kind} → ${b.id} ${b.kind}`,()=>{
   const allowed=a.kind===b.kind;
   expect(compatible(a,b)).toBe(allowed);
   for(const rotation of rotations){
    const moving=part('moving',a,new Quaternion()),target=part('target',b,rotation);
    const snap=alignConnectors(moving,a,target,b),q=new Quaternion(...snap.quaternion!);
    const targetPoint=new Vector3(...b.position).applyQuaternion(rotation).add(new Vector3(...target.position));
    const actual=new Vector3(...a.position).applyQuaternion(q).add(new Vector3(...snap.position));
    expect(actual.distanceTo(targetPoint)).toBeLessThan(1e-10);
    expect(new Vector3(...a.normal).applyQuaternion(q).dot(new Vector3(...b.normal).applyQuaternion(rotation))).toBeCloseTo(-1,10);
    expect(q.length()).toBeCloseTo(1,10);
    moving.quaternion=snap.quaternion;moving.position=snap.position;
    expect(findSnap(moving,moving.position,[moving,target])!==null).toBe(allowed);
    moving.model.connectors=[{...a,review:'rejected'}];
    expect(findSnap(moving,moving.position,[target])).toBeNull();
   }
  });
 }
});
