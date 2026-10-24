// Minimal self-contained glTF 2.0 cube, independent of the STEP conversion.
import { writeFileSync } from 'node:fs';
import { BoxGeometry } from 'three';
const g = new BoxGeometry(.1,.06,.006);
const positions = Buffer.from(g.attributes.position.array.buffer);
const normals = Buffer.from(g.attributes.normal.array.buffer);
const indices = Buffer.from(g.index.array.buffer);
const binary = Buffer.concat([positions,normals,indices]);
const gltf = {asset:{version:'2.0',generator:'BuildFlow known-dimension fixture'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.65,.75,.85,1],metallicFactor:.3,roughnessFactor:.5}}],buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.length,target:34962},{buffer:0,byteOffset:positions.length,byteLength:normals.length,target:34962},{buffer:0,byteOffset:positions.length+normals.length,byteLength:indices.length,target:34963}],accessors:[{bufferView:0,componentType:5126,count:g.attributes.position.count,type:'VEC3',min:[-.05,-.03,-.003],max:[.05,.03,.003]},{bufferView:1,componentType:5126,count:g.attributes.normal.count,type:'VEC3'},{bufferView:2,componentType:5123,count:g.index.count,type:'SCALAR'}]};
const s=JSON.stringify(gltf);const json=Buffer.from(s+' '.repeat((4-s.length%4)%4));
const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+binary.length,8);
const jh=Buffer.alloc(8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
writeFileSync('public/fixtures/reference.glb',Buffer.concat([header,jh,json,bh,binary]));
