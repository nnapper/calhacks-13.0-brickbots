// Classic worker keeps the OpenCascade/WASM runtime isolated and terminable.
self.onmessage = async ({ data }) => {
  try {
    importScripts('/vendor/occt/occt-import-js.js');
    const occt = await occtimportjs({ locateFile: file => `/vendor/occt/${file}` });
    const settings = await fetch('/cad-settings.json').then(r => { if (!r.ok) throw new Error('CAD configuration unavailable.'); return r.json(); });
    const result = occt.ReadStepFile(new Uint8Array(data.buffer), settings);
    if (!result.success || !result.meshes.length) throw new Error('No readable solid geometry in this STEP file.');
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'STEP import failed.' }); }
};
