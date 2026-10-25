import {OBB} from 'three/addons/math/OBB.js';
import {Euler, Matrix3, Matrix4, Vector3} from 'three';
export type LayoutPart={id:string;name:string;solidBox?:boolean;sizeMm:{x:number;y:number;z:number}};
export type Placement={partId:string;positionMm:{x:number;y:number;z:number};rotationDegrees?:{x:number;y:number;z:number}};
// Only explicit counts attached to parts/blocks are constraints, never dimensions such as 20 mm.
export function requestedCount(goal:string):number|null {
 const words:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
 const matches=[...goal.toLowerCase().matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:(?:identical|equal|small|large|wooden|rectangular|square)\s+)*(?:\d+(?:\.\d+)?\s*(?:mm|cm|m)\s+)?(?:blocks?|cubes?|components?|parts?)\b/g)];
 return matches.length===1?(words[matches[0][1]]??Number(matches[0][1])):null;
}
export function validatePlanCount(goal:string, plan:any):number {
 const count=plan.subsystems.reduce((n:number,s:any)=>n+s.parts.reduce((t:number,p:any)=>t+p.qty,0)+s.customBodies.length,0);
 const expected=requestedCount(goal);
 if(!Number.isInteger(count)||count<1||count>100)throw new Error('A build must contain 1–100 parts; no quantities will be truncated.');
 if(expected!==null&&count!==expected)throw new Error(`Requested exactly ${expected} parts, but the plan contains ${count}. No parts were added.`);
 return count;
}
export function layoutIssues(parts:LayoutPart[], placements:Placement[]):string[]{
 const ids=new Set(parts.map(p=>p.id));
 if(placements.length!==ids.size||new Set(placements.map(p=>p.partId)).size!==ids.size||placements.some(p=>!ids.has(p.partId)))return ['Every supplied part must appear exactly once.'];
 const issues:string[]=[];
 for(const item of placements){
  const p=parts.find(p=>p.id===item.partId)!;const r=item.rotationDegrees??{x:0,y:0,z:0};
  if(!Object.values({...item.positionMm,rx:r.x,ry:r.y,rz:r.z}).every(Number.isFinite)){issues.push(`${p.name}: non-finite transform.`);continue;}
  const m=new Matrix4().makeRotationFromEuler(new Euler(r.x*Math.PI/180,r.y*Math.PI/180,r.z*Math.PI/180,'XYZ')).elements;
  const halfHeight=(Math.abs(m[1])*p.sizeMm.x+Math.abs(m[5])*p.sizeMm.y+Math.abs(m[9])*p.sizeMm.z)/2;
  if(item.positionMm.y-halfHeight<-.1)issues.push(`${p.name}: rotated bounds extend below the floor by ${(halfHeight-item.positionMm.y).toFixed(2)} mm.`);
 }
 // Solid generated boxes can be tested exactly with oriented bounds. Catalog meshes
 // may contain cavities, so bounding-box intersection alone would be misleading.
 const boxes=parts.filter(p=>p.solidBox).map(p=>{
  const item=placements.find(i=>i.partId===p.id)!;const r=item.rotationDegrees??{x:0,y:0,z:0};
  const rotation=new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(r.x*Math.PI/180,r.y*Math.PI/180,r.z*Math.PI/180,'XYZ')));
  return {name:p.name,obb:new OBB(new Vector3(item.positionMm.x,item.positionMm.y,item.positionMm.z),new Vector3(p.sizeMm.x/2-.05,p.sizeMm.y/2-.05,p.sizeMm.z/2-.05),rotation)};
 });
 for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++)if(boxes[a].obb.intersectsOBB(boxes[b].obb))issues.push(`${boxes[a].name} overlaps ${boxes[b].name}. Separate their solid volumes; touching faces are allowed.`);
 return issues;
}
