import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {TASKS,BENCHMARK_VERSION,type Task} from '../packages/benchmark-v2/catalog';
import {AnswerSchema,type Bundle,type Attempt} from '../packages/benchmark-v2/scoring';
import {CROP_CONTENT,TECH_BY_ID,RECIPE_BY_ID} from '../packages/garden/content';
import {CHALLENGE_BY_ID} from '../packages/garden/challenges';
import {freshGarden} from '../packages/garden/core';
import {freezeManifest,runCase,assess,writeJSON,sha} from './benchmark-v2-engine';
import {callModel,CANDIDATES,providerInventory} from './benchmark-v2-providers';
const missingOnly=<T>(fallback:T)=>(error:NodeJS.ErrnoException):T=>{if(error.code==='ENOENT')return fallback;throw error;};
const root=path.resolve('artifacts/scoring-v2');await mkdir(root,{recursive:true});
const ledger:any[]=await readFile(path.join(root,'ledger.json'),'utf8').then(JSON.parse).catch(missingOnly([]));
const providers=await providerInventory();await writeJSON(path.join(root,'providers.json'),providers);
const outputInstruction='Return ONLY one JSON object with string fields source, strategy, correctness, complexity, boundaries. source is executable synchronous JavaScript, no async/await, no imports, no external tools. The other fields are concise algorithm summaries, not private chain-of-thought. Do not use tools or read files.';
const LESSON_LIMITS:Record<string,string>={
 'lesson-condition':'Hard check: finish within 50 ticks.',
 'lesson-wait':'Hard check: finish within 180 ticks.',
 'lesson-memory':'Hard check: harvest exactly two mature crops, print 2 as the final log, and finish within 60 ticks.',
 'lesson-path':'Hard check: use no more than 15 move calls.',
 'lesson-schedule':'Hard check: harvest all 16 crops with no wait() calls and finish within 560 ticks.'
};
const pilotFile=path.join(root,'pilot.json');
if(process.argv.includes('--pilot')){
 const rows:any[]=[];const requested=process.argv.find(a=>a.startsWith('--model='))?.slice(8);if(requested&&!CANDIDATES.includes(requested))throw Error('未知模型');
 for(const model of (requested?[requested]:CANDIDATES)){try{const r=await callModel(model,outputInstruction+'\nPilot: Write a program that moves one cell east using move(East).',root,'pilot-'+model+'-'+Date.now(),ledger,process.argv.includes('--deepseek-only')?'deepseek':'go');const answer=AnswerSchema.parse(JSON.parse(r.content.replace(/^```(?:json)?\s*|\s*```$/g,'')));const task=TASKS.find(t=>t.id==='lesson-position')!;const run=await runCase(task,task.cases[0],answer.source);rows.push({model,available:true,metadata:r.metadata,pilotReason:run.result.reason});}catch(error){rows.push({model,available:false,error:String(error)});}console.log('pilot '+model+' '+rows.at(-1)!.available);}
 const old=await readFile(pilotFile,'utf8').then(JSON.parse).catch(missingOnly([]));await writeJSON(pilotFile,[...old.filter((p:any)=>!rows.some(r=>r.model===p.model)),...rows]);
}else{
 const manifest=await freezeManifest(root);const pilot=JSON.parse(await readFile(pilotFile,'utf8'));
 const paused=await readFile(path.join(root,'paused-models.json'),'utf8').then(JSON.parse).catch(missingOnly({}));
 const resume=process.argv.includes('--resume-infrastructure');
 const selected=process.argv.find(a=>a.startsWith('--model='))?.slice(8);
 if(resume){if(!selected||!CANDIDATES.includes(selected))throw Error('恢复时必须明确 --model=候选模型');delete paused[selected];await writeJSON(path.join(root,'paused-models.json'),paused);}
 const models=pilot.filter((p:any)=>p.available&&!paused[p.model]&&(!selected||p.model===selected)).map((p:any)=>p.model) as string[];
 const bundleFile=path.join(root,'bundle.json');
 const previous:Bundle|undefined=await readFile(bundleFile,'utf8').then(JSON.parse).catch(missingOnly(undefined));
 if(previous&&previous.manifest.hash!==manifest.hash)throw Error('不能混合不同冻结清单');
 const bundle:Bundle=previous??{version:BENCHMARK_VERSION,manifest,models:CANDIDATES,attempts:[],reviews:[],ledger,providers:[...providers,...pilot]};bundle.ledger=ledger;bundle.models=CANDIDATES;bundle.providers=[...providers,...pilot,{paused}];
 if(resume){await writeJSON(path.join(root,'checkpoints','before-resume-'+Date.now()+'.json'),bundle);bundle.attempts=bundle.attempts.filter(a=>!(a.model===selected&&a.status==='infrastructure_error'&&!a.answer));await writeJSON(bundleFile,bundle);}
 async function promptFor(task:Task){
  let guide='';
  if(task.module==='sort'){guide=(await readFile('docs/RULES_API.md','utf8')).split('人工参考解')[0];}
  else{
   const spec=task.cases[0],initial=spec.initial??freshGarden(spec.config);
   guide=`get_size() gives open extent, get_position() returns {x,y}; move(North/South/East/West) returns boolean, no wrapping. till(), plant(crop), water(), harvest(), clear(), repair(), refill(), fertilize(), wait(ticks:1..100), craft(recipe,amount), research(id), inspect(), get_inventory(), get_progress(). Crop names are lowercase strings. inspect() returns crop,ready,trait,damaged,growth,water. get_inventory() returns direct resource fields. All calls synchronous.\n`;
   guide+=`Fleet: every drone runs same program, independent variables, shared inventory/time. get_drone_id(), get_drone_count(), get_time(), read_shared(key), write_shared(key,value), compare_exchange(key,expected,value) returns {exchanged,value}, barrier(name) must be reached by all deployed drones. Legacy directions are constants; crops can use strings.\n`;
   guide+='Starting resources: '+JSON.stringify({...initial.inventory,...initial.economy?.stock})+'; unlocked research: '+JSON.stringify(initial.economy?.unlocks)+'\n';
   guide+='Crop rules: '+JSON.stringify(CROP_CONTENT)+'\nRecipes: '+JSON.stringify(RECIPE_BY_ID)+'\nResearch: '+JSON.stringify(TECH_BY_ID)+'\n';
   if(task.module==='challenge')guide+='Allowed APIs (plus fleet APIs when deployed): '+CHALLENGE_BY_ID[task.id].allowed.join(',')+'\nsense() reveals local exits and loot only, collect() takes key/relic; key unlocks gates. swap(direction) exchanges adjacent crop traits. Cactus harvest succeeds as an entire connected mature component only when all rows/columns are nondecreasing; pumpkin at even x,y merges mature 2x2.\n';
  }
  return outputInstruction+'\nTask: '+task.name+'\n'+task.description+'\n'+(LESSON_LIMITS[task.id]??'')+'\n'+guide+'\nEvaluation: same source tested on fixed undisclosed seeds; do not hardcode the map. Configurations: '+JSON.stringify(task.cases.map(c=>({size:c.config.size,budget:c.config.budget,drones:c.config.drones??1})))+'\nSupply a self-contained solution and concise design explanation.';
 }
 modelLoop: for(const model of models)for(const task of TASKS){
  for(const round of [1,2] as const){
   const first=bundle.attempts.find(a=>a.model===model&&a.taskId===task.id&&a.round===1);
   if(round===2&&(!first||first.status==='infrastructure_error'||first.cases.length===task.cases.length&&first.cases.every(c=>c.passed)))break;
   if(bundle.attempts.some(a=>a.model===model&&a.taskId===task.id&&a.round===round))continue;
   const id=model+'-'+task.id+'-'+round;
   const attempt:Attempt={id,taskId:task.id,model,round,status:'infrastructure_error',cases:[],call:{}};
   try{
    let prompt=await promptFor(task);
    if(round===2){const previous=first!.answer?JSON.stringify(first!.answer):(first!.rawSubmission??'No parseable previous submission');prompt+='\nPrevious submission:\n'+previous+'\nActual feedback:\n'+JSON.stringify(first!.cases.map(c=>({id:c.id,passed:c.passed,completion:c.completion,reason:c.reason,checks:c.checks})))+'\n'+(first!.error??'')+'\nYou have one revision. Return the same JSON format.';}
    const response=await callModel(model,prompt,root,id+'-'+Date.now(),ledger,pilot.find((p:any)=>p.model===model)?.metadata?.route??'go');attempt.call=response.metadata;
    try{attempt.answer=AnswerSchema.parse(JSON.parse(response.content.replace(/^```(?:json)?\s*|\s*```$/g,'')));}catch(e){attempt.status='submission_error';attempt.rawSubmission=response.content.slice(0,100000);attempt.error='Invalid submission JSON: '+String(e);}
    if(attempt.answer){
     attempt.sourceHash=sha(attempt.answer.source);attempt.status='evaluated';
     for(const spec of task.cases){const file='runs/'+id+'/'+spec.id.replaceAll('/','-')+'.json';const run=await runCase(task,spec,attempt.answer.source);await writeJSON(path.join(root,file),run);attempt.cases.push(assess(task,spec,run,manifest.references[spec.id].primary,file));}
    }
   }catch(error){attempt.status='infrastructure_error';attempt.error=String(error);attempt.call=ledger.at(-1)?.id?.startsWith(id)?{...ledger.at(-1),evidence:'calls/'+ledger.at(-1).id}:{};}
   bundle.attempts.push(attempt);await writeJSON(bundleFile,bundle);console.log(model+' '+task.id+' round '+round+' '+attempt.status+' '+attempt.cases.filter(c=>c.passed).length+'/'+task.cases.length);
   if(attempt.status==='infrastructure_error'&&/quota_exhausted|HTTP 401|HTTP 429/.test(attempt.error??'')){paused[model]={reason:attempt.error};await writeJSON(path.join(root,'paused-models.json'),paused);continue modelLoop;}
   if(attempt.error?.includes('预算')||attempt.error?.includes('预留边界'))throw Error(attempt.error);
  }
 }
 await writeJSON(bundleFile,bundle);
 console.log('Evaluation finished; manual reviews remain pending.');
}
