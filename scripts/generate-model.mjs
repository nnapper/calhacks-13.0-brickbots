// Converts a scraped catalog product into a prototype CAD model.
//
//   node --env-file-if-exists=.env.local scripts/generate-model.mjs <sku> [<sku> ...]
//   node --env-file-if-exists=.env.local scripts/generate-model.mjs --dry-run <sku>
//
// Claude Vision receives local product images and scraped dimensions. Its output is
// treated as data: the CadQuery source is AST-reviewed before execution and exported
// to STEP/GLB. Generated models are visual/mechanical prototypes, not manufacturer CAD.
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skus = args.filter(arg => !arg.startsWith('--'));
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
const API_KEY = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY;
const GEOMETRY_URL = process.env.BUILDFLOW_GEOMETRY_URL ?? 'http://127.0.0.1:8001';

const analysisPrompt = `You are analyzing one robotics component from product images for a CAD assembly prototype.
Use printed dimensions in a drawing or schematic when visible. Do not infer features that are not visible or stated.
Return ONLY JSON with this exact shape:
{"partType":"flat_plate|bracket|wheel|gear|motor|block|other",
"summary":string,
"boundsMm":{"x":number,"y":number,"z":number},
"holes":[{"axis":"x|y|z","diameterMm":number,"positionsMm":[[number,number,number]],"through":boolean}],
"mountingSurfaces":[{"axis":"x|y|z","offsetMm":number,"description":string}],
"confidence":"low|medium|high","notes":string}
Use millimeters. Center the bounding box description on the part; do not state vendor colors, logos, threads, or hidden internals.`;

const codePrompt = `Write a compact CadQuery 2.8 Python program for the analyzed component.
Rules:
- Assign the final shape to a variable named part.
- Use only the pre-imported cq object and the pre-imported math module. No imports, I/O, reflection, or exports.
- Use millimeters. Center X and Z at 0 and put the bottom of the part at Y=0.
- Prefer simple manufacturable primitives and cut only clearly visible/stated holes.
- Do not model logos, labels, threads, fillets that are not visible, or decorative detail.
- If a feature is uncertain, omit it and record a warning.
Return ONLY JSON: {"cadquery":string,"shapeSummary":string,"confidence":"low|medium|high","warnings":[string]}`;

function isDrawing(image) { return /schematic|drawing|dimension/i.test(image.alt ?? ''); }
function isInsight(image) { return /insight/i.test(image.alt ?? ''); }
function mime(file) { return file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg'; }
function extractJson(text) { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); }
function hash(buffer) { return createHash('sha256').update(buffer).digest('hex'); }

function chooseImages(part) {
  const images = (part.images ?? []).filter(image => image.local);
  return [
    ...images.filter(isDrawing),
    ...images.filter(image => !isDrawing(image) && !isInsight(image)),
    ...images.filter(image => !isDrawing(image) && isInsight(image)),
  ].slice(0, 3);
}

function expectedDimensions(part) {
  return Object.values(part.dimensions_mm ?? {}).filter(value => typeof value === 'number' && value > 0);
}

async function callClaude(part, images, prompt, context) {
  if (!API_KEY) throw new Error('Set ANTHROPIC_API_KEY (or CLAUDE_API_KEY) in .env.local');
  const content = [];
  for (const image of images) {
    const file = path.join('public', image.local);
    content.push({type: 'image', source: {type: 'base64', media_type: mime(file), data: (await readFile(file)).toString('base64')}});
  }
  content.push({type: 'text', text: `${prompt}\n\n${context}`});
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(120_000),
    headers: {'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
    body: JSON.stringify({model: MODEL, max_tokens: 8000, messages: [{role: 'user', content}]}),
  });
  if (!response.ok) throw new Error(`Claude API failed (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`);
  const reply = await response.json();
  const text = reply.content?.find(block => block.type === 'text')?.text ?? '';
  if (!text) throw new Error(`Claude returned no text (stop_reason ${reply.stop_reason})`);
  try { return extractJson(text); }
  catch (error) { throw new Error(`Claude did not return valid JSON: ${error.message}`); }
}

function validateAnalysis(analysis) {
  if (!analysis || !['flat_plate', 'bracket', 'wheel', 'gear', 'motor', 'block', 'other'].includes(analysis.partType)) throw new Error('Claude returned an invalid part type');
  if (!analysis.boundsMm || !Object.values(analysis.boundsMm).every(value => typeof value === 'number' && value > 0)) throw new Error('Claude returned invalid bounds');
  for (const hole of analysis.holes ?? []) {
    if (!['x', 'y', 'z'].includes(hole.axis) || typeof hole.diameterMm !== 'number' || !Array.isArray(hole.positionsMm)) throw new Error('Claude returned an invalid hole');
  }
  if (!['low', 'medium', 'high'].includes(analysis.confidence)) throw new Error('Claude returned invalid confidence');
  return analysis;
}

function validateCodeResult(result) {
  if (typeof result.cadquery !== 'string' || !result.cadquery.includes('part')) throw new Error('Claude returned no CadQuery program');
  if (!['low', 'medium', 'high'].includes(result.confidence)) throw new Error('Claude returned invalid generation confidence');
  return {shapeSummary: result.shapeSummary ?? '', confidence: result.confidence, warnings: result.warnings ?? [], cadquery: result.cadquery};
}

async function analyzeStep(stepPath, stepFile) {
  const form = new FormData();
  form.append('file', new File([await readFile(stepFile)], stepFile, {type: 'application/step'}));
  const response = await fetch(`${GEOMETRY_URL}/analyze`, {method: 'POST', body: form, signal: AbortSignal.timeout(60_000)});
  const detail = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenCascade verification failed: ${detail.detail ?? response.status}`);
  if (!Array.isArray(detail.candidates) || !detail.candidates.length) throw new Error('OpenCascade found no attachment candidates');
  await writeFile(path.join(stepPath, 'analysis.json'), JSON.stringify(detail, null, 2) + '\n');
  return detail.candidates;
}

if (!skus.length) {
  const parts = Object.values(JSON.parse(await readFile('data/parts.json', 'utf8')));
  console.log('Available SKUs with dimensions and local images:');
  for (const part of parts.filter(part => expectedDimensions(part).length && chooseImages(part).length).slice(0, 30)) {
    console.log(`  ${part.sku}  ${part.name}`);
  }
  process.exit(0);
}

const parts = Object.values(JSON.parse(await readFile('data/parts.json', 'utf8')));
for (const sku of skus) {
  const part = parts.find(item => item.sku === sku);
  if (!part) throw new Error(`${sku} is not in data/parts.json`);
  const images = chooseImages(part);
  const expected = expectedDimensions(part);
  if (!images.length) throw new Error(`${sku} has no local images`);
  if (!expected.length) throw new Error(`${sku} has no scraped dimensions`);

  const out = path.join('public', 'generated', sku);
  await mkdir(out, {recursive: true});
  const context = JSON.stringify({
    name: part.name, sku: part.sku, category: part.category, description: part.description,
    specs: part.specs ?? [], dimensions_mm: part.dimensions_mm, sourceUrl: part.url, dimensionsAreUnverified: true,
  }, null, 2);

  if (dryRun) {
    console.log(`Dry run for ${sku}\nImages: ${images.map(image => image.local).join(', ')}\nDimensions: ${expected.join(' × ')} mm\nPrompt: ${analysisPrompt}`);
    continue;
  }

  console.log(`${sku}: analyzing ${images.length} product images with ${MODEL}`);
  const analysis = validateAnalysis(await callClaude(part, images, analysisPrompt, context));
  await writeFile(path.join(out, 'claude-analysis.json'), JSON.stringify(analysis, null, 2) + '\n');

  console.log(`${sku}: generating CadQuery from verified dimensions and image analysis`);
  const codeResult = validateCodeResult(await callClaude(part, images.slice(0, 1), codePrompt, context + `\n\nImage analysis JSON:\n${JSON.stringify(analysis, null, 2)}`));
  await writeFile(path.join(out, 'claude-code.json'), JSON.stringify(codeResult, null, 2) + '\n');
  await writeFile(path.join(out, 'model.py'), codeResult.cadquery);

  const request = {name: part.name, sku: part.sku, category: part.category, sourceUrl: part.url, expectedDimensionsMm: expected, units: 'millimeter'};
  await writeFile(path.join(out, 'request.json'), JSON.stringify(request, null, 2) + '\n');
  console.log(`${sku}: rendering STEP and GLB`);
  const render = spawnSync('.venv/bin/python', [
    'scripts/render-generated-model.py',
    '--code', path.join(out, 'model.py'),
    '--request', path.join(out, 'request.json'),
    '--step', path.join(out, 'model.step'),
    '--stl', path.join(out, 'model.stl'),
    '--glb', path.join(out, 'model.glb'),
    '--report', path.join(out, 'render.json'),
  ], {encoding: 'utf8', timeout: 180_000});
  if (render.status !== 0) throw new Error(`CadQuery renderer failed:\n${render.stdout ?? ''}\n${render.stderr ?? ''}`);

  console.log(`${sku}: verifying attachment candidates with OpenCascade`);
  const candidates = await analyzeStep(out, path.join(out, 'model.step'));
  const stepBytes = await readFile(path.join(out, 'model.step'));
  const manifest = {
    schemaVersion: 1,
    product: {name: part.name, sku: part.sku, retailer: part.retailer, url: part.url},
    generation: {provider: 'anthropic', model: MODEL, analysisConfidence: analysis.confidence, codeConfidence: codeResult.confidence, warnings: [...analysis.notes ? [analysis.notes] : [], ...codeResult.warnings]},
    geometry: JSON.parse(await readFile(path.join(out, 'render.json'), 'utf8')),
    artifacts: {step: 'model.step', glb: 'model.glb', stepSha256: hash(stepBytes)},
    verification: {service: GEOMETRY_URL, candidateCount: candidates.length},
    status: 'prototype_unverified',
  };
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${sku}: ${candidates.length} snap candidates · confidence ${analysis.confidence}/${codeResult.confidence} · output in ${out}`);
}
