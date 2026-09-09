import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),asar=require('../node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar');
const archive=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
const sha=data=>createHash('sha256').update(data).digest('hex');
const files=[];
async function visit(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await visit(file);else files.push(file);}}
for(const root of ['dist','examples','scenarios'])await visit(root);
const checked=[];
for(const file of files){const local=await readFile(file),packed=asar.extractFile(archive,path.normalize(file));assert.equal(sha(packed),sha(local),file);checked.push({path:file,bytes:local.length,sha256:sha(local)});}
const local=JSON.parse(await readFile('package.json','utf8')),packed=JSON.parse(asar.extractFile(archive,'package.json').toString());
for(const key of ['name','version','main','dependencies'])assert.deepEqual(packed[key],local[key],key);
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,JSON.stringify({pass:true,at:new Date().toISOString(),archive,sha256:sha(await readFile(archive)),version:packed.version,files:checked},null,2));
console.log(JSON.stringify({pass:true,version:packed.version,files:checked.length}));
