import {it,expect} from 'vitest';
import {Vector3,Quaternion} from 'three';
import {worldBox,alignConnectors,compatible,type PartInstance} from './snapping';
import type {Connector} from '../contracts/connectors';
const node:Connector={id:'hole',geometryRevision:'r',kind:'hole',position:[.04,.02,.003],normal:[0,0,1],tangent:[1,0,0],label:'Hole',reason:'fixture',review:'accepted',method:'step_analytic',diameterM:.008};
const part=(scale:number)=>({id:String(scale),scale,position:[0,0,0],model:{asset:{bounds:{min:[0,0,0],max:[.1,.05,.01]}}}} as PartInstance);
it('uniform scaling preserves all dimension ratios',()=>{expect(worldBox(part(2.5)).getSize(new Vector3()).toArray()).toEqual([.25,.125,.025]);});
it('scaled anchors coincide after snapping',()=>{const moving=part(2),target=part(3);const s=alignConnectors(moving,node,target,node);const anchor=new Vector3(...node.position).multiplyScalar(2).applyQuaternion(new Quaternion(...s.quaternion!)).add(new Vector3(...s.position));expect(anchor.distanceTo(new Vector3(...node.position).multiplyScalar(3))).toBeLessThan(1e-10);});
it('scaled hole diameters determine compatibility',()=>{expect(compatible(node,node,2,1)).toBe(false);expect(compatible(node,{...node,diameterM:.016},2,1)).toBe(true);});
