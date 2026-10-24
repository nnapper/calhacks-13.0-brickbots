import * as THREE from 'three';
import type { Connector } from '../contracts/connectors';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cadToGroup, disposeModel, inspectBounds } from './geometry';
import { modelAssetSchema, type ModelAsset } from '../contracts/models';
import type { ImportResponse } from './types';
export type LoadedModel = { object: THREE.Group; asset: ModelAsset; original: File; triangles: number; connectors?:Connector[]; geometryRevision?:string; storageId?:string };
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export function validateFile(file: Pick<File, 'name' | 'size'>) {
  const format = file.name.split('.').pop()?.toLowerCase();
  if (format !== 'step' && format !== 'stp' && format !== 'glb') throw new Error('Choose a STEP (.step/.stp) or GLB file. Export native CAD files to STEP first.');
  if (!file.size) throw new Error('This file is empty.');
  if (file.size > MAX_FILE_BYTES) throw new Error('This model exceeds the 30 MB import limit. Export a simplified model.');
  return format;
}
async function importStep(buffer: ArrayBuffer, signal: AbortSignal): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/cad-worker.js');
    const cleanup = () => { worker.terminate(); clearTimeout(timeout); signal.removeEventListener('abort', abort); };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const abort = () => fail(new DOMException('Import cancelled', 'AbortError'));
    const timeout = setTimeout(() => fail(new Error('STEP conversion exceeded 60 seconds. Try a simplified model.')), 60_000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    worker.onerror = () => fail(new Error('The CAD worker could not start. Reload and try again.'));
    worker.onmessage = ({ data }: MessageEvent<ImportResponse>) => {
      cleanup();
      if ('error' in data) { reject(new Error(data.error)); return; }
      try { resolve(cadToGroup(data.result)); } catch (error) { reject(error); }
    };
    worker.postMessage({ buffer }, [buffer]);
  });
}
export async function loadModel(file: File, signal: AbortSignal, fixture = false): Promise<LoadedModel> {
  const format = validateFile(file); const buffer = await file.arrayBuffer();
  signal.throwIfAborted();
  let object: THREE.Group;
  if (format === 'glb') {
    const bytes = new DataView(buffer);
    if (buffer.byteLength < 20 || bytes.getUint32(0, true) !== 0x46546c67) throw new Error('This file is not a valid binary glTF (GLB) model.');
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => {
      if (!url.startsWith('blob:') && !url.startsWith('data:')) throw new Error('Use a self-contained GLB with embedded textures and buffers.');
      return url;
    });
    try { object = (await new GLTFLoader(manager).parseAsync(buffer, '')).scene; }
    catch (error) { throw new Error(`GLB could not be loaded. Use an uncompressed, self-contained export. ${error instanceof Error ? error.message : ''}`); }
  } else object = await importStep(buffer, signal);
  try {
    signal.throwIfAborted();
    const { box } = inspectBounds(object);
    let triangles = 0;
    object.traverse(o => { if (o instanceof THREE.Mesh) triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; });
    if (triangles > 1_000_000) throw new Error('Model exceeds one million triangles. Export a lighter preview.');
    const asset = modelAssetSchema.parse({ schemaVersion: 1, id: crypto.randomUUID(), revision: 1, name: file.name, originalFormat: format,
      sourceKind: fixture ? 'test_fixture' : 'uploaded_cad', sourceUnits: format === 'glb' ? 'meter' : null,
      canonicalUnits: 'meter', sourceToCanonicalTransform: format === 'glb' ? new THREE.Matrix4().toArray() : null,
      conversion: { engine: format === 'glb' ? 'GLTFLoader' : 'occt-import-js@0.0.23', outputUnits: 'meter', ...(format === 'glb' ? {} : { linearDeflectionM: 0.00002 }) },
      bounds: { min: box.min.toArray(), max: box.max.toArray() }, scaleStatus: 'format_defined',
    });
    // STEP units and placements are resolved inside OCCT. The wrapper does not expose
    // a single raw-source transform; null explicitly records that instead of inventing one.
    return { object, asset, original: file, triangles };
  } catch (error) { disposeModel(object); throw error; }
}
