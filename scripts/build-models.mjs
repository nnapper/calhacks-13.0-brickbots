// Pre-builds CAD prototypes for every catalog part so the app never waits on generation.
//
//   npm run models:build                 build all eligible parts that have no model yet
//   npm run models:build -- --force      rebuild everything
//   npm run models:build -- --limit 5    only attempt the first 5 missing parts
//   npm run models:build -- --jobs 4     parallel generations (default 3)
//   npm run models:build -- --list       show what would be built and exit
//
// Safe to stop and re-run: finished parts are skipped. Needs the geometry service
// (npm run dev, or npm run geometry) and CLAUDE_API_KEY. Each part costs two Claude calls.
import {spawn} from 'node:child_process';
import {readFile, writeFile, readdir, access, mkdir} from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : fallback; };
const OUT = path.join('public', 'generated');
const parts = Object.values(JSON.parse(await readFile('data/parts.json', 'utf8')));

const hasImages = part => (part.images ?? []).some(image => image.local);
const hasDims = part => Object.values(part.dimensions_mm ?? {}).some(v => typeof v === 'number' && v > 0);
const exists = file => access(file).then(() => true, () => false);
const eligible = parts.filter(part => hasImages(part) && hasDims(part));

const todo = [];
for (const part of eligible) {
  if (!flag('force') && await exists(path.join(OUT, part.sku, 'manifest.json'))) continue;
  todo.push(part);
}
const queue = todo.slice(0, value('limit', todo.length));
console.log(`${parts.length} parts · ${eligible.length} eligible (images + dimensions) · ${eligible.length - todo.length} already built · ${queue.length} to build`);
if (flag('list')) { for (const part of queue) console.log(`  ${part.sku}  ${part.name}`); process.exit(0); }

function build(sku) {
  return new Promise(resolve => {
    const child = spawn('node', ['--env-file-if-exists=.env', '--env-file-if-exists=.env.local', 'scripts/generate-model.mjs', sku], {stdio: ['ignore', 'pipe', 'pipe']});
    let log = '';
    child.stdout.on('data', chunk => { log += chunk; });
    child.stderr.on('data', chunk => { log += chunk; });
    child.on('exit', code => resolve({sku, ok: code === 0, log}));
  });
}

const failed = [];
let done = 0;
async function worker() {
  while (queue.length) {
    const part = queue.shift();
    const result = await build(part.sku);
    done += 1;
    if (result.ok) console.log(`[${done}/${todo.length}] built  ${part.sku}  ${part.name}`);
    else {
      failed.push(part.sku);
      const reason = result.log.trim().split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 220);
      console.log(`[${done}/${todo.length}] FAILED ${part.sku}  ${part.name}\n    ${reason}`);
    }
  }
}
await Promise.all(Array.from({length: Math.max(1, value('jobs', 3))}, worker));

// The index maps each SKU to its prototype files so the app and teammates can see what is ready.
await mkdir(OUT, {recursive: true});
const index = {};
for (const dir of await readdir(OUT, {withFileTypes: true})) {
  if (!dir.isDirectory()) continue;
  try {
    const manifest = JSON.parse(await readFile(path.join(OUT, dir.name, 'manifest.json'), 'utf8'));
    index[dir.name] = {
      name: manifest.product.name,
      step: `/generated/${dir.name}/model.step`,
      glb: `/generated/${dir.name}/model.glb`,
      confidence: `${manifest.generation.analysisConfidence}/${manifest.generation.codeConfidence}`,
      status: manifest.status,
    };
  } catch {}
}
await writeFile(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`\nIndex: ${Object.keys(index).length} models ready in ${path.join(OUT, 'index.json')}`);
if (failed.length) console.log(`Failed (${failed.length}): ${failed.join(', ')} — re-run to retry them`);
