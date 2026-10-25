import {describe,expect,it} from 'vitest';
import {validatePairSuggestions,type Connector} from './connectors';

const node=(over:Partial<Connector>):Connector=>({id:'a',geometryRevision:'r',kind:'hole',position:[0,0,0],normal:[0,0,1],tangent:[1,0,0],label:'Hole',reason:'Measured',review:'accepted',method:'step_analytic',diameterM:.008,...over});
const parts=[{partId:'p1',nodes:[node({id:'h1'})]},{partId:'p2',nodes:[node({id:'h2'})]}];
const pair=(over:Record<string,unknown>)=>({movingPartId:'p1',movingNodeId:'h1',targetPartId:'p2',targetNodeId:'h2',reason:'Diameters match',...over});

describe('validatePairSuggestions',()=>{
 it('accepts a compatible cross-part pair',()=>{expect(validatePairSuggestions(parts,{pairs:[pair({})]})).toHaveLength(1);});
 it('accepts an empty review',()=>{expect(validatePairSuggestions(parts,{pairs:[]})).toEqual([]);});
 it('rejects unknown parts and nodes',()=>{
  expect(()=>validatePairSuggestions(parts,{pairs:[pair({targetPartId:'p3'})]})).toThrow();
  expect(()=>validatePairSuggestions(parts,{pairs:[pair({targetNodeId:'h9'})]})).toThrow();
 });
 it('rejects same-part pairs',()=>{expect(()=>validatePairSuggestions(parts,{pairs:[pair({targetPartId:'p1',targetNodeId:'h1'})]})).toThrow();});
 it('rejects reused nodes',()=>{expect(()=>validatePairSuggestions(parts,{pairs:[pair({}),pair({targetPartId:'p1',targetNodeId:'h1'})]})).toThrow();});
 it('rejects mismatched kinds and diameters',()=>{
  expect(()=>validatePairSuggestions([{partId:'p1',nodes:[node({id:'h1'})]},{partId:'p2',nodes:[node({id:'s2',kind:'surface'})]}],{pairs:[pair({targetNodeId:'s2'})]})).toThrow();
  expect(()=>validatePairSuggestions([{partId:'p1',nodes:[node({id:'h1'})]},{partId:'p2',nodes:[node({id:'h2',diameterM:.01})]}],{pairs:[pair({targetNodeId:'h2'})]})).toThrow();
 });
 it('enforces the response schema',()=>{expect(()=>validatePairSuggestions(parts,{pairs:[{movingPartId:'p1'}]})).toThrow();});
});
