import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cadToGroup, disposeModel, inspectBounds } from '../cad/geometry';
import type { CadResult } from '../cad/types';
const require = createRequire(import.meta.url);
const settings = JSON.parse(readFileSync('public/cad-settings.json','utf8'));
let occt: {ReadStepFile:(buffer:Uint8Array, settings:unknown)=>CadResult};
beforeAll(async () => { occt = await require('occt-import-js')(); }, 30_000);
const load = (name:string) => cadToGroup(occt.ReadStepFile(readFileSync(`public/fixtures/${name}.step`), settings));
const close = (actual:number[], expected:number[], tolerance=1e-7) => actual.forEach((x,i) => expect(Math.abs(x-expected[i])).toBeLessThan(tolerance));
describe('real OpenCascade conversion', () => {
  it('converts a 100 × 60 × 6 mm plate to meters without recentering', () => {
    const g=load('plate'); const b=inspectBounds(g); close(b.size.toArray(),[.1,.06,.006]); close(b.box.min.toArray(),[-.05,-.03,-.003]); disposeModel(g);
  });
  it('keeps all four holes empty and the solid center occupied', () => {
    const g=load('plate');
    for (const x of [-.035,.035]) for (const y of [-.015,.015]) {
      const ray=new THREE.Raycaster(new THREE.Vector3(x,y,.05),new THREE.Vector3(0,0,-1));
      expect(ray.intersectObject(g,true)).toHaveLength(0);
    }
    expect(new THREE.Raycaster(new THREE.Vector3(0,0,.05),new THREE.Vector3(0,0,-1)).intersectObject(g,true).length).toBeGreaterThan(0);
    disposeModel(g);
  });
  it('preserves cylinder radii and edge chord error within requested tolerance', () => {
    const g=load('plate'); let count=0;
    g.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.attributes.position;const idx=o.geometry.index!;
      for(let i=0;i<idx.count;i+=3){const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,idx.getX(i+j)));
        for(const cx of [-.035,.035])for(const cy of [-.015,.015]){
          if(!points.every(v=>Math.abs(Math.hypot(v.x-cx,v.y-cy)-.004)<1e-7))continue;
          count++;
          for(let a=0;a<3;a++){const mid=points[a].clone().add(points[(a+1)%3]).multiplyScalar(.5);expect(Math.abs(Math.hypot(mid.x-cx,mid.y-cy)-.004)).toBeLessThanOrEqual(settings.linearDeflection+1e-7);}
        }
      }
    }); expect(count).toBeGreaterThan(20);disposeModel(g);
  });
  it('retains translated and rotated body placement', () => {
    const g=load('assembly'); const boxes: THREE.Box3[]=[]; g.traverse(o=>{if(o instanceof THREE.Mesh)boxes.push(new THREE.Box3().setFromObject(o));});
    expect(boxes).toHaveLength(2);
    const moved=boxes.find(b=>b.getCenter(new THREE.Vector3()).x>.07)!;
    close(moved.getCenter(new THREE.Vector3()).toArray(),[.08,.02,.025]); close(moved.getSize(new THREE.Vector3()).toArray(),[.01,.02,.03]);
    close(inspectBounds(g).box.min.toArray(),[-.05,-.03,-.003]);close(inspectBounds(g).box.max.toArray(),[.085,.03,.04]);disposeModel(g);
  });
  it('rejects malformed STEP instead of returning an empty scene', () => {
    expect(()=>cadToGroup(occt.ReadStepFile(new TextEncoder().encode('not a STEP file'),settings))).toThrow();
  });
});
it('loads the independent GLB fixture at meter scale',async()=>{
  const bytes=readFileSync('public/fixtures/reference.glb');const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const gltf=await new GLTFLoader().parseAsync(buffer,'');close(inspectBounds(gltf.scene).size.toArray(),[.1,.06,.006]);disposeModel(gltf.scene);
});
