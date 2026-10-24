// Real part sizes from the manufacturer's CAD (free, no API credits).
//
//   node scripts/cad-dims.mjs [--only <text>] [--force]
//
// goBILDA publishes a STEP model for every part at /content/step_files/<SKU>.zip. For each goBILDA part
// this downloads that zip (cached in data/step/), reads the model with OpenCascade (occt-import-js),
// and stores its overall size as `bbox_mm: [longest, middle, shortest]` in data/parts.json. Parts whose
// model is missing get `cad_missing: true` so they can be sized by hand. Re-runnable: parts that
// already have bbox_mm are skipped unless --force.

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { unzipSync } from "fflate";
import occtImport from "occt-import-js";

const FILE = "data/parts.json";
const CACHE = "data/step";
const STEP_URL = (sku) => `https://www.gobilda.com/content/step_files/${sku}.zip`;

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].toLowerCase() : null;
const force = args.includes("--force");

const parts = JSON.parse(await readFile(FILE, "utf8"));
const save = () => writeFile(FILE, JSON.stringify(parts, null, 2));
const exists = (f) => access(f).then(() => true, () => false);

async function stepZip(sku) {
  const cached = `${CACHE}/${sku}.zip`;
  if (await exists(cached)) return readFile(cached);
  const res = await fetch(STEP_URL(sku), { headers: { "User-Agent": "Mozilla/5.0 (BrickBots catalog)" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 2).toString() !== "PK") return null; // an HTML error page, not a zip
  await writeFile(cached, buf);
  return buf;
}

function measure(occt, stepBytes) {
  // coarse tessellation is plenty for an outer size and keeps big assemblies fast
  const res = occt.ReadStepFile(stepBytes, { linearUnit: "millimeter", linearDeflectionType: "bounding_box_ratio", linearDeflection: 0.01 });
  if (!res.success || !res.meshes.length) throw new Error("model could not be read");
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of res.meshes) {
    const p = m.attributes.position.array;
    for (let i = 0; i < p.length; i += 3)
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < min[k]) min[k] = p[i + k];
        if (p[i + k] > max[k]) max[k] = p[i + k];
      }
  }
  return max.map((v, k) => Math.round((v - min[k]) * 10) / 10).sort((a, b) => b - a);
}

await mkdir(CACHE, { recursive: true });
const occt = await occtImport();
const todo = Object.values(parts).filter(
  (p) => p.sku && /gobilda\.com/.test(p.url ?? "") && (force || !p.bbox_mm) && (!only || `${p.sku} ${p.name}`.toLowerCase().includes(only))
);

let sized = 0, missing = 0, failed = 0;
for (const [i, p] of todo.entries()) {
  const tag = `[${i + 1}/${todo.length}] ${p.sku}`;
  try {
    const zip = await stepZip(p.sku);
    const step = zip && Object.entries(unzipSync(new Uint8Array(zip))).find(([name]) => /\.(step|stp)$/i.test(name));
    if (!step) {
      p.cad_missing = true;
      missing++;
      console.log(`${tag} no CAD model published`);
    } else {
      p.bbox_mm = measure(occt, step[1]);
      p.cad_url = STEP_URL(p.sku);
      delete p.cad_missing;
      sized++;
      console.log(`${tag} ${p.bbox_mm.join(" x ")} mm  ${p.name.slice(0, 60)}`);
    }
    await save();
  } catch (e) {
    failed++;
    console.error(`${tag} ! ${e.message}`);
  }
}
console.log(`\n${sized} sized from CAD, ${missing} without a model, ${failed} failed`);
