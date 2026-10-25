import {describe,it,expect,vi,afterEach} from 'vitest';
import {requestedCount,validatePlanCount,layoutIssues} from './ai-validation';
import {arrange} from '../../convex/gemini';
import {verify,verifyPlan} from '../../convex/anthropic';
const parts=[{id:'a',name:'Block',sizeMm:{x:100,y:20,z:30}}];
const placement={partId:'a',positionMm:{x:0,y:50,z:0},rotationDegrees:{x:0,y:0,z:90}};
const plan={summary:'three cubes',subsystems:[{name:'blocks',purpose:'shape',parts:[],customBodies:Array.from({length:3},()=>({name:'cube',lengthMm:20,widthMm:20,heightMm:20,reason:'shape'}))}],assumptions:[]};
const ctx={runQuery:vi.fn().mockResolvedValue('workspace')};
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('AI build validation',()=>{
 it('recognizes explicit counts without reading dimensions as counts',()=>{expect(requestedCount('three identical blocks in an L')).toBe(3);expect(requestedCount('a 20 mm block')).toBe(null);expect(requestedCount('exactly three 20 mm cubes')).toBe(3);});
 it('rejects too few and too many components',()=>{expect(()=>validatePlanCount('4 blocks',plan)).toThrow('exactly 4');expect(()=>validatePlanCount('two blocks',plan)).toThrow('exactly 2');expect(validatePlanCount('three blocks',plan)).toBe(3);});
 it('does not truncate counts above the old 12-part limit',()=>{const p={subsystems:[{parts:[{qty:24}],customBodies:[]}]};expect(validatePlanCount('24 parts',p)).toBe(24);});
 it('rejects missing, duplicated or invented placement ids',()=>{expect(layoutIssues(parts,[])).not.toEqual([]);expect(layoutIssues(parts,[placement,placement])).not.toEqual([]);expect(layoutIssues(parts,[{...placement,partId:'fake'}])).not.toEqual([]);});
 it('rejects intersecting solid blocks but permits touching faces',()=>{
  const blocks=[{id:'a',name:'A',solidBox:true,sizeMm:{x:20,y:20,z:20}},{id:'b',name:'B',solidBox:true,sizeMm:{x:20,y:20,z:20}}];
  const poses=[{partId:'a',positionMm:{x:0,y:10,z:0}},{partId:'b',positionMm:{x:10,y:10,z:0}}];
  expect(layoutIssues(blocks,poses)[0]).toContain('overlaps');
  poses[1].positionMm.x=20;expect(layoutIssues(blocks,poses)).toEqual([]);
 });
 it('does not assume catalog mesh bounds are solid volumes',()=>{
  expect(layoutIssues([...parts,{...parts[0],id:'b'}],[placement,{...placement,partId:'b'}])).toEqual([]);
 });
 it('uses rotated height rather than unrotated height for the floor',()=>{expect(layoutIssues(parts,[placement])).toEqual([]);expect(layoutIssues(parts,[{...placement,positionMm:{x:0,y:10,z:0}}])[0]).toContain('below the floor');});
 it('keeps the previous layout and complete reviewer feedback on retry',async()=>{
  vi.stubEnv('GEMINI_API_KEY','test');let body:any;
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{body=JSON.parse(init.body);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({summary:'fixed',parts:[placement]})}]}}]});}));
  await (arrange as any)._handler(ctx,{secret:'test',goal:'one block',summary:'block',parts,previous:{summary:'old',parts:[placement]},issues:'Move the block upward.'});
  const text=body.contents[0].parts[0].text;
  expect(text).toContain('REVIEWER ISSUES: Move the block upward.');expect(text).toContain('PREVIOUS ARRANGEMENT: [{"partId":"a"');
 });
 it('fails explicitly on Gemini quota errors without substituting another provider',async()=>{
  vi.stubEnv('GEMINI_API_KEY','test');const fetch=vi.fn(async()=>Response.json({error:{message:'quota exhausted'}},{status:429}));vi.stubGlobal('fetch',fetch);
  await expect((arrange as any)._handler(ctx,{secret:'test',goal:'one block',summary:'',parts})).rejects.toThrow('quota exhausted');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('requires Anthropic credentials for independent review',async()=>{
  vi.stubEnv('ANTHROPIC_API_KEY','');await expect((verify as any)._handler(ctx,{secret:'test',goal:'block',summary:'',parts,arrangement:{summary:'',parts:[placement]}})).rejects.toThrow('ANTHROPIC_API_KEY');
 });
 it('never treats approval with unresolved issues as approved',async()=>{
  vi.stubEnv('ANTHROPIC_API_KEY','test');vi.stubGlobal('fetch',vi.fn(async()=>Response.json({content:[{type:'text',text:JSON.stringify({approved:true,issues:['Wrong shape']})}]})));
  const result=await (verify as any)._handler(ctx,{secret:'test',goal:'block',summary:'',parts,arrangement:{summary:'',parts:[placement]}});expect(result.approved).toBe(false);
 });
 it('reviews inventory with Anthropic before materialization',async()=>{
  vi.stubEnv('ANTHROPIC_API_KEY','test');const fetch=vi.fn(async(_url:string,_init:unknown)=>Response.json({content:[{type:'text',text:'{"approved":true,"issues":[]}'}]}));vi.stubGlobal('fetch',fetch);
  expect((await (verifyPlan as any)._handler(ctx,{secret:'test',goal:'three blocks',plan})).approved).toBe(true);expect(fetch.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
 });
});
