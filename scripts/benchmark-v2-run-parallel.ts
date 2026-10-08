import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {TASKS,BENCHMARK_VERSION,type Task} from '../packages/benchmark-v2/catalog';
import {AnswerSchema,type Bundle,type Attempt} from '../packages/benchmark-v2/scoring';
import {freezeManifest,runCase,assess,writeJSON,sha} from './benchmark-v2-engine';
import {callModel,CANDIDATES,providerInventory} from './benchmark-v2-providers';
import {promptFor} from './benchmark-v2-prompts';

const missingOnly=<T>(fallback:T)=>(error:NodeJS.ErrnoException):T=>{if(error.code==='ENOENT')return fallback;throw error;};
const root=path.resolve('artifacts/scoring-v2');
await mkdir(root,{recursive:true});
const selected=process.argv.find(a=>a.startsWith('--model='))?.slice(8);
if(!selected||!CANDIDATES.includes(selected))throw Error('并发恢复必须明确 --model=候选模型');
const model:string=selected;
const width=Math.max(1,Math.min(3,Number(process.argv.find(a=>a.startsWith('--parallel='))?.slice(11)??3)));
const ledger:any[]=await readFile(path.join(root,'ledger.json'),'utf8').then(JSON.parse).catch(missingOnly([]));
const manifest=await freezeManifest(root);
const pilot=JSON.parse(await readFile(path.join(root,'pilot.json'),'utf8'));
if(!pilot.some((p:any)=>p.model===model&&p.available))throw Error('模型尚未通过试跑');
const providers=await providerInventory();
const bundleFile=path.join(root,'bundle.json');
const bundle:Bundle=await readFile(bundleFile,'utf8').then(JSON.parse);
if(bundle.manifest.hash!==manifest.hash)throw Error('不能混合不同冻结清单');
await writeJSON(path.join(root,'checkpoints','before-parallel-resume-'+Date.now()+'.json'),bundle);
bundle.attempts=bundle.attempts.filter(a=>!(a.model===model&&a.status==='infrastructure_error'&&!a.answer));
bundle.version=BENCHMARK_VERSION;bundle.ledger=ledger;bundle.models=CANDIDATES;bundle.providers=[...providers,...pilot];

let persistTail=Promise.resolve();
function persist(){
  persistTail=persistTail.then(async()=>{await writeJSON(path.join(root,'ledger.json'),ledger);await writeJSON(bundleFile,bundle);});
  return persistTail;
}
let stopped=false;
async function executeTask(task:Task){
 for(const round of [1,2] as const){
  if(stopped)return;
  const first=bundle.attempts.find(a=>a.model===model&&a.taskId===task.id&&a.round===1);
  if(round===2&&(!first||first.status==='infrastructure_error'||(first.cases.length===task.cases.length&&first.cases.every(c=>c.passed))))break;
  if(bundle.attempts.some(a=>a.model===model&&a.taskId===task.id&&a.round===round))continue;
  const id=model+'-'+task.id+'-'+round;
  const attempt:Attempt={id,taskId:task.id,model,round,status:'infrastructure_error',cases:[],call:{}};
  try{
   let prompt=await promptFor(task);
   if(round===2){const previous=first!.answer?JSON.stringify(first!.answer):(first!.rawSubmission??'No parseable previous submission');prompt+='\nPrevious submission:\n'+previous+'\nActual feedback:\n'+JSON.stringify(first!.cases.map(c=>({id:c.id,passed:c.passed,completion:c.completion,reason:c.reason,checks:c.checks})))+'\n'+(first!.error??'')+'\nYou have one revision. Return the same JSON format.';}
   const response=await callModel(model,prompt,root,id+'-'+Date.now(),ledger,pilot.find((p:any)=>p.model===model)?.metadata?.route??'go');
   attempt.call=response.metadata;
   try{attempt.answer=AnswerSchema.parse(JSON.parse(response.content.replace(/^```(?:json)?\s*|\s*```$/g,'')));}
   catch(e){attempt.status='submission_error';attempt.rawSubmission=response.content.slice(0,100000);attempt.error='Invalid submission JSON: '+String(e);}
   if(attempt.answer){
    attempt.sourceHash=sha(attempt.answer.source);attempt.status='evaluated';
    for(const spec of task.cases){
     const file='runs/'+id+'/'+spec.id.replaceAll('/','-')+'.json';
     const run=await runCase(task,spec,attempt.answer.source);await writeJSON(path.join(root,file),run);
     attempt.cases.push(assess(task,spec,run,manifest.references[spec.id].primary,file));
    }
   }
  }catch(error){
   attempt.status='infrastructure_error';attempt.error=String(error);
   attempt.call=ledger.at(-1)?.id?.startsWith(id)?{...ledger.at(-1),evidence:'calls/'+ledger.at(-1).id}:{};
   if(/quota_exhausted|HTTP 401|HTTP 429|预算|预留边界/.test(attempt.error??''))stopped=true;
  }
  bundle.attempts.push(attempt);await persist();
  console.log(model+' '+task.id+' round '+round+' '+attempt.status+' '+attempt.cases.filter(c=>c.passed).length+'/'+task.cases.length);
 }
}

const pending=TASKS.filter(task=>{
 const first=bundle.attempts.find(a=>a.model===model&&a.taskId===task.id&&a.round===1);
 if(!first)return true;
 const needsRevision=first.status!=='infrastructure_error'&&!(first.cases.length===task.cases.length&&first.cases.every(c=>c.passed));
 return needsRevision&&!bundle.attempts.some(a=>a.model===model&&a.taskId===task.id&&a.round===2);
});
let cursor=0;
async function worker(){while(!stopped){const index=cursor++;if(index>=pending.length)return;await executeTask(pending[index]);}}
await Promise.all(Array.from({length:width},()=>worker()));
await persistTail;await persist();
if(stopped)throw Error('并发测试因基础设施或预算边界停止');
console.log('Parallel evaluation finished; manual reviews remain pending.');
