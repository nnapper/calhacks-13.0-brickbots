/**
 * Dev-only Vite middleware that asks Claude how to build a described robot from the parts we already have.
 * The key stays on the server (CLAUDE_API_KEY or ANTHROPIC_API_KEY in .env).
 *
 * POST /api/plan { goal, workspace: [{name}], catalog: [{sku, name, price?, category?}] }
 * -> { spec, model }
 *
 * spec.kind is "drive" (wheeled robot), "duck" (two-legged walker) or "parts" (a free list of catalog parts and custom
 * bodies). Anything Claude returns is checked here: unknown SKUs are dropped and sizes are clamped, so the browser only
 * ever sees parts that exist.
 */
import { existsSync } from 'node:fs';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
const MAX_BODY = 200_000;

const SYSTEM = [
  'You plan robot builds for a catalog of goBILDA and Pololu parts. Read the goal and choose how to build it:',
  '- kind "drive": a wheeled robot. Give wheels (2, 4 or 6), motor ("small" 24 mm Yellow Jacket, or "strong" Saturn for heavy loads), wheel ("small" 32 mm or "large" 48 mm) and arm (true to add a servo arm). These layouts are verified to fit together.',
  '- kind "duck": a two-legged walking creature (duck, biped, walker) on servo legs. Also verified to fit.',
  '- kind "parts": anything else (a drone, a tower, a gripper, a frame...). Pick parts from CATALOG by exact SKU in "subsystems", or add custom solid bodies when no catalog part fits. A custom body has an optional "shape": "box" (default), "cylinder" or "sphere"; for a cylinder or sphere lengthMm is the diameter and heightMm is a cylinder\'s thickness. A plain request for a circle, disc, cylinder, ball, cube or block is just that one body, with no robot parts.',
  'Optional "extras" adds more catalog parts to a drive or duck build (batteries, sensors, servos, controllers), each with a reason.',
  'WORKSPACE lists what is already built. A goal for a different or new thing (a car, a plane, a duck...) is designed in full as usual and is placed beside what is there. Only when the goal clearly changes the existing build ("add a battery", "give it a claw") list just the new parts, with kind "parts".',
  'A car, cart, truck, buggy, rover or any vehicle on wheels is ALWAYS kind "drive" so it gets real wheels and motors.',
  'Different goals must produce different designs. Obey exact quantities, sizes and budgets in the goal. Use exact SKUs from CATALOG only; never invent one. At most 100 parts.',
  'Respond with ONLY minified JSON: {"summary":string,"kind":"drive"|"duck"|"parts","drive":{"wheels":number,"motor":"small"|"strong","wheel":"small"|"large","arm":boolean},"extras":[{"sku":string,"qty":number,"reason":string}],"subsystems":[{"name":string,"purpose":string,"parts":[{"sku":string,"qty":number,"reason":string}],"customBodies":[{"name":string,"shape":"box"|"cylinder"|"sphere","lengthMm":number,"widthMm":number,"heightMm":number,"reason":string}]}]}.',
  'Leave "drive" out unless kind is "drive", and "subsystems" empty unless kind is "parts".',
].join(' ');

const clamp = (n, lo, hi, fallback) => (Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Number(n))) : fallback);
const text = (v, max = 200) => String(v ?? '').slice(0, max);

function extractJson(raw) {
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Brick did not return a plan.');
  return JSON.parse(raw.slice(start, end + 1));
}

// Keeps only what the app can build. Throws when nothing buildable is left.
export function sanitizeSpec(input, catalog, workspaceCount = 0) {
  const skus = new Set(catalog.map((p) => p.sku));
  const parts = (list) => (Array.isArray(list) ? list : [])
    .filter((p) => skus.has(p?.sku))
    .map((p) => ({ sku: p.sku, qty: Math.round(clamp(p.qty, 1, 100, 1)), reason: text(p.reason) }));
  const extras = parts(input.extras).slice(0, 8);
  const subsystems = (Array.isArray(input.subsystems) ? input.subsystems : []).map((s) => ({
    name: text(s?.name, 80) || 'Parts',
    purpose: text(s?.purpose, 200),
    parts: parts(s?.parts),
    customBodies: (Array.isArray(s?.customBodies) ? s.customBodies : []).slice(0, 20).map((b) => ({
      name: text(b?.name, 80) || 'Custom body',
      shape: ['cylinder', 'sphere'].includes(b?.shape) ? b.shape : 'box',
      lengthMm: clamp(b?.lengthMm, 1, 2000, 50), widthMm: clamp(b?.widthMm, 1, 2000, 50), heightMm: clamp(b?.heightMm, .5, 500, 5),
      reason: text(b?.reason),
    })),
  })).filter((s) => s.parts.length || s.customBodies.length);
  const kind = ['drive', 'duck', 'parts'].includes(input.kind) ? input.kind : 'parts';
  const spec = { summary: text(input.summary, 400), kind, extras, subsystems };
  if (kind === 'drive') {
    const d = input.drive ?? {};
    const wheels = Math.round(clamp(d.wheels, 2, 6, 4));
    spec.drive = { wheels: wheels % 2 ? wheels + 1 : wheels, motor: d.motor === 'strong' ? 'strong' : 'small', wheel: d.wheel === 'large' ? 'large' : 'small', arm: !!d.arm };
  }
  if (kind === 'parts' && !subsystems.length) {
    if (!extras.length) throw new Error('Brick found no catalog parts for this request.');
    spec.subsystems = [{ name: 'Additions', purpose: 'Parts added to the build.', parts: extras, customBodies: [] }];
    spec.extras = [];
  }
  const total = spec.subsystems.reduce((n, s) => n + s.parts.reduce((m, p) => m + p.qty, 0) + s.customBodies.length, 0) + extras.reduce((n, p) => n + p.qty, 0);
  if (total > 100) throw new Error('That build needs more than 100 parts.');
  return spec;
}

export async function planWithClaude({ goal, workspace = [], catalog, apiKey, fetchImpl = fetch, signal }) {
  if (!apiKey) throw new Error('Brick\'s planner key is not set. Add it to .env and restart.');
  const context = [
    `GOAL: ${goal}`,
    `WORKSPACE: ${workspace.length ? workspace.map((p) => text(p.name, 60)).join(' | ') : 'empty'}`,
    `CATALOG: ${catalog.map((p) => `${p.sku} = ${text(p.name, 60)} · ${text(p.category, 30) || 'part'} · ${p.price !== undefined ? `$${p.price}` : 'price n/a'}`).join(' | ')}`,
  ].join('\n');
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: SYSTEM, messages: [{ role: 'user', content: context }] }),
  });
  if (!response.ok) throw new Error(`Brick\'s planner is unavailable (HTTP ${response.status}).`);
  const reply = await response.json();
  const raw = (reply.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { spec: sanitizeSpec(extractJson(raw), catalog, workspace.length), model: MODEL };
}

const ARRANGE_SYSTEM = [
  'You arrange parts of a physical CAD design in 3D. Return a position for EVERY supplied part exactly once; never invent part ids.',
  'positionMm is the part centre in millimetres. +Y is up and the floor is y=0; sizeMm is in the part\'s own axes, so rotating it changes its height: keep the rotated lowest point at or above the floor.',
  'Make the layout recognisable as the goal: put parts that mate next to each other, keep it compact and symmetric, and leave solid parts apart (touching is fine, overlapping is not).',
  'rotationDegrees are XYZ Euler angles; prefer 0, 90, 180, 270.',
  'Respond with ONLY minified JSON: {"summary":string,"parts":[{"partId":string,"positionMm":{"x":number,"y":number,"z":number},"rotationDegrees":{"x":number,"y":number,"z":number}}]}.',
].join(' ');

export async function arrangeWithClaude({ goal, summary = '', parts, previous, issues, apiKey, fetchImpl = fetch, signal }) {
  if (!apiKey) throw new Error('Brick\'s planner key is not set. Add it to .env and restart.');
  const context = [
    `GOAL: ${text(goal, 500)}`, `SUMMARY: ${text(summary, 600)}`,
    `PARTS: ${parts.map((p) => `${p.id} · ${text(p.name, 60)} · ${Math.round(p.sizeMm.x)}x${Math.round(p.sizeMm.y)}x${Math.round(p.sizeMm.z)} mm`).join(' | ')}`,
    previous ? `PREVIOUS ATTEMPT (rejected): ${JSON.stringify(previous).slice(0, 4000)}` : '',
    issues ? `PROBLEMS TO FIX: ${text(issues, 1000)}` : '',
  ].filter(Boolean).join('\n');
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 6000, system: ARRANGE_SYSTEM, messages: [{ role: 'user', content: context }] }),
  });
  if (!response.ok) throw new Error(`Brick\'s planner is unavailable (HTTP ${response.status}).`);
  const reply = await response.json();
  const parsed = extractJson((reply.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join(''));
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const vec = (v) => ({ x: num(v?.x), y: num(v?.y), z: num(v?.z) });
  return {
    summary: text(parsed.summary, 400),
    parts: (Array.isArray(parsed.parts) ? parsed.parts : []).map((p) => ({ partId: text(p.partId, 100), positionMm: vec(p.positionMm), rotationDegrees: vec(p.rotationDegrees) })),
  };
}

async function getJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function send(response, status, value) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
}

export default function planner() {
  return {
    name: 'brickbots-plan',
    configureServer(vite) {
      vite.middlewares.use('/api/arrange', async (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST required' });
        try {
          const input = await getJson(req);
          const parts = (Array.isArray(input.parts) ? input.parts : []).slice(0, 100).filter((p) => typeof p?.id === 'string' && p.sizeMm);
          if (!parts.length) return send(res, 400, { error: 'Expected parts to arrange' });
          return send(res, 200, await arrangeWithClaude({
            goal: input.goal, summary: input.summary, parts, previous: input.previous, issues: input.issues,
            apiKey: process.env.CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY, signal: AbortSignal.timeout(40_000),
          }));
        } catch (error) {
          console.error('[arrange]', error instanceof Error ? error.message : error);
          return send(res, 502, { error: error instanceof Error ? error.message : 'Arranging failed' });
        }
      });
      vite.middlewares.use('/api/plan', async (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST required' });
        try {
          const input = await getJson(req);
          const goal = text(input.goal, 2000).trim();
          const catalog = (Array.isArray(input.catalog) ? input.catalog : []).filter((p) => typeof p?.sku === 'string').slice(0, 150);
          if (!goal || !catalog.length) return send(res, 400, { error: 'Expected a goal and a catalog' });
          // Parts with a prebuilt model load instantly; the rest need slow CAD generation, so Claude is offered those first.
          const ready = catalog.filter((p) => /^[\w-]+$/.test(p.sku) && existsSync(`public/generated/${p.sku}/model.glb`));
          if (ready.length >= 12) catalog.splice(0, catalog.length, ...ready);
          const result = await planWithClaude({
            goal, workspace: Array.isArray(input.workspace) ? input.workspace.slice(0, 100) : [], catalog,
            apiKey: process.env.CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY, signal: AbortSignal.timeout(40_000),
          });
          return send(res, 200, result);
        } catch (error) {
          console.error('[plan]', error instanceof Error ? error.message : error);
          return send(res, 502, { error: error instanceof Error ? error.message : 'Planning failed' });
        }
      });
    },
  };
}
