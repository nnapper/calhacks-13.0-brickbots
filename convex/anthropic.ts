import {parseModelJson} from './modelJson';
import {validatePlanCount, layoutIssues} from '../src/assembly/ai-validation';
import {action} from './_generated/server';
import {internal} from './_generated/api';
import {v} from 'convex/values';
import {z} from 'zod';

// Reject invalid geometry and quantities rather than silently changing the requested design.
const text = z.string().default('');
const mm = (lo: number, hi: number, fallback: number) => z.number().finite().min(lo).max(hi);
const bodySpec = z.object({
  name: text,
  lengthMm: mm(1, 2000, 100),
  widthMm: mm(1, 2000, 50),
  heightMm: mm(.5, 500, 5),
  holeDiameterMm: mm(.5, 50, 8).optional(),
  holePitchMm: mm(2, 500, 16).optional(),
  holesX: z.number().int().min(0).max(24).optional(),
  holesY: z.number().int().min(0).max(24).optional(),
  reason: text,
});

const planSchema = z.object({
  summary: text,
  assumptions: z.array(z.object({label: text, value: text})).default([]),
  subsystems: z.array(z.object({
    name: text,
    purpose: text,
    parts: z.array(z.object({sku: text, qty: z.number().int().min(1).max(100), reason: text})).default([]),
    customBodies: z.array(bodySpec).default([]),
  })).default([]),
});

const SYSTEM = [
  'You are the design planner inside a 3D CAD workspace for physical hardware. The user gives a goal, often vague (e.g. "drone").',
  'Infer the most plausible conventional design for it: state your engineering assumptions as label/value pairs (payload mass, thrust per rotor, arm length, battery mass...), then decompose the build into subsystems (frame/structure, propulsion, power, control, payload, fasteners...).',
  'For each subsystem, either pick parts from CATALOG (exact SKU only, with quantity and a one-line reason) or commission a custom parametric solid body with dimensions in millimeters and an optional through-hole grid.',
  'CATALOG entries include name, price, dimensions and weight: prefer common, popular, cost-effective choices, respect any budget in the goal, and keep the total build plausible for the stated payload.',
  'If the user gives an exact quantity or exact part name, obey it exactly: do not add supporting parts, custom bodies, or alternate SKUs unless explicitly requested.',
  'Never invent SKUs. Use only as many subsystems as needed. For requests for N blocks, create exactly N simple custom boxes, not a robotics bill of materials. Do not add accessories. Maximum 100 total new parts; reject larger requests rather than truncating.',
  'Respond with ONLY minified JSON, no markdown: {"summary":string,"assumptions":[{"label":string,"value":string}],"subsystems":[{"name":string,"purpose":string,"parts":[{"sku":string,"qty":number,"reason":string}],"customBodies":[{"name":string,"lengthMm":number,"widthMm":number,"heightMm":number,"holeDiameterMm":number,"holePitchMm":number,"holesX":number,"holesY":number,"reason":string}]}]}. Optional fields may be omitted.',
].join(' ');

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
const verdictSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string().max(300)).max(8).default([]),
});

const VERIFY_SYSTEM = [
  'You are a skeptical mechanical arrangement reviewer for a physical CAD assembly.',
  'Approve only when part positions and rotations plausibly express the requested shape, keep the assembly compact, put mating features near each other, and avoid obvious overlap.',
  'Check that every supplied part is arranged once, that Y is up, and that the ROTATED bounding box stays above the floor (rotation changes world height).',
  'Do not approve merely because the plan is conceptually good; review the actual coordinates.',
  'Return ONLY minified JSON: {"approved":boolean,"issues":[string]}. Use concrete, short issues. If approved, issues must be empty.',
].join(' ');

export const plan = action({
  args: {secret: v.string(), goal: v.string(), parts: v.any(), catalog: v.any()},
  handler: async (ctx, args): Promise<any> => {
    const goal = z.string().min(1).max(2000).parse(args.goal);
    const parts = z.array(z.object({id: z.string(), name: z.string(), scale: z.number()})).max(100).parse(args.parts ?? []);
    const catalog = z.array(z.object({sku: z.string(), name: z.string(), price: z.number().optional(), dims: z.string().optional(), weightG: z.number().optional(), category: z.string().optional()})).max(150).parse(args.catalog ?? []);
    const workspaceId = await ctx.runQuery(internal.data.authorize, {secret: args.secret});
    if(!process.env.ANTHROPIC_API_KEY)throw new Error('ANTHROPIC_API_KEY is required to verify this build. Configure it in this Convex deployment before planning.');
    const revision = `plan:v3:${await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({goal,parts,catalog}))).then(b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join(''))}`;
    const job = await ctx.runMutation(internal.data.claim, {workspaceId, revision});
    if ('cached' in job) return {plan: job.cached.plan, model: job.cached.model ?? job.model, cached: true};
    const context = [
      `GOAL: ${goal}`,
      `WORKSPACE: ${parts.length ? parts.map(p => `${p.id} · ${p.name.slice(0, 60)} · scale ${(p.scale * 100).toFixed(0)}%`).join(' | ') : 'empty'}`,
      `CATALOG: ${catalog.map(p => `${p.sku} = ${p.name.slice(0, 60)} · ${p.category?.slice(0, 30) ?? 'part'} · ${p.price !== undefined ? `$${p.price}` : 'price n/a'} · ${p.dims ?? 'dims n/a'} · ${p.weightG !== undefined ? `${p.weightG} g` : 'weight n/a'}`).join(' | ')}`,
    ].join('\n');
    let model = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
    try {
      let raw = '';
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) throw new Error('Add GEMINI_API_KEY in Convex Settings → Environment Variables');
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'x-goog-api-key': geminiKey},
            signal: AbortSignal.timeout(120000),
            body: JSON.stringify({systemInstruction: {parts: [{text: SYSTEM}]}, contents: [{role: 'user', parts: [{text: context}]}], generationConfig: {temperature: .1, maxOutputTokens: 16000, responseMimeType: 'application/json'}}),
          });
          if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            throw new Error(detail?.error?.message ?? `Gemini planner failed (HTTP ${response.status})`);
          }
          const data = await response.json();
          raw = (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();
          if (!raw) throw new Error('The planner returned no plan');
        } catch (error) {
          throw error;
        }
      if (!raw) throw new Error('The planner returned no plan');
      const json = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const parsedPlan = planSchema.parse(parseModelJson(raw));
      const parsed = {...parsedPlan, subsystems: parsedPlan.subsystems
        .map(s => ({...s, parts: s.parts.filter(p => p.sku), customBodies: s.customBodies}))
        .filter(s => s.parts.length || s.customBodies.length)};
      if (!parsed.subsystems.length) throw new Error('The plan contained no buildable parts — add more context like size, budget, or purpose.');
      validatePlanCount(goal,parsed);
      const total = parsed.subsystems.reduce((n,s)=>n+s.parts.reduce((sum,p)=>sum+p.qty,0)+s.customBodies.length,0);
      if(total>100) throw new Error('Plan exceeds 100 parts; please request a smaller build.');
      const skus=new Set(catalog.map(p=>p.sku));
      if(parsed.subsystems.some(s=>s.parts.some(p=>!skus.has(p.sku)))) throw new Error('Planner returned an unknown catalog SKU. No parts were added.');
      const result = {plan: parsed, model, cached: false};
      await ctx.runMutation(internal.data.finish, {id: job.id!, result, model});
      return result;
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Claude request failed';
      await ctx.runMutation(internal.data.finish, {id: job.id!, error: text.slice(0, 250), model});
      throw new Error(text);
    }
  },
});

export const verify = action({
  args: {secret: v.string(), goal: v.string(), summary: v.string(), arrangement: v.any(), parts: v.any()},
  handler: async (ctx, args): Promise<any> => {
    const goal = z.string().min(1).max(2000).parse(args.goal);
    const summary = z.string().max(4000).catch('').parse(args.summary);
    const arrangement = arrangementSchema.parse(args.arrangement ?? {});
    const parts = z.array(z.object({
      id: z.string().min(1).max(100),
      name: z.string().max(160),
      solidBox: z.boolean().optional(),
      sizeMm: z.object({x: z.number().finite(), y: z.number().finite(), z: z.number().finite()}),
    })).min(1).max(100).parse(args.parts ?? []);
    await ctx.runQuery(internal.data.authorize, {secret: args.secret});
    const geometryIssues=layoutIssues(parts, arrangement.parts);
    if(geometryIssues.length) return {approved:false,issues:geometryIssues,model:'geometry-validation'};
    const expected = new Set(parts.map(p => p.id));
    const ids = arrangement.parts.map(p => p.partId);
    if (ids.length !== expected.size || !ids.every(id => expected.has(id)) || new Set(ids).size !== ids.length) {
      return {approved: false, issues: ['The proposal must place every supplied part exactly once.'], model: 'local-validation'};
    }
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) throw new Error('Independent verification requires ANTHROPIC_API_KEY in Convex. No layout was approved.');
    const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
    const context = [
      `GOAL: ${goal}`,
      `DESIGN PLAN: ${summary}`,
      `PARTS: ${parts.map(p => `${p.id} | ${p.name.slice(0, 70)} | sizeMm ${p.sizeMm.x.toFixed(1)},${p.sizeMm.y.toFixed(1)},${p.sizeMm.z.toFixed(1)}`).join('\n')}`,
      `ARRANGEMENT: ${JSON.stringify(arrangement)}`,
    ].join('\n');
    try {
      let raw = '';
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'x-api-key': anthropicKey!, 'anthropic-version': '2023-06-01'},
          signal: AbortSignal.timeout(90000),
          body: JSON.stringify({model, max_tokens: 1200, temperature: 0, system: VERIFY_SYSTEM, messages: [{role: 'user', content: context}]}),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail?.error?.message ?? `Anthropic verification failed (HTTP ${response.status})`);
        }
        const data = await response.json();
        raw = (data.content ?? []).map((c: any) => c.text ?? '').join('').trim();
      if (!raw) throw new Error('The verifier returned no verdict');
      const verdict = verdictSchema.parse(parseModelJson(raw));
      if (verdict.approved && verdict.issues.length) return {...verdict, approved: false, model};
      return {...verdict, model};
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'Arrangement verification failed';
      throw new Error(/abort|timeout/i.test(raw) ? 'Arrangement verification timed out.' : raw);
    }
  },
});

export const verifyPlan = action({
 args:{secret:v.string(),goal:v.string(),plan:v.any()},
 handler:async(ctx,args):Promise<any>=>{
  await ctx.runQuery(internal.data.authorize,{secret:args.secret});
  const plan=planSchema.parse(args.plan);validatePlanCount(args.goal,plan);
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key)throw new Error('ANTHROPIC_API_KEY is required for independent verification. No parts were added.');
  const model=process.env.ANTHROPIC_MODEL??'claude-sonnet-4-5';
  const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},signal:AbortSignal.timeout(90000),body:JSON.stringify({model,max_tokens:1800,temperature:0,system:'Review the requested CAD build against the proposed part inventory. Reject incorrect quantities, extra accessories not requested, missing parts, or dimensions that cannot express the requested shape. Exact quantities are mandatory. This is a visual design review, not engineering certification. Return only JSON {"approved":boolean,"issues":[string]}.',messages:[{role:'user',content:JSON.stringify({goal:args.goal,plan})}]})});
  if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail?.error?.message??`Anthropic inventory review failed (HTTP ${response.status})`);}
  const data=await response.json();const raw=data.content.filter((p:any)=>p.type==='text').map((p:any)=>p.text).join('');
  const verdict=verdictSchema.parse(parseModelJson(raw));
  return {...verdict,approved:verdict.approved&&verdict.issues.length===0,model};
 }
});
