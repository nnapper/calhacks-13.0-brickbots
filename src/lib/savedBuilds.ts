import type { PartInstance, Mate } from '../assembly/snapping';
import type { LoadedModel } from '../cad/import';

// Builds kept in this browser (IndexedDB), separate from the single Convex workspace. Each record holds the original
// bytes of every model it uses, so it reopens after a reload without fetching anything.
export const MAX_SAVED_BUILDS = 5;
const DB = 'brickbots-builds', STORE = 'builds';

export type SavedSource = { sourceId: string; fileName: string; bytes: ArrayBuffer; asset: LoadedModel['asset']; connectors?: LoadedModel['connectors']; geometryRevision?: string };
export type SavedBuild = {
  id: string; name: string; savedAt: number; partCount: number;
  sources: SavedSource[];
  parts: { sourceId: string; scale?: number; position: PartInstance['position']; quaternion?: PartInstance['quaternion'] }[];
  // Mates point at positions in `parts`, because part ids are new every time a build is opened.
  mates: { moving: number; target: number; axis?: number; side?: number; movingNodeId?: string; targetNodeId?: string }[];
};
export type BuildSummary = Pick<SavedBuild, 'id' | 'name' | 'savedAt' | 'partCount'>;

export type BuildStore = { all(): Promise<SavedBuild[]>; put(build: SavedBuild): Promise<void>; remove(id: string): Promise<void> };

function indexedDbStore(): BuildStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE, { keyPath: 'id' });
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  const run = async <T,>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => { db.close(); resolve(req.result); };
      t.onerror = () => { db.close(); reject(t.error); };
    });
  };
  return {
    all: () => run('readonly', s => s.getAll()),
    put: async build => { await run('readwrite', s => s.put(build)); },
    remove: async id => { await run('readwrite', s => s.delete(id)); },
  };
}

// Turns the live workspace into a record. Every distinct model is stored once, however many parts use it.
export async function toRecord(name: string, parts: PartInstance[], mates: Mate[], id: string = crypto.randomUUID()): Promise<SavedBuild> {
  const sources = new Map<string, SavedSource>();
  for (const p of parts) {
    const model = p.model;
    if (sources.has(model.asset.id)) continue;
    sources.set(model.asset.id, {
      sourceId: model.asset.id, fileName: model.original.name, bytes: await model.original.arrayBuffer(),
      asset: model.asset, connectors: model.connectors, geometryRevision: model.geometryRevision,
    });
  }
  const index = new Map(parts.map((p, i) => [p.id, i]));
  return {
    id, name: name.trim().slice(0, 60) || 'Untitled build', savedAt: Date.now(), partCount: parts.length,
    sources: [...sources.values()],
    parts: parts.map(p => ({ sourceId: p.model.asset.id, scale: p.scale, position: p.position, quaternion: p.quaternion })),
    mates: mates.flatMap(m => {
      const [moving, target] = [index.get(m.movingId), index.get(m.targetId)];
      return moving === undefined || target === undefined ? [] : [{ moving, target, axis: m.axis, side: m.side, movingNodeId: m.movingNodeId, targetNodeId: m.targetNodeId }];
    }),
  };
}

export function createBuildStore(store: BuildStore = indexedDbStore()) {
  const summaries = async (): Promise<BuildSummary[]> =>
    (await store.all()).map(({ id, name, savedAt, partCount }) => ({ id, name, savedAt, partCount })).sort((a, b) => b.savedAt - a.savedAt);
  return {
    list: summaries,
    get: async (id: string) => (await store.all()).find(b => b.id === id) ?? null,
    // Saving under an existing id replaces that build; a new build is refused once five are kept.
    async save(record: SavedBuild) {
      const existing = await store.all();
      if (!existing.some(b => b.id === record.id) && existing.length >= MAX_SAVED_BUILDS) throw new Error(`You can keep ${MAX_SAVED_BUILDS} saved builds. Delete one to save another.`);
      if (!record.partCount) throw new Error('Add at least one part before saving.');
      await store.put(record);
    },
    remove: (id: string) => store.remove(id),
  };
}
export const savedBuilds = createBuildStore();
