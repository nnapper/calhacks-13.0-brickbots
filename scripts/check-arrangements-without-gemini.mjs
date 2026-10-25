// Deterministic test proposals only. Gemini is never called; Claude reviews real coordinates.
import {ConvexHttpClient} from 'convex/browser';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const client=new ConvexHttpClient(process.env.VITE_CONVEX_URL);
const secret=randomBytes(32).toString('hex');
await client.mutation('data:open',{secret});
const parts=Array.from({length:3},(_,i)=>({id:`fixture-${i}`,name:`20mm cube ${i+1}`,solidBox:true,sizeMm:{x:20,y:20,z:20}}));
const layout=coordinates=>({summary:'Deterministic test fixture — not Gemini-generated',parts:coordinates.map(([x,y,z],i)=>({partId:parts[i].id,positionMm:{x,y,z},rotationDegrees:{x:0,y:0,z:0}}))});
const cases=[
 ['L shape','Arrange exactly three cubes in an L shape on the floor, with touching faces.',layout([[0,10,0],[20,10,0],[0,10,20]]),true],
 ['tower','Stack exactly three cubes in a vertical tower with touching faces.',layout([[0,10,0],[0,30,0],[0,50,0]]),true],
 ['wrong shape','Arrange exactly three cubes in an L shape on the floor.',layout([[0,10,0],[20,10,0],[40,10,0]]),false],
 ['overlap','Arrange three cubes without overlap.',layout([[0,10,0],[0,10,0],[0,10,0]]),false],
 ['missing part','Arrange all three cubes.',layout([[0,10,0],[20,10,0]]),false],
];
for(const [name,goal,arrangement,expected] of cases){
 try{
  const verdict=await client.action('anthropic:verify',{secret,goal,summary:goal,parts,arrangement});
  assert.equal(verdict.approved,expected,`${name}: unexpected verdict`);
  console.log(JSON.stringify({test:name,passed:true,reviewer:verdict.model,issues:verdict.issues}));
 }catch(e){process.exitCode=1;console.error(JSON.stringify({test:name,passed:false,error:e.message}));}
}
