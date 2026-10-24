import { z } from 'zod';
const vec=z.tuple([z.number().finite(),z.number().finite(),z.number().finite()]);
export const connectorSchema=z.object({
 id:z.string(),geometryRevision:z.string(),kind:z.enum(['surface','hole']),position:vec,normal:vec,tangent:vec,
 label:z.string().max(120),reason:z.string().max(600),review:z.enum(['suggested','accepted','rejected']),
 method:z.enum(['step_analytic','mesh_planar','name_grid','image_drawing','image_photo']),diameterM:z.number().positive().optional(),areaM2:z.number().positive().optional(),
 aiSelected:z.boolean().optional(),aiReason:z.string().max(600).optional(),
});
export type Connector=z.infer<typeof connectorSchema>;
export const analysisSchema=z.object({geometryRevision:z.string(),candidates:z.array(connectorSchema).max(64),engine:z.string(),units:z.literal('meter')});
export const suggestionSchema=z.object({selections:z.array(z.object({candidateId:z.string(),label:z.string().max(120),reason:z.string().max(600)})).max(24)});
export function applySuggestions(nodes:Connector[], response:unknown):Connector[]{
 const parsed=suggestionSchema.parse(response); const valid=new Set(nodes.map(n=>n.id));
 if(parsed.selections.some(s=>!valid.has(s.candidateId)))throw new Error('AI returned an unknown candidate ID; suggestions were rejected.');
 if(new Set(parsed.selections.map(s=>s.candidateId)).size!==parsed.selections.length)throw new Error('AI returned duplicate candidate IDs.');
 return nodes.map(n=>{const suggestion=parsed.selections.find(s=>s.candidateId===n.id);return {...n,aiSelected:!!suggestion,...(suggestion?{label:suggestion.label,aiReason:suggestion.reason}:{})};});
}
