import {it,expect} from 'vitest';
import {workspaceMetrics} from './workspace-metrics';
const part=(id,sku)=>({id,model:{triangles:120,asset:{name:id,productId:sku,bounds:{min:[0,0,0],max:[.1,.02,.03]}}}});
const catalog={motor:{sku:'motor',price:12,offers:[{}]}};
it('empty workspace has no sample parts or money',()=>{expect(workspaceMetrics([],[],catalog)).toMatchObject({count:0,total:0,pricedCount:0,connections:0,triangles:0,build:{}});});
it('counts actual instances, partial prices and valid connections',()=>{const result=workspaceMetrics([part('a','motor'),part('b','motor'),part('c')],[{movingId:'a',targetId:'b'},{movingId:'a',targetId:'missing'}],catalog);expect(result).toMatchObject({count:3,total:24,pricedCount:2,unpricedCount:1,triangles:360,connections:1,build:{motor:2}});expect(result.rows[2].price).toBeNull();expect(result.rows[0].dimensions).toEqual([100,20,30]);});
it('removing an instance removes its cost and geometry metrics',()=>{expect(workspaceMetrics([part('b')],[],catalog)).toMatchObject({count:1,total:0,triangles:120,pricedCount:0});});
