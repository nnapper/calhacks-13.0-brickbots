import {describe,it,expect} from 'vitest';
import {Vector3,Quaternion} from 'three';
import {alignConnectors,compatible,findSnap,type PartInstance} from './snapping';
import {applySuggestions,type Connector} from '../contracts/connectors';
const node:Connector={id:'a',geometryRevision:'r',kind:'hole',position:[.02,.03,.01],normal:[0,0,1],tangent:[1,0,0],label:'Hole',reason:'Measured',review:'accepted',method:'step_analytic',diameterM:.008};
const part=(id:string,q:[number,number,number,number]=[0,0,0,1])=>({id,position:[.1,.2,.3],quaternion:q,model:{geometryRevision:'r',connectors:[node],asset:{bounds:{min:[0,0,0],max:[.1,.06,.006]}}}} as PartInstance);
describe('grounded node snapping',()=>{
 it('coincides anchors and opposes normals on rotated targets',()=>{const a=part('a'),b=part('b',new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.8).toArray());const snap=alignConnectors(a,node,b,node);const q=new Quaternion(...snap.quaternion!);const tq=new Quaternion(...b.quaternion!);expect(new Vector3(...node.position).applyQuaternion(q).add(new Vector3(...snap.position)).distanceTo(new Vector3(...node.position).applyQuaternion(tq).add(new Vector3(...b.position)))).toBeLessThan(1e-10);expect(new Vector3(...node.normal).applyQuaternion(q).dot(new Vector3(...node.normal).applyQuaternion(tq))).toBeCloseTo(-1);});
 it('aligns diagonally opposite corners for front/back normals and rotated parts',()=>{
   for(const az of [-1,1])for(const bz of [-1,1])for(const angle of [0,.8,Math.PI]){
     const a={...node,id:'top-right',position:[.035,.015,az*.003] as [number,number,number],normal:[0,0,az] as [number,number,number]};
     const b={...node,id:'bottom-left',position:[-.035,-.015,bz*.003] as [number,number,number],normal:[0,0,bz] as [number,number,number]};
     const target=part('target',new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle).toArray());
     const result=alignConnectors(part('moving'),a,target,b),q=new Quaternion(...result.quaternion!),tq=new Quaternion(...target.quaternion!);
     expect(new Vector3(...a.position).applyQuaternion(q).add(new Vector3(...result.position)).distanceTo(new Vector3(...b.position).applyQuaternion(tq).add(new Vector3(...target.position)))).toBeLessThan(1e-10);
     expect(new Vector3(...a.normal).applyQuaternion(q).dot(new Vector3(...b.normal).applyQuaternion(tq))).toBeCloseTo(-1);
     expect(result.movingNodeId).toBe('top-right');expect(result.targetNodeId).toBe('bottom-left');
   }
 });
 it('requires approval and matching diameter',()=>{expect(compatible(node,{...node,review:'suggested'})).toBe(false);expect(compatible(node,{...node,diameterM:.01})).toBe(false);});
 it('rejects stale geometry nodes',()=>{const a=part('a');a.model.geometryRevision='changed';expect(findSnap(a,a.position,[part('b')])).toBeNull();});
 it('rejects fabricated and duplicated AI identifiers',()=>{expect(()=>applySuggestions([node],{selections:[{candidateId:'invented',label:'x',reason:'x'}]})).toThrow();expect(()=>applySuggestions([node],{selections:[{candidateId:'a',label:'x',reason:'x'},{candidateId:'a',label:'x',reason:'x'}]})).toThrow();});
 it('AI cannot approve or move geometry',()=>{const result=applySuggestions([{...node,review:'suggested'}],{selections:[{candidateId:'a',label:'Mount',reason:'Candidate'}]})[0];expect(result.position).toEqual(node.position);expect(result.review).toBe('suggested');expect(result.aiSelected).toBe(true);});
});
