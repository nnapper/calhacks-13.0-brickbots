// Free, local post-processing of data/parts.json (no API credits).
//
//   node scripts/enrich.mjs dims      fill missing dimensions_mm from sizes stated in the name/specs
//   node scripts/enrich.mjs images    download images to public/parts/ and add images[].local
//
// Both are re-runnable.

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

const FILE = "data/parts.json";
const parts = JSON.parse(await readFile(FILE, "utf8"));
const save = () => writeFile(FILE, JSON.stringify(parts, null, 2));
const hasDims = (p) => p.dimensions_mm && Object.values(p.dimensions_mm).some((v) => v != null);

// ---------- dims ----------

// text that talks about accessories rather than the part itself
const NOISE = /^for \d|compatib|wire|cable|screw|washer|hardware|nut\b|pitch|tooth|spline|deadband|thread/i;
const N = "(\\d+(?:\\.\\d+)?)";

function parseDims(p) {
  const texts = [p.name, ...(p.specs ?? [])].filter((t) => t && !NOISE.test(t));
  const found = {};
  const take = (key, re) => {
    if (found[key] != null) return;
    for (const t of texts) {
      const m = t.match(re);
      if (m) return void (found[key] = Number(m[1]));
    }
  };
  take("diameter", new RegExp(`${N}\\s*mm\\s*(?:outer\\s*|overall\\s*|hub clearance\\s*)?diameter`, "i"));
  take("diameter", new RegExp(`diameter\\s*[:|]?\\s*${N}\\s*mm`, "i"));
  take("diameter", new RegExp(`[⌀Ø]\\s*${N}\\s*mm`, "i"));
  take("length", new RegExp(`${N}\\s*mm\\s*(?:overall\\s*)?length`, "i"));
  take("length", new RegExp(`length\\s*[:|]?\\s*${N}\\s*mm`, "i"));
  take("width", new RegExp(`${N}\\s*mm\\s*(?:overall\\s*)?width`, "i"));
  take("width", new RegExp(`width\\s*[:|]?\\s*${N}\\s*mm`, "i"));
  take("height", new RegExp(`${N}\\s*mm\\s*(?:overall\\s*)?(?:height|thick)`, "i"));
  take("height", new RegExp(`(?:height|thickness)\\s*[:|]?\\s*${N}\\s*mm`, "i"));
  return found;
}

function dims() {
  let filled = 0;
  let still = 0;
  for (const p of Object.values(parts)) {
    if (hasDims(p)) continue;
    const found = parseDims(p);
    if (Object.keys(found).length) {
      p.dimensions_mm = {
        length: null, width: null, height: null, diameter: null,
        shaft_diameter: null, bore_diameter: null,
        ...p.dimensions_mm,
        ...found,
      };
      p.dimensions_source = "parsed-from-page-text";
      filled++;
    } else {
      p.needs_dimensions = true;
      still++;
    }
  }
  const total = Object.keys(parts).length;
  console.log(`filled ${filled}; ${still} still unknown (flagged needs_dimensions); ${total - still} of ${total} have dimensions`);
}

// ---------- images ----------

const EXT = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif", "image/svg+xml": ".svg" };

async function exists(f) {
  try {
    await access(f);
    return true;
  } catch {
    return false;
  }
}

async function images() {
  const dir = "public/parts";
  await mkdir(dir, { recursive: true });
  const jobs = [];
  for (const p of Object.values(parts)) (p.images ?? []).forEach((img, i) => jobs.push({ p, img, i }));

  let ok = 0;
  let failed = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < jobs.length) {
        const { p, img, i } = jobs[next++];
        if (img.local && (await exists(img.local.replace(/^\//, "public/")))) {
          ok++;
          continue;
        }
        try {
          const res = await fetch(img.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ext = EXT[res.headers.get("content-type")?.split(";")[0]] ?? path.extname(new URL(img.url).pathname) ?? ".png";
          const name = `${(p.sku ?? "part").replace(/[^\w-]/g, "_")}-${i}${ext}`;
          await writeFile(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
          img.local = `/parts/${name}`;
          ok++;
        } catch (e) {
          failed++;
          console.error(`  ! ${p.sku} ${img.url}: ${e.message}`);
        }
      }
    }),
  );
  await save();
  console.log(`${ok} images saved in ${dir}/, ${failed} failed`);
}

const cmd = process.argv[2];
if (cmd === "dims") {
  dims();
  await save();
} else if (cmd === "images") await images();
else console.error("Usage: enrich.mjs dims|images");
