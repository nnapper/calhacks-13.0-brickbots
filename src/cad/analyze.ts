import * as THREE from 'three';
import { analysisSchema, type Connector } from '../contracts/connectors';
import type { LoadedModel } from './import';
export async function analyzeGeometry(model:LoadedModel):Promise<{geometryRevision:string;candidates:Connector[];engine:string}> {
 if(model.asset.originalFormat!=='glb'){
  const body=new FormData();body.append('file',model.original);
  const response=await fetch('/geometry/analyze',{method:'POST',body,signal:AbortSignal.timeout(60000)});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.detail??'CAD analysis service is unavailable. Start npm run geometry.');}
  return analysisSchema.parse(await response.json());
 }
 // Mesh-only fallback: verified triangle sample locations, not CAD feature inference.
 const digest=await crypto.subtle.digest('SHA-256',await model.original.arrayBuffer());
 const revision=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const samples:{point:THREE.Vector3;normal:THREE.Vector3;area:number}[]=[];
 model.object.updateMatrixWorld(true);
 model.object.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const g=o.geometry,p=g.attributes.position,idx=g.index;const normalMatrix=new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
  for(let i=0;i<(idx?.count??p.count);i+=3){const [a,b,c]=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+j):i+j));const cross=b.clone().sub(a).cross(c.clone().sub(a));const area=cross.length()/2;if(area<1e-8)continue;
   samples.push({point:a.clone().add(b).add(c).multiplyScalar(1/3).applyMatrix4(o.matrixWorld),normal:cross.normalize().applyNormalMatrix(normalMatrix),area});
  }});
 samples.sort((a,b)=>b.area-a.area); const chosen:typeof samples=[];
 for(const s of samples){if(chosen.some(c=>c.normal.dot(s.normal)>.99&&Math.abs(c.normal.dot(s.point.clone().sub(c.point)))<.0001))continue;chosen.push(s);if(chosen.length>=24)break;}
 return {geometryRevision:revision,engine:'Mesh triangle surface samples (approximate)',candidates:chosen.map((s,i)=>{
  const ref=Math.abs(s.normal.x)<.85?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);const tangent=ref.addScaledVector(s.normal,-ref.dot(s.normal)).normalize();
  return {id:`m${i+1}`,geometryRevision:revision,kind:'surface',position:s.point.toArray(),normal:s.normal.toArray(),tangent:tangent.toArray(),label:`Mesh surface ${i+1}`,reason:'Point sampled from an actual mesh triangle; approximate mounting intent requires review.',review:'suggested',method:'mesh_planar',areaM2:s.area};
 })};
}
