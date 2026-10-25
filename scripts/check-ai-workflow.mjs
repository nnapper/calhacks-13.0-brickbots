// Isolated live smoke test: never reads or modifies the user's saved workspace.
import {ConvexHttpClient} from 'convex/browser';
import {randomBytes} from 'node:crypto';
const client=new ConvexHttpClient(process.env.VITE_CONVEX_URL);
const secret=randomBytes(32).toString('hex');
await client.mutation('data:open',{secret});
const parts=Array.from({length:3},(_,i)=>({id:`smoke-${i}`,name:`Cube ${i+1}`,solidBox:true,sizeMm:{x:20,y:20,z:20}}));
const goal='Arrange exactly three 20 mm cubes in an L shape on the floor, touching edge-to-edge, no overlaps.';
const plan={summary:goal,assumptions:[],subsystems:[{name:'L',purpose:'shape',parts:[],customBodies:parts.map(p=>({name:p.name,lengthMm:20,widthMm:20,heightMm:20,reason:'one L block'}))}]};
for(const [name,args] of [['anthropic:verifyPlan',{secret,goal,plan}],['gemini:arrange',{secret,goal,summary:goal,parts}]]){
 try{const result=await client.action(name,args);console.log(name,JSON.stringify(result));
 if(result.arrangement)console.log('anthropic:verify',JSON.stringify(await client.action('anthropic:verify',{secret,goal,summary:goal,parts,arrangement:result.arrangement})));
 }catch(e){process.exitCode=1;console.log(name,'FAILED:',e.message);}
}
