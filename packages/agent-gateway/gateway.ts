import {readFile,writeFile,mkdir,unlink,copyFile,cp,readdir,rename,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {z} from 'zod';
import {TASKS,type Task} from '../benchmark-v2/catalog';
import {AnswerSchema,leaderboard,exportCSV,validateReview,type Attempt,type Bundle,type Manifest} from '../benchmark-v2/scoring';
import {canonical} from '../protocol';
import {runCase,assess,sha,writeJSON,freezeManifest} from '../../scripts/benchmark-v2-engine';
import {promptFor} from '../../scripts/benchmark-v2-prompts';

export const GATEWAY_VERSION='farm-agent-session-v1';
export const instructions=`使用当前 Agent 参加 FARM100：调用 farm100_start 并如实填写 agent、model、reasoning（不知道的字段省略），保存 sessionId。循环调用 farm100_next，独立完成该题，使用 farm100_submit 提交原始 JSON 文本，字段为 source、strategy、correctness、complexity、boundaries。source 必须是同步 JavaScript。只通过 FARM100 工具领取题目、提交答案和读取反馈；不要读项目源码、参考答案或旧成绩，不调用其他模型。每题首次失败后最多一次修订，由服务端决定。grading 时每隔约 5 秒查询 status；基础设施失败使用 resume，只重跑已提交答案。next 返回 complete 后调用 export，报告覆盖率、客观成绩、设计评审待完成及证据路径。不要自行补齐未知模型身份、Token 或费用。此为 Agent 会话测试，与历史独立模型调用榜分开。`;
const identity=z.object({agent:z.string().trim().min(1).max(60),model:z.string().trim().min(1).max(80).optional(),reasoning:z.string().trim().min(1).max(40).optional(),tasks:z.array(z.string()).min(1).max(31).optional()}).strict();
type Ticket={id:string;taskId:string;round:1|2;prompt:string;issuedAt:string};
type Job={ticket:Ticket;raw:string;hash:string;status:'queued'|'grading'|'error';attempt:Attempt;error?:string};
type Session={version:typeof GATEWAY_VERSION;id:string;createdAt:string;participant:z.infer<typeof identity>;manifestHash:string;promptsHash:string;taskIds:string[];ticket?:Ticket;job?:Job;attempts:Attempt[]};
type Reference={manifest:Manifest;prompts:Record<string,string>;promptsHash:string};
const now=()=>new Date().toISOString();
const existsError=(e:unknown,code:string)=>(e as NodeJS.ErrnoException).code===code;
export function alive(pid:number){try{process.kill(pid,0);return true;}catch(e){return existsError(e,'EPERM');}}

/** Cross-process exclusion. Never steal a lock held by a live process. */
export async function locked<T>(file:string,fn:()=>Promise<T>):Promise<T>{
 await mkdir(path.dirname(file),{recursive:true});
 const owner={pid:process.pid,token:randomUUID()};
 for(let retry=0;;retry++){
  try{await writeFile(file,JSON.stringify(owner),{flag:'wx'});break;}
  catch(e){
   if(!existsError(e,'EEXIST'))throw e;
   let old:{pid:number;token:string};
   try{old=JSON.parse(await readFile(file,'utf8'));}catch{if(retry<100){await new Promise(r=>setTimeout(r,20));continue;}throw Error('会话正在写入，请稍后重试');}
   if(!Number.isInteger(old.pid)||alive(old.pid)){if(retry<100){await new Promise(r=>setTimeout(r,20));continue;}throw Error('会话忙，请稍后重试');}
   // Serialize stale-lock reclamation independently from live lock acquisition.
   // The exclusive recovery claim stays only for this synchronous reclamation.
   const recovery=file+'.recover';
   try{await writeFile(recovery,JSON.stringify(owner),{flag:'wx'});}catch(e){
    if(!existsError(e,'EEXIST'))throw e;
    const recovering=JSON.parse(await readFile(recovery,'utf8'));
    if(!alive(recovering.pid))await unlink(recovery).catch(()=>{});
    if(retry>=100)throw Error('会话锁恢复忙');await new Promise(r=>setTimeout(r,20));continue;
   }
   try{
    const latest=JSON.parse(await readFile(file,'utf8'));
    if(latest.token===old.token&&!alive(latest.pid))await unlink(file);
   }catch(e){if(!existsError(e,'ENOENT'))throw e;}finally{await unlink(recovery);}
  }
 }
 try{return await fn();}finally{
  const current=JSON.parse(await readFile(file,'utf8'));
  if(current.token!==owner.token)throw Error('锁所有者变化');
  await unlink(file);
 }
}

export class Gateway {
 readonly root:string;
 readonly referenceDir:string;
 constructor(readonly repo:string,root?:string){this.root=path.resolve(root??path.join(repo,'artifacts/agent-gateway'));this.referenceDir=path.join(this.root,'reference');}
 dir(id:string){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error('非法 sessionId');return path.join(this.root,'sessions',id);}
 async prepare(){
  return locked(path.join(this.root,'prepare.lock'),async()=>{
   // Existing frozen v2 evidence is reused, never overwritten or merged with new sessions.
   const source=path.join(this.repo,'artifacts/scoring-v2');
   const manifest=await freezeManifest(source);
   const prompts:Record<string,string>={};
   for(const t of TASKS){
    prompts[t.id]=(await promptFor(t)).replace('Do not use tools or read files.','Use only the FARM100 gateway tools to submit your answer and obtain permitted feedback; do not read files or use other tools.')+'\nGateway clarification: collect() takes no arguments. Your answer must be one JSON object with the five required string fields.';
    for(const spec of t.cases){
     const ref=manifest.references[spec.id],text=await readFile(path.join(source,ref.file),'utf8');
     if(sha(text)!==ref.recordHash)throw Error('参考记录哈希不匹配：'+spec.id);
     const run=JSON.parse(text),score=assess(t,spec,run,ref.primary,ref.file);
     if(sha(run.source)!==ref.sourceHash||!score.passed||score.primary!==ref.primary)throw Error('参考记录无效：'+spec.id);
    }
   }
   const prepared:Reference={manifest,prompts,promptsHash:sha(canonical(prompts))};
   try{
    const old:Reference=JSON.parse(await readFile(path.join(this.referenceDir,'index.json'),'utf8'));
    if(old.manifest.hash!==manifest.hash||old.promptsHash!==prepared.promptsHash)throw Error('题面或清单变化，请使用新的 --root，不得改写已有会话规则');
   }catch(e){if(!existsError(e,'ENOENT'))throw e;}
   for(const ref of Object.values(manifest.references)){const dest=path.join(this.referenceDir,ref.file);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(source,ref.file),dest);}
   await writeJSON(path.join(this.referenceDir,'index.json'),prepared);
   return {ready:true,version:GATEWAY_VERSION,tasks:TASKS.length,cases:TASKS.flatMap(t=>t.cases).length,manifestHash:manifest.hash,promptsHash:prepared.promptsHash};
  });
 }
 async reference():Promise<Reference>{
  let r:Reference;
  try{r=JSON.parse(await readFile(path.join(this.referenceDir,'index.json'),'utf8'));}catch(e){if(existsError(e,'ENOENT'))throw Error('请先由宿主执行 node scripts/farm100-agent.mjs prepare');throw e;}
  const {hash,...body}=r.manifest;
  if(hash!==sha(canonical(body))||canonical(body.tasks)!==canonical(TASKS)||r.promptsHash!==sha(canonical(r.prompts)))throw Error('冻结规则或题面不匹配');
  return r;
 }
 async load(id:string):Promise<Session>{
  const s:Session=JSON.parse(await readFile(path.join(this.dir(id),'session.json'),'utf8'));
  const r=await this.reference();
  if(s.id!==id||s.version!==GATEWAY_VERSION||s.manifestHash!==r.manifest.hash||s.promptsHash!==r.promptsHash)throw Error('会话版本不匹配');
  return s;
 }
 async save(s:Session){await writeJSON(path.join(this.dir(s.id),'session.json'),s);}
 async start(input:unknown){
  const participant=identity.parse(input),ref=await this.reference();
  const taskIds=participant.tasks??TASKS.map(t=>t.id);
  if(new Set(taskIds).size!==taskIds.length||taskIds.some(id=>!TASKS.some(t=>t.id===id)))throw Error('未知或重复任务');
  for(const task of TASKS.filter(t=>taskIds.includes(t.id)))for(const spec of task.cases)if(!ref.manifest.references[spec.id]||!ref.prompts[task.id])throw Error('准备的题库不完整');
  const s:Session={version:GATEWAY_VERSION,id:randomUUID(),createdAt:now(),participant,taskIds,manifestHash:ref.manifest.hash,promptsHash:ref.promptsHash,attempts:[]};
  await this.save(s);
  return {sessionId:s.id,mode:participant.tasks?'practice':'agent-session',identityVerification:'self-declared; unknown fields remain unknown',tasks:taskIds.length,cases:TASKS.filter(t=>taskIds.includes(t.id)).flatMap(t=>t.cases).length,instructions};
 }
 feedback(a:Attempt){return {taskId:a.taskId,round:a.round,status:a.status,cases:a.cases.map(c=>({id:c.id,passed:c.passed,completion:c.completion,reason:c.reason,checks:c.checks})),error:a.error??null};}
 passed(a:Attempt,t:Task){return a.status==='evaluated'&&a.cases.length===t.cases.length&&a.cases.every(c=>c.passed);}
 async next(id:string){
  return locked(path.join(this.dir(id),'session.lock'),async()=>{
   const s=await this.load(id);
   if(s.job)return {state:s.job.status==='error'?'infrastructure_error':'grading',sessionId:id,completedCases:s.job.attempt.cases.length,error:s.job.error??null,next:'Use status; use resume after a worker interruption or infrastructure error. Do not generate another answer.'};
   if(s.ticket)return {state:'question',sessionId:id,...s.ticket};
   for(const taskId of s.taskIds){
    const task=TASKS.find(t=>t.id===taskId)!,first=s.attempts.find(a=>a.taskId===taskId&&a.round===1),second=s.attempts.find(a=>a.taskId===taskId&&a.round===2);
    if(first&&(this.passed(first,task)||second))continue;
    const round=first?2:1;
    let prompt=(await this.reference()).prompts[taskId];
    if(first)prompt+='\nPrevious submission:\n'+(first.answer?JSON.stringify(first.answer):first.rawSubmission)+'\nActual feedback:\n'+JSON.stringify(this.feedback(first))+'\nThis is your only revision.';
    s.ticket={id:randomUUID(),taskId,round,prompt,issuedAt:now()};await this.save(s);
    return {state:'question',sessionId:id,...s.ticket};
   }
   return {state:'complete',sessionId:id,next:'Call farm100_export. Objective scores are available; design review remains separate.'};
  });
 }
 async submit(id:string,ticketId:string,raw:string,launch=true){
  if(typeof raw!=='string'||Buffer.byteLength(raw)>256*1024)throw Error('答卷必须是最多256KiB的原始JSON文本');
  const result=await locked(path.join(this.dir(id),'session.lock'),async()=>{
   const s=await this.load(id),hash=sha(raw),old=s.attempts.find(a=>a.call.ticketId===ticketId);
   if(old){if(old.call.submissionHash!==hash)throw Error('该票据已提交，不能更换答案');return {state:'graded',idempotent:true,...this.feedback(old)};}
   if(s.job){if(s.job.ticket.id!==ticketId||s.job.hash!==hash)throw Error('已有提交正在判题，不能覆盖');return {state:s.job.status,idempotent:true};}
   if(!s.ticket||s.ticket.id!==ticketId)throw Error('无效或过期票据，请先 next');
   const t=s.ticket,attemptId=t.taskId+'-'+t.round,folder='calls/'+attemptId;
   const model=this.label(s);
   const call={id:attemptId,model,actualModel:null,declaredModel:s.participant.model??null,reasoning:s.participant.reasoning??null,agent:s.participant.agent,identitySource:'external Agent self-declaration; runtime identity unverified',ticketId,submissionHash:hash,startedAt:t.issuedAt,finishedAt:now(),durationMs:Date.now()-Date.parse(t.issuedAt),durationMeaning:'question issued to submission received; includes user and tool latency',usage:null,billing:'external-agent; FARM100 does not make paid model calls',reserved:0,additionalRmb:null,externalCostUnknown:true,evidence:folder,status:'completed'};
   const attempt:Attempt={id:attemptId,model,taskId:t.taskId,round:t.round,status:'evaluated',cases:[],call};
   try{attempt.answer=AnswerSchema.parse(JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,'')));attempt.sourceHash=sha(attempt.answer.source);}catch(e){attempt.status='submission_error';attempt.rawSubmission=raw;attempt.error=String(e);}
   // Persist raw evidence before acknowledging. A crash resumes this exact answer.
   await writeJSON(path.join(this.dir(id),folder,'request.json'),{model,prompt:t.prompt,sha256:sha(t.prompt),mode:GATEWAY_VERSION});
   await writeJSON(path.join(this.dir(id),folder,'response-normalized.json'),{model,identitySource:call.identitySource,content:raw,usage:null});
   s.ticket=undefined;
   if(!attempt.answer){s.attempts.push(attempt);await this.save(s);return {state:'graded',...this.feedback(attempt)};}
   s.job={ticket:t,raw,hash,status:'queued',attempt};await this.save(s);
   return {state:'queued',taskId:t.taskId,round:t.round};
  });
  if(launch&&['queued','grading'].includes(result.state))await this.launch(id);
  return {...result,sessionId:id};
 }
 label(s:Session){return ('[Agent] '+s.participant.agent+' / '+(s.participant.model??'unknown')).slice(0,100);}
 async launch(id:string){
  const child=spawn(process.execPath,[path.join(this.repo,'scripts/farm100-agent.mjs'),'worker','--session',id,'--root',this.root],{cwd:this.repo,detached:true,windowsHide:true,stdio:'ignore'});
  await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
 }
 async work(id:string){
  await locked(path.join(this.dir(id),'worker.lock'),async()=>{
   let job=(await this.load(id)).job;if(!job)return;
   try{
    const task=TASKS.find(t=>t.id===job!.ticket.taskId)!,ref=await this.reference();
    await locked(path.join(this.dir(id),'session.lock'),async()=>{const s=await this.load(id);s.job!.status='grading';s.job!.error=undefined;await this.save(s);});
    for(const spec of task.cases){
     if(job.attempt.cases.some(c=>c.id===spec.id))continue;
     const reference=ref.manifest.references[spec.id],text=await readFile(path.join(this.referenceDir,reference.file),'utf8');
     if(sha(text)!==reference.recordHash)throw Error('参考记录被更改');
     const filename='runs/'+job.attempt.id+'/'+spec.id.replaceAll('/','-')+'.json';
     const run=await runCase(task,spec,job.attempt.answer!.source);
     const score=assess(task,spec,run,reference.primary,filename);
     await writeJSON(path.join(this.dir(id),filename),run);
     await locked(path.join(this.dir(id),'session.lock'),async()=>{const s=await this.load(id);s.job!.attempt.cases.push(score);await this.save(s);job=s.job!;});
    }
    await locked(path.join(this.dir(id),'session.lock'),async()=>{const s=await this.load(id);s.attempts.push(s.job!.attempt);s.job=undefined;await this.save(s);});
   }catch(error){
    await locked(path.join(this.dir(id),'session.lock'),async()=>{const s=await this.load(id);if(s.job){s.job.status='error';s.job.error=String(error);await this.save(s);}});
    throw error;
   }
  });
 }
 async status(id:string){
  const s=await this.load(id);let workerAlive=false;
  try{const lock=JSON.parse(await readFile(path.join(this.dir(id),'worker.lock'),'utf8'));workerAlive=alive(lock.pid);}catch(e){if(!existsError(e,'ENOENT'))throw e;}
  const finished=s.taskIds.filter(taskId=>{const first=s.attempts.find(a=>a.taskId===taskId&&a.round===1);return first&&(this.passed(first,TASKS.find(t=>t.id===taskId)!)||s.attempts.some(a=>a.taskId===taskId&&a.round===2));}).length;
  return {sessionId:id,version:s.version,participant:s.participant,identityVerification:'self-declared',finishedTasks:finished,totalTasks:s.taskIds.length,complete:finished===s.taskIds.length,job:s.job?{state:s.job.status,workerAlive,completedCases:s.job.attempt.cases.length,expectedCases:TASKS.find(t=>t.id===s.job!.ticket.taskId)!.cases.length,error:s.job.error??null}:null,pendingTicket:s.ticket?{id:s.ticket.id,taskId:s.ticket.taskId,round:s.ticket.round}:null,lastFeedback:s.attempts.length?this.feedback(s.attempts.at(-1)!):null};
 }
 async resume(id:string){
  const s=await this.load(id);if(s.job)await this.launch(id);
  return {sessionId:id,state:s.job?'resuming-same-submission':'idle',next:s.job?'status':'next'};
 }
 async export(id:string){
  return locked(path.join(this.dir(id),'session.lock'),()=>this.exportUnlocked(id));
 }
 private async exportUnlocked(id:string){
   const s=await this.load(id);if(s.job)throw Error('判题尚未结束，请先 status / resume');
   if(!(await this.status(id)).complete)throw Error('请先完成所选全部题目，再导出含参考证据的记录');
   const r=await this.reference(),base=this.dir(id);
   const bundle:Bundle={version:r.manifest.version,manifest:r.manifest,models:[this.label(s)],attempts:s.attempts,reviews:[],ledger:s.attempts.map(a=>a.call),providers:[{mode:GATEWAY_VERSION,participant:s.participant,identityVerification:'self-declared',historicalLeaderboardEligible:false,promptsHash:s.promptsHash}]};
   try{bundle.reviews=JSON.parse(await readFile(path.join(base,'reviews.json'),'utf8'));}catch(e){if(!existsError(e,'ENOENT'))throw e;}
   for(const review of bundle.reviews){const a=bundle.attempts.find(a=>a.id===review.attemptId);if(!a)throw Error('评审引用未知答卷');validateReview(reviewWithoutMetadata(review),a);}
   // Re-evaluate every event record; never export scores merely on trust.
   for(const a of s.attempts){
    const response=JSON.parse(await readFile(path.join(base,a.call.evidence,'response-normalized.json'),'utf8'));
    if(sha(response.content)!==a.call.submissionHash)throw Error('原始答卷已变化');
    if(a.answer&&canonical(AnswerSchema.parse(JSON.parse(response.content.replace(/^```(?:json)?\s*|\s*```$/g,''))))!==canonical(a.answer))throw Error('答卷与执行源码不一致');
    for(const c of a.cases){const task=TASKS.find(t=>t.id===a.taskId)!,spec=task.cases.find(x=>x.id===c.id)!;const run=JSON.parse(await readFile(path.join(base,c.evidence),'utf8'));if(run.source!==a.answer?.source||canonical(assess(task,spec,run,r.manifest.references[c.id].primary,c.evidence))!==canonical(c))throw Error('执行证据与分数不一致');}
   }
   for(const ref of Object.values(r.manifest.references)){const src=path.join(this.referenceDir,ref.file);if(sha(await readFile(src,'utf8'))!==ref.recordHash)throw Error('参考记录被更改');await mkdir(path.dirname(path.join(base,ref.file)),{recursive:true});await copyFile(src,path.join(base,ref.file));}
   const report={version:GATEWAY_VERSION,sessionId:id,participant:s.participant,mode:s.participant.tasks?'practice':'agent-session',historicalLeaderboardEligible:false,identityVerification:'self-declared',first:leaderboard(bundle,1),revised:leaderboard(bundle,2),manualReview:bundle.reviews.length?'partially-or-fully-reviewed':'pending',manifestHash:s.manifestHash,promptsHash:s.promptsHash};
   await writeJSON(path.join(base,'bundle.json'),bundle);await writeJSON(path.join(base,'report.json'),report);await writeFile(path.join(base,'report.csv'),exportCSV(bundle));
   const a=report.first[0],b=report.revised[0],fmt=(n:number|null)=>n===null?'待完成':n.toFixed(2);
   await writeFile(path.join(base,'REPORT.md'),`# FARM100 Agent 会话测试\n\nSession: ${id}\n\n身份为外部 Agent 自报，非服务端验证。模式：${report.mode}。与历史独立模型调用榜分开。\n\n| 阶段 | 案例覆盖 | 客观60 | 含评审总分100 |\n| --- | --- | --- | --- |\n| 首次 | ${a.coverage}/${a.expected} | ${fmt(a.objective)} | ${fmt(a.total)} |\n| 一次修订后 | ${b.coverage}/${b.expected} | ${fmt(b.objective)} | ${fmt(b.total)} |\n\n覆盖不等于通关。缺少独立设计评审时不发布100分总分。练习子集不构成完整标准测试。\n\nbundle.json 与 calls、runs、references 目录应一同保留，可在评分工作台中导入。该目录含参考答案，请在完成测试后再读取。\n`);
   return {sessionId:id,directory:base,report:path.join(base,'REPORT.md'),bundle:path.join(base,'bundle.json'),first:{coverage:a.coverage,objective:a.objective,total:a.total},revised:{coverage:b.coverage,objective:b.objective,total:b.total},historicalLeaderboardEligible:false,identityVerification:'self-declared'};
 }
 async archive(id:string){
  return locked(path.join(this.dir(id),'session.lock'),async()=>{
   const exported=await this.exportUnlocked(id),base=this.dir(id);
   const report=JSON.parse(await readFile(path.join(base,'report.json'),'utf8'));
   const bundleHash=sha(await readFile(exported.bundle,'utf8'));
   const parent=path.join(this.root,'archives',id),destination=path.join(parent,bundleHash);
   await mkdir(parent,{recursive:true});
   let inventory:Record<string,string>;
   try{inventory=JSON.parse(await readFile(path.join(destination,'evidence-index.json'),'utf8'));}
   catch(e){
    if(!existsError(e,'ENOENT'))throw e;
    const staging=await mkdtemp(path.join(parent,'.pending-'));
    for(const file of ['bundle.json','report.json','report.csv','REPORT.md','calls','runs','references']){
     try{await cp(path.join(base,file),path.join(staging,file),{recursive:true,errorOnExist:true,force:false});}
     catch(e){if(file!=='runs'||!existsError(e,'ENOENT'))throw e;}
    }
    inventory=await evidenceInventory(staging);
    await writeJSON(path.join(staging,'evidence-index.json'),inventory);
    await rename(staging,destination);
   }
   const actual=await evidenceInventory(destination);
   if(canonical(actual)!==canonical(inventory)||actual['bundle.json']!==bundleHash)throw Error('入库证据哈希不匹配');
   const entry={version:GATEWAY_VERSION,sessionId:id,bundleHash,mode:report.mode,participant:report.participant,
    historicalLeaderboardEligible:false,identityVerification:report.identityVerification,manualReview:report.manualReview,
    first:exported.first,revised:exported.revised,directory:destination,evidenceFiles:Object.keys(inventory).length};
   const registry=path.join(this.root,'registry.json');
   await locked(path.join(this.root,'registry.lock'),async()=>{
    let rows:any[]=[];
    try{rows=JSON.parse(await readFile(registry,'utf8'));}catch(e){if(!existsError(e,'ENOENT'))throw e;}
    if(!rows.some(r=>r.sessionId===id&&r.bundleHash===bundleHash)){
     rows.push({...entry,registeredAt:now()});await writeJSON(registry,rows);
    }
   });
   return {...entry,registry};
  });
 }
 async review(id:string,input:unknown){
  return locked(path.join(this.dir(id),'session.lock'),async()=>{
   const s=await this.load(id),raw=input as {attemptId:string},attempt=s.attempts.find(a=>a.id===raw.attemptId);if(!attempt)throw Error('答卷不存在');
   const checked=validateReview(input,attempt);let rows:any[]=[];
   try{rows=JSON.parse(await readFile(path.join(this.dir(id),'reviews.json'),'utf8'));}catch(e){if(!existsError(e,'ENOENT'))throw e;}
   rows.push({...checked,revision:rows.length+1,at:now()});await writeJSON(path.join(this.dir(id),'reviews.json'),rows);
   return {reviews:rows.length,next:'export'};
  });
 }
}
async function evidenceInventory(root:string,prefix=''):Promise<Record<string,string>>{
 const result:Record<string,string>={};
 for(const item of await readdir(path.join(root,prefix),{withFileTypes:true})){
  const relative=prefix?prefix+'/'+item.name:item.name;
  if(relative==='evidence-index.json')continue;
  if(item.isSymbolicLink())throw Error('入库证据不允许符号链接');
  if(item.isDirectory())Object.assign(result,await evidenceInventory(root,relative));
  else result[relative]=sha(await readFile(path.join(root,relative),'utf8'));
 }
 return result;
}
function reviewWithoutMetadata(r:any){const {revision,at,...content}=r;return content;}
