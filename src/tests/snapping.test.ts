import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { LoadedModel } from '../cad/import';
import { addPosition, findBoundsSnap as findSnap, overlaps, worldBox, type PartInstance } from '../assembly/snapping';
function part(id:string,position:[number,number,number]=[0,0,0],min:[number,number,number]=[-.05,-.03,-.003],max:[number,number,number]=[.05,.03,.003]): PartInstance {
  return {id,position,model:{asset:{bounds:{min,max}}} as LoadedModel};
}
describe('bounding-face placement snaps',()=>{
  it('snaps adjacent parts without changing their scale',()=>{
    const fixed=part('fixed'), moving=part('moving',[.108,.002,0]);const snap=findSnap(moving,moving.position,[fixed,moving]);
    expect(snap?.targetId).toBe('fixed');expect(snap?.axis).toBe(0);snap!.position.forEach((v,i)=>expect(v).toBeCloseTo([.1,0,0][i],8));
    expect(overlaps(worldBox(fixed),worldBox(moving,snap!.position))).toBe(false);
    expect(worldBox(moving,snap!.position).getSize(new THREE.Vector3()).toArray()).toEqual([.10000000000000002,.06,.006]);
  });
  it('aligns every opposing face, including stacking and depth',()=>{
    const fixed=part('fixed');
    for(const axis of [0,1,2])for(const sign of [-1,1]){
      const expected:[number,number,number]=[0,0,0];expected[axis]=[.1,.06,.006][axis]*sign;
      const raw:[number,number,number]=[...expected];raw[axis]+=.001*sign;
      const moving=part('moving',raw);const snap=findSnap(moving,raw,[fixed],.003);
      expect(snap?.axis).toBe(axis);snap!.position.forEach((x,i)=>expect(x).toBeCloseTo(expected[i],8));
    }
  });
  it('ignores distant parts and the moving part itself',()=>{
    const a=part('a');expect(findSnap(a,[0,0,0],[a])).toBeNull();expect(findSnap(a,[1,0,0],[part('b')])).toBeNull();
  });
  it('rejects a snap that intersects a third part',()=>{
    const fixed=part('fixed'),moving=part('moving',[.101,0,0]),obstacle=part('obstacle',[.1,0,0]);
    expect(findSnap(moving,moving.position,[fixed,moving,obstacle],.003)).toBeNull();
  });
  it('handles non-centered source coordinates and target translation',()=>{
    const fixed=part('fixed',[.2,.1,.3]);const moving=part('moving',[.3,.07,.297],[0,0,0],[.1,.06,.006]);
    const snap=findSnap(moving,moving.position,[fixed],.1);
    expect(snap).not.toBeNull();expect(overlaps(worldBox(fixed),worldBox(moving,snap!.position))).toBe(false);
  });
  it('places dropped models on the ground and clicked copies beside existing parts',()=>{
    const a=part('a');expect(addPosition(a.model,[],[.2,0,.3])).toEqual([.2,.03,.3]);
    addPosition(a.model,[part('b',[0,.03,0])]).forEach((v,i)=>expect(v).toBeCloseTo([.125,.03,0][i],8));
  });
});
