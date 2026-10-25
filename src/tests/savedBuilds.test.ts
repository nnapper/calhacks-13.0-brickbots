import { describe, expect, it } from 'vitest';
import { createBuildStore, MAX_SAVED_BUILDS, toRecord, type SavedBuild } from '../lib/savedBuilds';

const memory = () => {
  const rows = new Map<string, SavedBuild>();
  return { all: async () => [...rows.values()], put: async (b: SavedBuild) => { rows.set(b.id, b); }, remove: async (id: string) => { rows.delete(id); } };
};
const part = (id: string, assetId: string) => ({ id, scale: 1, position: [0, 0, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number],
  model: { asset: { id: assetId, name: assetId } as never, original: new File([new Uint8Array([1, 2, 3])], `${assetId}.step`), connectors: [], object: {} as never, triangles: 0 } });

describe('saved builds', () => {
  it('stores each model once and maps mates to part positions', async () => {
    const rec = await toRecord('Duck', [part('a', 'x'), part('b', 'x'), part('c', 'y')] as never, [{ movingId: 'b', targetId: 'c', axis: 1, side: 1 }, { movingId: 'b', targetId: 'gone' }]);
    expect(rec.sources.map(s => s.sourceId)).toEqual(['x', 'y']);
    expect(rec.mates).toEqual([expect.objectContaining({ moving: 1, target: 2 })]);
    expect(rec.partCount).toBe(3);
  });
  it('keeps at most five builds, allows replacing one, and deletes', async () => {
    const store = createBuildStore(memory());
    const ids: string[] = [];
    for (let i = 0; i < MAX_SAVED_BUILDS; i++) { const r = await toRecord(`b${i}`, [part('a', 'x')] as never, []); ids.push(r.id); await store.save(r); }
    await expect(store.save(await toRecord('six', [part('a', 'x')] as never, []))).rejects.toThrow(/Delete one/);
    await store.save(await toRecord('renamed', [part('a', 'x')] as never, [], ids[0]));
    expect((await store.list()).length).toBe(5);
    await store.remove(ids[1]);
    await store.save(await toRecord('six', [part('a', 'x')] as never, []));
    expect((await store.list()).map(b => b.name)).toContain('six');
  });
  it('refuses an empty build', async () => {
    await expect(createBuildStore(memory()).save(await toRecord('empty', [], []))).rejects.toThrow(/at least one part/);
  });
});
