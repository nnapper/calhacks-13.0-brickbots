import {ConvexReactClient} from 'convex/react';
import {api} from '../../convex/_generated/api';
import type {PartInstance,Mate} from '../assembly/snapping';
import type {LoadedModel} from '../cad/import';
import type {Connector} from '../contracts/connectors';
const url=import.meta.env.VITE_CONVEX_URL;
export const cloud=url?new ConvexReactClient(url):null;
export {api};
export function workspaceSecret(){let key=localStorage.getItem('buildflow.workspace');if(!key){key=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem('buildflow.workspace',key);}return key;}
export async function saveWorkspace(parts:PartInstance[],mates:Mate[],sources:Map<string,LoadedModel>,revision:number){
 if(!cloud)throw new Error('Convex URL is not configured');const secret=workspaceSecret();await cloud.mutation(api.data.open,{secret});
 const unique=new Map<string,LoadedModel>();for(const source of sources.values())unique.set(source.asset.id,source);for(const p of parts)if(!unique.has(p.model.asset.id))unique.set(p.model.asset.id,p.model);
 const records=[];
 for(const model of unique.values()){
  if(!model.storageId){const url=await cloud.mutation(api.data.uploadUrl,{secret});const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:model.original});if(!response.ok)throw new Error('Original model upload failed');const {storageId}=await response.json();await cloud.mutation(api.data.attachFile,{secret,storageId});model.storageId=storageId;}
  records.push({sourceId:model.asset.id,asset:model.asset,storageId:model.storageId!,connectors:model.connectors??[],...(model.geometryRevision?{geometryRevision:model.geometryRevision}:{})});
 }
 const snapshot={sources:records,parts:parts.map(p=>({id:p.id,sourceId:p.model.asset.id,scale:p.scale??1,position:p.position,quaternion:p.quaternion??[0,0,0,1]})),mates:mates.filter(m=>m.movingNodeId&&m.targetNodeId).map(m=>({movingId:m.movingId,targetId:m.targetId,movingNodeId:m.movingNodeId!,targetNodeId:m.targetNodeId!}))};
 return await cloud.mutation(api.data.save,{secret,expectedRevision:revision,snapshot});
}
export async function suggestNodes(model:LoadedModel){if(!cloud)throw new Error('Convex is not configured');return cloud.action(api.bitdeer.suggest,{secret:workspaceSecret(),name:model.asset.name,revision:model.geometryRevision!,candidates:model.connectors as Connector[]});}
export async function suggestPairings(parts:PartInstance[]){if(!cloud)throw new Error('Convex is not configured');return cloud.action(api.bitdeer.suggestPairs,{secret:workspaceSecret(),parts:parts.filter(p=>p.model.connectors?.length&&p.model.geometryRevision).map(p=>({partId:p.id,name:p.model.asset.name,nodes:p.model.connectors!}))});}
export async function askAssistant(message:string,history:{role:'user'|'model';text:string}[],parts:{id:string;name:string;scale:number}[],catalog:{sku:string;name:string}[]){if(!cloud)throw new Error('Convex is not configured');return cloud.action(api.gemini.assistant,{secret:workspaceSecret(),message,history,parts,catalog});}
export async function askPlanner(goal:string,parts:{id:string;name:string;scale:number}[],catalog:{sku:string;name:string;price?:number;dims?:string;weightG?:number;category?:string}[]){if(!cloud)throw new Error('Convex is not configured');return cloud.action(api.anthropic.plan,{secret:workspaceSecret(),goal,parts,catalog});}
export async function askArrangement(input:{goal:string;summary:string;parts:{id:string;name:string;sizeMm:{x:number;y:number;z:number}}[];previous?:unknown;issues?:string}){
  if(!cloud)throw new Error('Convex is not configured');
  return cloud.action(api.gemini.arrange,{...input,secret:workspaceSecret()});
}
export async function verifyArrangement(input:{goal:string;summary:string;arrangement:unknown;parts:{id:string;name:string;sizeMm:{x:number;y:number;z:number}}[]}){
  if(!cloud)throw new Error('Convex is not configured');
  return cloud.action(api.anthropic.verify,{...input,secret:workspaceSecret()});
}

export async function verifyPlan(goal:string,plan:unknown){if(!cloud)throw new Error("Convex is not configured");return cloud.action(api.anthropic.verifyPlan,{secret:workspaceSecret(),goal,plan});}

// Claude plans the build through the dev server, which holds the API key. It decides how to build and which catalog parts to use.
export type ClaudeSpec={summary:string;kind:'drive'|'duck'|'parts';drive?:{wheels:number;motor:'small'|'strong';wheel:'small'|'large';arm:boolean};extras:{sku:string;qty:number;reason:string}[];subsystems:any[]};
export async function askClaudePlan(goal:string,workspace:{name:string}[],catalog:{sku:string;name:string;price?:number;category?:string}[],signal?:AbortSignal):Promise<{spec:ClaudeSpec;model:string}>{
 const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal,workspace,catalog}),signal});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error??`Planner failed (HTTP ${response.status})`);
 return data;
}
export async function askClaudeArrangement(input:{goal:string;summary:string;parts:{id:string;name:string;sizeMm:{x:number;y:number;z:number}}[];previous?:unknown;issues?:string},signal?:AbortSignal):Promise<{summary:string;parts:any[]}>{
 const response=await fetch('/api/arrange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error??`Arrangement failed (HTTP ${response.status})`);
 return data;
}
