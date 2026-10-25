// Extract one complete JSON object while respecting braces inside JSON strings.
// Providers sometimes wrap a valid structured answer in prose or a code fence.
export function parseModelJson(raw:string):unknown {
 const start=raw.indexOf('{');
 if(start<0)throw new Error('The model returned no JSON object');
 let depth=0,quoted=false,escaped=false;
 for(let i=start;i<raw.length;i++){
  const c=raw[i];
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;continue;}
  if(c==='{')depth++;
  if(c==='}'&&--depth===0){
   if(raw.slice(i+1).includes('{'))throw new Error('The model returned multiple JSON objects; no verdict accepted');
   return JSON.parse(raw.slice(start,i+1));
  }
 }
 throw new Error('The model returned incomplete JSON');
}
