import { describe, expect, it } from 'vitest';
import catalog from '../../data/parts.json';
import { generationJobSchema, normalizeDiscovery } from '../contracts/models';
import { validateFile } from '../cad/import';
describe('discovery contract', () => {
  it('accepts every existing catalog record without asserting dimension accuracy', () => {
    const products = Object.values(catalog).map(normalizeDiscovery);
    expect(products).toHaveLength(91);
    expect(new Set(products.map(p => p.id)).size).toBe(91);
    expect(products.flatMap(p => p.dimensions).every(d => d.verification === 'unverified')).toBe(true);
    expect(products.some(p => !p.dimensions.length)).toBe(true);
  });
  it('maps the proposed Apify payload to the same identity and preserves source evidence', () => {
    const source = Object.values(catalog)[0];
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
  it('accepts STEP/STP/GLB case-insensitively', () => { for (const name of ['part.STEP','part.stp','part.glb']) expect(validateFile({name,size:100})).toBeTruthy(); });
  it('rejects native CAD, empty and oversized files', () => {
    for (const file of [{name:'part.sldprt',size:1},{name:'part.step',size:0},{name:'part.step',size:31*1024*1024}]) expect(() => validateFile(file)).toThrow();
  });
});
