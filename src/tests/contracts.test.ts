import { describe, expect, it } from 'vitest';
import catalog from '../../data/parts.json';
import { generationJobSchema, normalizeDiscovery } from '../contracts/models';
import { disposeModel, inspectBounds } from '../cad/geometry';
import { loadModel, validateFile } from '../cad/import';
describe('discovery contract', () => {
  it('accepts every existing catalog record without asserting dimension accuracy', () => {
    const products = Object.values(catalog).map(normalizeDiscovery);
    expect(products).toHaveLength(Object.keys(catalog).length);
    expect(new Set(products.map(p => p.id)).size).toBe(Object.keys(catalog).length);
    expect(products.flatMap(p => p.dimensions).every(d => d.verification === 'unverified')).toBe(true);
    expect(products.some(p => !p.dimensions.length)).toBe(true);
  });
  it('maps the proposed Apify payload to the same identity and preserves source evidence', () => {
    const source = Object.values(catalog).find((p):p is Extract<typeof p,{url:string}> => 'url' in p)!;
    const result = normalizeDiscovery({ ...source, actorRunId: 'sample-run', cadSources: [{url:'https://example.com/part.step',format:'step',sourceUrl:source.url}] });
    expect(result.id).toBe(normalizeDiscovery(source).id);
    expect(result.actorRunId).toBe('sample-run'); expect(result.cadSources).toHaveLength(1);
  });
  it('rejects invalid URLs and incomplete success records', () => {
    expect(() => normalizeDiscovery({...Object.values(catalog)[0],url:'invalid'})).toThrow();
    expect(generationJobSchema.safeParse({schemaVersion:1,id:'j',productId:'p',inputHash:'h',provider:'p',settings:{},status:'succeeded'}).success).toBe(false);
  });
});
describe('file validation', () => {
  it('accepts STEP/STP/STL/GLB case-insensitively', () => { for (const name of ['part.STEP','part.stp','part.stl','part.glb']) expect(validateFile({name,size:100})).toBeTruthy(); });
  it('rejects native CAD, empty and oversized files', () => {
    for (const file of [{name:'part.sldprt',size:1},{name:'part.step',size:0},{name:'part.step',size:31*1024*1024}]) expect(() => validateFile(file)).toThrow();
  });
  it('loads a binary STL with millimeters converted to meters', async () => {
    const buffer = new ArrayBuffer(134);
    const data = new DataView(buffer);
    for (const [index, value] of [...'Binary STL test'].entries()) data.setUint8(index, value.charCodeAt(0));
    data.setUint32(80, 1, true);
    [0, 0, 1, 0, 0, 0, 10, 0, 0, 0, 20, 0].forEach((value, index) => data.setFloat32(84 + index * 4, value, true));
    const model = await loadModel(new File([buffer], 'part.stl'), new AbortController().signal);
    expect(model.asset.originalFormat).toBe('stl');
    expect(model.asset.sourceUnits).toBe('millimeter');
    expect(model.asset.scaleStatus).toBe('unknown');
    expect(inspectBounds(model.object).size.toArray()).toEqual([.01, .02, 0]);
    disposeModel(model.object);
  });
});
