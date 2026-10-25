import {expect,it} from 'vitest';
import {parseModelJson} from '../../convex/modelJson';
it('accepts a verdict followed by explanatory prose',()=>expect(parseModelJson('{"approved":true,"issues":[]}\nThe inventory matches.')).toEqual({approved:true,issues:[]}));
it('accepts fences and braces within strings',()=>expect(parseModelJson('```json\n{"issues":["a { brace }"]}\n```')).toEqual({issues:['a { brace }']}));
it('rejects incomplete and conflicting verdicts',()=>{expect(()=>parseModelJson('{"approved":true')).toThrow();expect(()=>parseModelJson('{"approved":true} {"approved":false}')).toThrow('multiple');});
