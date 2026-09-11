import {assess} from '../packages/benchmark-v2/evaluate';
export {assess} from '../packages/benchmark-v2/evaluate';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {TASKS,BENCHMARK_VERSION,type Task,type CaseSpec} from '../packages/benchmark-v2/catalog';
import {gradeCase,type Manifest} from '../packages/benchmark-v2/scoring';
import {executeGarden} from '../packages/garden/runner';
import {validateGardenRun} from '../packages/garden/core';
import {evaluateChallenge} from '../packages/garden/challenges';
import {gradeLesson} from '../packages/garden/lessons';
import {execute} from '../packages/runner';
import {validateRun} from '../packages/recording';
import {VERSION,canonical} from '../packages/protocol';
import {challengeSource} from '../packages/garden/challenge-examples';
import {LESSON_SOLUTIONS} from './lesson-solutions';
export const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export async function writeJSON(file:string,data:unknown){await mkdir(path.dirname(file),{recursive:true});const temp=file+'.tmp-'+randomUUID();await writeFile(temp,JSON.stringify(data,null,2));await rename(temp,file);}
export async function runCase(task:Task,spec:CaseSpec,source:string){
 if(task.module==='sort')return validateRun(await execute({protocolVersion:VERSION,runId:randomUUID(),source,label:'benchmark-v2',attempt:1,config:spec.config}));
 return validateGardenRun(await executeGarden({runId:randomUUID(),source,config:spec.config,...(spec.initial?{initial:spec.initial}:{})},{wallMs:35000}));
}
export async function freezeManifest(root:string):Promise<Manifest>{
 const file=path.join(root,'manifest.json');
 try{const existing=JSON.parse(await readFile(file,'utf8'));const {hash,...body}=existing;if(hash!==sha(canonical(body))||canonical(body.tasks)!==canonical(TASKS))throw Error('冻结清单不匹配');return existing;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const references:Manifest['references']={};
 for(const task of TASKS){
  const sources=task.module==='challenge'?['baseline','improved'].map(v=>challengeSource(task.id,v as 'baseline'|'improved')):task.module==='lesson'?[LESSON_SOLUTIONS[task.id.slice(7)]]:await Promise.all(['reference','cached-insertion'].map(n=>readFile(`examples/${n}.js`,'utf8')));
  for(const spec of task.cases){
   let best:any;
   for(const source of sources){const run=await runCase(task,spec,source);const result=assess(task,spec,run,1,'reference');if(result.passed&&(!best||result.primary<best.primary))best={run,source,primary:result.primary};}
   if(!best)throw Error('无有效参考：'+spec.id);
   const relative='references/'+spec.id.replaceAll('/','-')+'.json';const data=JSON.stringify(best.run);await mkdir(path.join(root,'references'),{recursive:true});await writeFile(path.join(root,relative),data);
   references[spec.id]={primary:best.primary,sourceHash:sha(best.source),recordHash:sha(data),file:relative};
  }
  console.log('reference '+task.id);
 }
 const body={version:BENCHMARK_VERSION as typeof BENCHMARK_VERSION,frozenAt:new Date().toISOString(),tasks:TASKS,references};const manifest={...body,hash:sha(canonical(body))};await writeJSON(file,manifest);return manifest;
}
if(process.argv.includes('--freeze'))await freezeManifest(path.resolve('artifacts/scoring-v2'));
