// Supply the official goBILDA 1126-0001-0001.STEP download as the first argument.
// Expected values independently extracted from the analytic B-Rep with OCP 7.9.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
if (!process.argv[2]) throw new Error('Usage: node scripts/verify-manufacturer.mjs /path/to/1126-0001-0001.STEP');
const bytes=readFileSync(process.argv[2]);
const occt=await require('occt-import-js')();
const r=occt.ReadStepFile(bytes,JSON.parse(readFileSync('public/cad-settings.json')));
assert(r.success && r.meshes.length===1);
const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
for(const m of r.meshes)for(let i=0;i<m.attributes.position.array.length;i++){
 const v=m.attributes.position.array[i];min[i%3]=Math.min(min[i%3],v);max[i%3]=Math.max(max[i%3],v);
}
const expectedMin=[-.028,0,-.007],expectedMax=[.028,.0025,.007];
const error=Math.max(...min.map((x,i)=>Math.abs(x-expectedMin[i])),...max.map((x,i)=>Math.abs(x-expectedMax[i])));
assert(error<1e-7,'Bounds differ by more than 0.0001 mm');
let checked=0,maxChordError=0;
for(const m of r.meshes){const a=m.attributes.position.array, idx=m.index.array;
 for(let i=0;i<idx.length;i+=3){const points=[0,1,2].map(j=>a.slice(idx[i+j]*3,idx[i+j]*3+3));
  for(const cx of [-.024,-.016,-.008,0,.008,.016,.024]){
   if(!points.every(p=>Math.abs(Math.hypot(p[0]-cx,p[2])-.002)<1e-7))continue;
   checked++;
   for(let j=0;j<3;j++){const p=points[j],q=points[(j+1)%3];const e=Math.abs(Math.hypot((p[0]+q[0])/2-cx,(p[2]+q[2])/2)-.002);maxChordError=Math.max(maxChordError,e);}
  }
 }
}
assert(checked>20);assert(maxChordError<=.00002+1e-7);
console.log(JSON.stringify({sku:'1126-0001-0001',sha256:createHash('sha256').update(bytes).digest('hex'),boundsMm:{min:min.map(v=>v*1000),max:max.map(v=>v*1000)},maxBoundsErrorMm:error*1000,cylinderTrianglesChecked:checked,maxCylinderChordErrorMm:maxChordError*1000,passed:true},null,2));
