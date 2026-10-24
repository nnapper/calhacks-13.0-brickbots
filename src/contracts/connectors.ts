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
const pairSchema=z.object({movingPartId:z.string(),movingNodeId:z.string(),targetPartId:z.string(),targetNodeId:z.string(),reason:z.string().max(600)});
export const pairSuggestionSchema=z.object({pairs:z.array(pairSchema).max(12)});
export type PairSuggestion=z.infer<typeof pairSuggestionSchema>;
// Diameter tolerance mirrors compatible() in assembly/snapping so hallucinated pairs
// are dropped before they can reach the client.
export function validatePairSuggestions(parts:{partId:string;nodes:Connector[]}[],response:unknown):PairSuggestion['pairs']{
 const parsed=pairSuggestionSchema.parse(response);
 const byPart=new Map(parts.map(p=>[p.partId,p.nodes]));
 const used=new Set<string>();
 return parsed.pairs.map(pair=>{
  const moving=byPart.get(pair.movingPartId),target=byPart.get(pair.targetPartId);
  if(!moving||!target||pair.movingPartId===pair.targetPartId)throw new Error('AI returned an unknown part pairing; suggestions were rejected.');
  const a=moving.find(n=>n.id===pair.movingNodeId),b=target.find(n=>n.id===pair.targetNodeId);
  if(!a||!b)throw new Error('AI returned an unknown node ID; suggestions were rejected.');
  if(used.has(pair.movingPartId+':'+pair.movingNodeId)||used.has(pair.targetPartId+':'+pair.targetNodeId))throw new Error('AI reused a node across pairs; suggestions were rejected.');
  if(a.kind!==b.kind)throw new Error('AI paired mismatched node types; suggestions were rejected.');
  if(a.kind==='hole'&&(a.diameterM===undefined||b.diameterM===undefined||Math.abs(a.diameterM-b.diameterM)>Math.max(.0001,Math.min(a.diameterM,b.diameterM)*.02)))throw new Error('AI paired holes with mismatched diameters; suggestions were rejected.');
  used.add(pair.movingPartId+':'+pair.movingNodeId);used.add(pair.targetPartId+':'+pair.targetNodeId);
  return pair;
 });
}
