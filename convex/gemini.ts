import {parseModelJson} from './modelJson';
import {action} from './_generated/server';
import {internal} from './_generated/api';
import {v} from 'convex/values';
import {z} from 'zod';

const vector = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
const arrangementSchema = z.object({
  summary: z.string().max(500).catch(''),
  parts: z.array(z.object({
    partId: z.string().min(1).max(100),
    positionMm: vector,
    rotationDegrees: vector.optional(),
  })).max(100),
});

const ARRANGE_SYSTEM = [
  'You arrange already-generated solid bodies and catalog parts for a physical CAD design.',
  'Return an arrangement for EVERY supplied part exactly once. Never invent part ids.',
  'positionMm is the center of the part in world coordinates. +Y is up and the floor is y=0, compute rotated extents from the XYZ Euler rotation, then keep the rotated lower bound at or above the floor. Supplied sizeMm is in local model axes, not already rotated.',
  'Use rotationDegrees as XYZ Euler angles. Choose 0, 90, 180, or 270 when possible unless a diagonal makes the requested shape clearer.',
  'Make the layout compact and recognizable: place mating faces near each other, align structural symmetry, avoid overlaps, and respect requested shapes.',
  'Respond with ONLY minified JSON: {"summary":string,"parts":[{"partId":string,"positionMm":{"x":number,"y":number,"z":number},"rotationDegrees":{"x":number,"y":number,"z":number}}]}.',
].join(' ');

const opSchema = z.discriminatedUnion('op', [
  z.object({op: z.literal('addPart'), sku: z.string().regex(/^[a-z0-9-]+$/i)}),
  z.object({op: z.literal('scalePart'), partId: z.string().max(64).optional(), percent: z.number().min(.1).max(100000)}),
  z.object({op: z.literal('rotatePart'), partId: z.string().max(64).optional(), axis: z.enum(['x', 'y', 'z']), degrees: z.number().finite().min(-360).max(360)}),
  z.object({op: z.literal('removePart'), partId: z.string().max(64).optional()}),
  z.object({op: z.literal('connectParts'), movingPartId: z.string().max(64), movingNodeId: z.string().max(64), targetPartId: z.string().max(64), targetNodeId: z.string().max(64)}),
  z.object({op: z.literal('generateBody'), name: z.string().max(80).optional(), lengthMm: z.number().min(1).max(2000), widthMm: z.number().min(1).max(2000), heightMm: z.number().min(.5).max(500), holeDiameterMm: z.number().min(.5).max(50).optional(), holePitchMm: z.number().min(2).max(500).optional(), holesX: z.number().int().min(0).max(24).optional(), holesY: z.number().int().min(0).max(24).optional()}),
]);

const declarations = [
  {name: 'addPart', description: 'Add a catalog part into the workspace by its exact SKU. Only use SKUs that appear in the provided catalog list.', parameters: {type: 'OBJECT', properties: {sku: {type: 'STRING', description: 'Exact catalog SKU, for example 5203-2402-0001'}}, required: ['sku']}},
  {name: 'scalePart', description: 'Uniformly rescale a part; proportions stay exact. Omit partId to use the currently selected part.', parameters: {type: 'OBJECT', properties: {partId: {type: 'STRING', description: 'Workspace part id; omit for the selected part'}, percent: {type: 'NUMBER', description: 'New size as a percent of current size, e.g. 150'}}, required: ['percent']}},
  {name: 'rotatePart', description: 'Rotate a part about the world X, Y, or Z axis in degrees. Omit partId to use the currently selected part.', parameters: {type: 'OBJECT', properties: {partId: {type: 'STRING', description: 'Workspace part id; omit for the selected part'}, axis: {type: 'STRING', description: 'x, y, or z'}, degrees: {type: 'NUMBER', description: 'Signed angle in degrees'}}, required: ['axis', 'degrees']}},
  {name: 'removePart', description: 'Remove a part from the workspace. Omit partId to use the currently selected part.', parameters: {type: 'OBJECT', properties: {partId: {type: 'STRING', description: 'Workspace part id; omit for the selected part'}}}},
  {name: 'connectParts', description: 'Snap two parts together at an attachment-node pair. Only use node ids that appear in the workspace list.', parameters: {type: 'OBJECT', properties: {movingPartId: {type: 'STRING'}, movingNodeId: {type: 'STRING'}, targetPartId: {type: 'STRING'}, targetNodeId: {type: 'STRING'}}, required: ['movingPartId', 'movingNodeId', 'targetPartId', 'targetNodeId']}},
  {name: 'generateBody', description: 'Generate a parametric solid body (for example a long mounting plate or beam) as a new STEP model with an optional through-hole grid in millimeters.', parameters: {type: 'OBJECT', properties: {name: {type: 'STRING', description: 'Short human-readable name'}, lengthMm: {type: 'NUMBER', description: 'X size in mm, 1 to 2000'}, widthMm: {type: 'NUMBER', description: 'Y size in mm, 1 to 2000'}, heightMm: {type: 'NUMBER', description: 'Z thickness in mm, 0.5 to 500'}, holeDiameterMm: {type: 'NUMBER', description: 'Optional through-hole diameter in mm'}, holePitchMm: {type: 'NUMBER', description: 'Optional hole grid spacing in mm'}, holesX: {type: 'INTEGER', description: 'Optional hole count along X'}, holesY: {type: 'INTEGER', description: 'Optional hole count along Y'}}, required: ['lengthMm', 'widthMm', 'heightMm']}},
];

const SYSTEM = [
  'You are the AI Builder inside a 3D CAD workspace for physical robotics hardware.',
  'You act through function calls and keep text replies brief (under 60 words).',
  'The user message contains WORKSPACE (parts with ids, names, scale) and CATALOG (available SKUs with names).',
  'Use addPart only with exact SKUs from CATALOG; never invent SKUs or part ids.',
  'Use generateBody for custom solid bodies such as long beams, plates, or brackets; sizes are millimeters and the optional hole grid goes through the top face.',
  'Omit partId to mean the part the user currently has selected.',
  'Issue multiple function calls in one response when a request needs several steps, in execution order.',
  'Never claim mechanical fit is verified; sizes come from geometry, not inspection.',
].join(' ');

export const assistant = action({
  args: {secret: v.string(), message: v.string(), history: v.any(), parts: v.any(), catalog: v.any()},
  handler: async (ctx, args): Promise<any> => {
    const message = z.string().min(1).max(2000).parse(args.message);
    const history = z.array(z.object({role: z.enum(['user', 'model']), text: z.string().max(4000)})).max(12).parse(args.history ?? []);
    const parts = z.array(z.object({id: z.string(), name: z.string(), scale: z.number()})).max(100).parse(args.parts ?? []);
    const catalog = z.array(z.object({sku: z.string(), name: z.string()})).max(150).parse(args.catalog ?? []);
    const workspaceId = await ctx.runQuery(internal.data.authorize, {secret: args.secret});
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('Add GEMINI_API_KEY in Convex Settings → Environment Variables');
    const revision = `assistant:${message}:${parts.map(p => p.id).join('|')}`.slice(0, 200);
    const job = await ctx.runMutation(internal.data.claim, {workspaceId, revision});
    if ('cached' in job) return {reply: '', ops: [], model: job.model, cached: true};
    let model = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
    const context = [
      `WORKSPACE: ${parts.length ? parts.map(p => `${p.id} · ${p.name.slice(0, 60)} · scale ${(p.scale * 100).toFixed(0)}%`).join(' | ') : 'empty'}`,
      `CATALOG: ${catalog.map(p => `${p.sku} = ${p.name.slice(0, 70)}`).join(' | ')}`,
      `REQUEST: ${message}`,
    ].join('\n');
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
        signal: AbortSignal.timeout(90000),
        body: JSON.stringify({
          systemInstruction: {parts: [{text: SYSTEM}]},
          contents: [...history.map(h => ({role: h.role, parts: [{text: h.text}]})), {role: 'user', parts: [{text: context}]}],
          tools: [{functionDeclarations: declarations}],
          generationConfig: {temperature: .2, maxOutputTokens: 2048},
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.error?.message ?? `Gemini failed (HTTP ${response.status})`);
      }
      const data = await response.json();
      const responseParts = data.candidates?.[0]?.content?.parts ?? [];
      let reply = '';
      const rawOps: any[] = [];
      for (const part of responseParts) {
        if (typeof part.text === 'string') reply += part.text;
        if (part.functionCall) rawOps.push({op: part.functionCall.name, ...part.functionCall.args});
      }
      const ops = rawOps.map(op => opSchema.parse(op));
      const result = {reply: reply.trim(), ops, model, cached: false};
      await ctx.runMutation(internal.data.finish, {id: job.id!, result, model});
      return result;
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'Gemini request failed';
      const text = /abort|timeout/i.test(raw) ? 'Gemini took too long to respond (overloaded). Try again in a moment.' : raw;
      await ctx.runMutation(internal.data.finish, {id: job.id!, error: text.slice(0, 250), model});
      throw new Error(text);
    }
  },
});

export const arrange = action({
  args: {
    secret: v.string(),
    goal: v.string(),
    summary: v.string(),
    parts: v.any(),
    previous: v.optional(v.any()),
    issues: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const goal = z.string().min(1).max(2000).parse(args.goal);
    const summary = z.string().max(4000).catch('').parse(args.summary);
    const issues = z.string().max(2000).catch('').parse(args.issues ?? '');
    const parts = z.array(z.object({
      id: z.string().min(1).max(100),
      name: z.string().max(160),
      solidBox: z.boolean().optional(),
      sizeMm: z.object({x: z.number().finite(), y: z.number().finite(), z: z.number().finite()}),
    })).min(1).max(100).parse(args.parts ?? []);
    const previous = z.array(z.object({
      partId: z.string().max(100),
      positionMm: vector,
      rotationDegrees: vector.optional(),
    })).max(100).catch([]).parse(Array.isArray(args.previous) ? args.previous : args.previous?.parts ?? []);
    await ctx.runQuery(internal.data.authorize, {secret: args.secret});
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('Add GEMINI_API_KEY in Convex Settings → Environment Variables');
    let model = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
    const expected = new Set(parts.map(p => p.id));
    const context = [
      `GOAL: ${goal}`,
      `DESIGN PLAN: ${summary}`,
      `PARTS: ${parts.map(p => `${p.id} | ${p.name.slice(0, 70)} | sizeMm ${p.sizeMm.x.toFixed(1)},${p.sizeMm.y.toFixed(1)},${p.sizeMm.z.toFixed(1)}`).join('\n')}`,
      ...(previous.length ? [`PREVIOUS ARRANGEMENT: ${JSON.stringify(previous)}`] : []),
      `REVIEWER ISSUES: ${issues || 'none'}`,
    ].join('\n');
    try {
      let raw = '';
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
          signal: AbortSignal.timeout(90000),
          body: JSON.stringify({
            systemInstruction: {parts: [{text: ARRANGE_SYSTEM}]},
            contents: [{role: 'user', parts: [{text: context}]}],
            generationConfig: {temperature: .1, maxOutputTokens: 16000, responseMimeType: 'application/json'},
          }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail?.error?.message ?? `Gemini arrangement failed (HTTP ${response.status})`);
        }
        const data = await response.json();
        raw = (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();
        if (!raw) throw new Error('Gemini returned no arrangement');
      } catch (error) {
        throw error; // Arrangement must be generated by Gemini; do not silently substitute providers.
      }
      const parsed = arrangementSchema.parse(parseModelJson(raw));
      const ids = parsed.parts.map(p => p.partId);
      if (ids.length !== expected.size || !ids.every(id => expected.has(id)) || new Set(ids).size !== ids.length) {
        throw new Error('The arrangement did not include every generated part exactly once');
      }
      return {arrangement: parsed, model, cached: false};
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'Gemini arrangement failed';
      const text = /abort|timeout/i.test(raw) ? 'Gemini took too long to arrange the parts.' : raw;
      throw new Error(text);
    }
  },
});
