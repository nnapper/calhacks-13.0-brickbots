import * as THREE from 'three';
import { analysisSchema, type Connector } from '../contracts/connectors';
import type { LoadedModel } from './import';
import catalog from '../../data/parts.json';
import { parseHoleGrid, placeHoleGrid } from '../assembly/gridNodes';
import { estimateToConnectors } from '../assembly/imageNodes';
import { kindOf } from '../scene/placeholders.js';

// Estimates written by scripts/image-nodes.mjs, one file per SKU. Missing or malformed files are ignored.
const estimateFiles = import.meta.glob('../../data/nodes/*.json', { eager: true, import: 'default' }) as Record<string, { sku?: string; estimate?: unknown }>;

type CatalogPart = { sku: string; name: string; specs: string[] };
// Used only when CAD analysis found no holes: the file name must be a goBILDA SKU the catalog describes as a regular grid.
function catalogGridNodes(model: LoadedModel, geometryRevision: string): Connector[] {
  const sku = model.asset.name.match(/\d{4}-\d{4}-\d{4}/)?.[0];
  const part = sku ? (Object.values(catalog) as CatalogPart[]).find(p => p.sku === sku) : undefined;
  const grid = part && parseHoleGrid(part);
  const fromName = (grid && placeHoleGrid(grid, model.asset.bounds, geometryRevision)) || [];
  if (fromName.length || !sku) return fromName;
  const saved = Object.values(estimateFiles).find(f => f.sku === sku);
  try { return saved ? estimateToConnectors(saved.estimate, model.asset.bounds, geometryRevision) : []; } catch { return []; }
}
export async function analyzeGeometry(model:LoadedModel):Promise<{geometryRevision:string;candidates:Connector[];engine:string}> {
 if(model.asset.originalFormat==='step'||model.asset.originalFormat==='stp'){
  const body=new FormData();body.append('file',model.original);
  const response=await fetch('/geometry/analyze',{method:'POST',body,signal:AbortSignal.timeout(60000)});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.detail??'CAD analysis service is unavailable. Start npm run geometry.');}
  const analysis = analysisSchema.parse(await response.json());
  if (analysis.candidates.some(n => n.kind === 'hole')) return analysis;
  const inferred = catalogGridNodes(model, analysis.geometryRevision);
  return inferred.length ? { ...analysis, engine: `${analysis.engine} + catalog hole grid (inferred from catalog or product images, review required)`, candidates: [...inferred, ...analysis.candidates].slice(0, 64) } : analysis;
 }
 // Mesh-only fallback: verified triangle sample locations, not CAD feature inference.
 const digest=await crypto.subtle.digest('SHA-256',await model.original.arrayBuffer());
 const revision=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(kindOf({name:model.asset.name})==='cable')return {geometryRevision:revision,engine:'Cable end points (from the mesh extremes)',candidates:cableEndNodes(model,revision)};
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

// A cable attaches at its two ends: one node on each end face, pointing away along the cable's longest axis.
function cableEndNodes(model:LoadedModel,revision:string):Connector[]{
 const {min,max}=model.asset.bounds;const axis=[0,1,2].reduce((a,i)=>max[i]-min[i]>max[a]-min[a]?i:a,0);
 const ends=[{side:-1,sum:new THREE.Vector3(),n:0},{side:1,sum:new THREE.Vector3(),n:0}];
 const eps=1e-6;model.object.updateMatrixWorld(true);
 model.object.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.attributes.position;
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);const c=v.getComponent(axis);
   for(const e of ends)if(e.side<0?c<=min[axis]+eps:c>=max[axis]-eps){e.sum.add(v);e.n++;}}});
 return ends.filter(e=>e.n).map((e,i)=>{
  const normal=new THREE.Vector3();normal.setComponent(axis,e.side);const tangent=new THREE.Vector3();tangent.setComponent((axis+1)%3,1);
  return {id:`c${i+1}`,geometryRevision:revision,kind:'surface' as const,position:e.sum.divideScalar(e.n).toArray() as [number,number,number],normal:normal.toArray() as [number,number,number],tangent:tangent.toArray() as [number,number,number],
   label:`Cable end ${i+1}`,reason:'One end of the cable, found at the extreme of its longest axis. Connect each end to a port or board; confirm before accepting.',review:'suggested' as const,method:'mesh_planar' as const,areaM2:3.6e-5};
 });
}
