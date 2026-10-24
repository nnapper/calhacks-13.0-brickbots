// Asks a Claude vision model to estimate hole positions from a part's product images.
// Usage: node --env-file=.env scripts/image-nodes.mjs <sku> [<sku> ...]
// Needs ANTHROPIC_API_KEY or CLAUDE_API_KEY. Writes data/nodes/<sku>.json; src/assembly/imageNodes.ts validates, snaps and converts it.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
const PROMPT = `You are reading a product image of a goBILDA part to locate its mounting holes.
If the image has a dimension drawing, use the printed dimensions, not the pixels. If it is only a photo, estimate from the
visible hole count and the 8 mm goBILDA grid, and set confidence "low".
Return JSON only: {"imageKind":"drawing"|"photo","holes":[{"uMm":number,"vMm":number,"diameterMm":number}],
"confidence":"low"|"medium"|"high","notes":string}. u is along the longest edge and v along the next longest, in mm from the
center of the large face. List each hole once. If you cannot see the holes, return an empty list.`;
const API_KEY = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY;
if (!API_KEY) { console.error('Set ANTHROPIC_API_KEY (or CLAUDE_API_KEY) in .env'); process.exit(1); }

const parts = Object.values(JSON.parse(await readFile('data/parts.json', 'utf8')));
await mkdir('data/nodes', { recursive: true });
for (const sku of process.argv.slice(2)) {
  const part = parts.find(p => p.sku === sku);
  if (!part) { console.error(`${sku}: not in catalog`); continue; }
  // Drawings carry printed dimensions, so send them first; goBILDA labels them "Schematic" in the image alt text.
  const images = (part.images ?? []).filter(i => i.local);
  const isDrawing = i => /schematic|drawing|dimension/i.test(i.alt ?? '');
  // Then plain product photos; "Product Insight" pages are marketing renders of the part in an assembly, so they go last.
  const isInsight = i => /insight/i.test(i.alt ?? '');
  const chosen = [...images.filter(isDrawing), ...images.filter(i => !isDrawing(i) && !isInsight(i)), ...images.filter(i => !isDrawing(i) && isInsight(i))].slice(0, 2);
  if (!chosen.length) { console.error(`${sku}: no local images`); continue; }
  const content = [];
  for (const image of chosen) {
    const file = `public${image.local}`;
    const media = file.endsWith('.webp') ? 'image/webp' : file.endsWith('.png') ? 'image/png' : 'image/jpeg';
    content.push({ type: 'image', source: { type: 'base64', media_type: media, data: (await readFile(file)).toString('base64') } });
  }
  content.push({ type: 'text', text: `${PROMPT}\nPart: ${part.name}\nImage kind hint: ${isDrawing(chosen[0]) ? 'the first image is a dimension drawing' : 'photos only'}` });
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content }] }),
  });
  if (!response.ok) { console.error(`${sku}: API error ${response.status} ${(await response.text()).slice(0, 200)}`); continue; }
  const reply = await response.json();
  const text = reply.content?.find(b => b.type === 'text')?.text ?? '';
  if (!text) { console.error(`${sku}: empty reply (stop_reason ${reply.stop_reason})`); continue; }
  try {
    const estimate = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    await writeFile(`data/nodes/${sku}.json`, JSON.stringify({ sku, model: MODEL, estimate }, null, 1));
    console.log(`${sku}: ${estimate.holes?.length ?? 0} holes (${estimate.imageKind}, ${estimate.confidence})`);
  } catch { console.error(`${sku}: model did not return JSON`); }
}
