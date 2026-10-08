import {z} from 'zod';
import {TASKS,MANUAL_KEYS,MODULE_WEIGHTS,BENCHMARK_VERSION,type Task} from './catalog';
export type CaseScore={id:string;passed:boolean;reason:string;completion:number;primary:number;reference:number;correctness:number;operations:number;efficiency:number;checks:{label:string;pass:boolean}[];eventCount:number;evidence:string};
export type Answer={source:string;strategy:string;correctness:string;complexity:string;boundaries:string};
export const AnswerSchema=z.object({source:z.string().max(100000),strategy:z.string().max(12000),correctness:z.string().max(12000),complexity:z.string().max(12000),boundaries:z.string().max(12000)});
export type Attempt={id:string;taskId:string;model:string;round:1|2;status:'evaluated'|'infrastructure_error'|'submission_error';answer?:Answer;rawSubmission?:string;sourceHash?:string;cases:CaseScore[];error?:string;call:any};
const criterion=z.object({score:z.union([z.literal(0),z.literal(2.5),z.literal(5),z.literal(7.5),z.literal(10)]),reason:z.string().trim().min(1).max(4000),evidence:z.array(z.string().min(1).max(150)).min(1).max(30)}).strict();
export const ReviewSchema=z.object({attemptId:z.string().min(1),reviewer:z.string().trim().min(1).max(100),strategy:criterion,correctness:criterion,complexity:criterion,boundaries:criterion}).strict();
export type Review=z.infer<typeof ReviewSchema>&{revision:number;at:string};
export function mergeImportedReviews(local:Review[],incoming:Review[]):Review[]{
 const identity=(r:Review)=>JSON.stringify({attemptId:r.attemptId,reviewer:r.reviewer,strategy:r.strategy,correctness:r.correctness,complexity:r.complexity,boundaries:r.boundaries,at:r.at});
 const incomingIdentities=new Set(incoming.map(identity)),localIdentities=new Set(local.map(identity));
 const additions=incoming.filter(r=>!localIdentities.has(identity(r))).sort((a,b)=>a.revision-b.revision);
 if(!additions.length)return local;
 const changedAttempts=new Set(additions.map(r=>r.attemptId));
 const localConflicts=new Map<string,Review>();
 for(const review of local)if(changedAttempts.has(review.attemptId)&&!incomingIdentities.has(identity(review)))localConflicts.set(review.attemptId,review);
 let revision=Math.max(0,...local.map(r=>r.revision));
 const appended=additions.map(r=>({...r,revision:++revision}));
 const restored=[...localConflicts.values()].sort((a,b)=>a.revision-b.revision).map(r=>({...r,revision:++revision}));
 return [...local,...appended,...restored];
}
export type Manifest={version:typeof BENCHMARK_VERSION;hash:string;frozenAt:string;tasks:Task[];references:Record<string,{primary:number;sourceHash:string;recordHash:string;file:string}>};
export type Bundle={version:typeof BENCHMARK_VERSION;manifest:Manifest;models:string[];attempts:Attempt[];reviews:Review[];ledger:any[];providers:any[]};
export const round2=(n:number)=>Math.round(n*100)/100;
export function gradeCase(input:{id:string;passed:boolean;normal:boolean;completion:number;primary:number;reference:number;legal:boolean;clean:boolean;critical:boolean;reason:string;eventCount:number;evidence:string}):CaseScore{
 const correctness=Math.min(input.normal?30:15,30*Math.max(0,Math.min(1,input.completion)));
 const checks=[{label:'合法调用',pass:input.legal},{label:'非预期失败控制',pass:input.clean},{label:'题目关键操作',pass:input.critical}];
 const efficiency=input.passed?15*(input.primary===0?1:Math.min(1,input.reference/input.primary)):0;
 if(![correctness,input.primary,input.reference,efficiency].every(n=>Number.isFinite(n)&&n>=0))throw Error('Invalid score values');
 return {id:input.id,passed:input.passed,reason:input.reason,completion:input.completion,primary:input.primary,reference:input.reference,correctness,operations:checks.filter(c=>c.pass).length*5,efficiency,checks,eventCount:input.eventCount,evidence:input.evidence};
}
export function validateReview(raw:unknown,attempt:Attempt){
 const r=ReviewSchema.parse(raw);if(r.attemptId!==attempt.id||attempt.status==='infrastructure_error'||(!attempt.answer&&!attempt.rawSubmission))throw Error('该提交不能人工评分');
 for(const key of MANUAL_KEYS)for(const evidence of r[key].evidence){
  if(evidence==='response'&&attempt.rawSubmission)continue;
  if(/^code:\d+$/.test(evidence)){const n=Number(evidence.slice(5));if(!attempt.answer||n<1||n>attempt.answer.source.split('\n').length)throw Error('代码行号不存在');}
  else if(!attempt.cases.some(c=>evidence===`case:${c.id}`))throw Error('证据引用不存在');
 }
 return r;
}
export function taskScore(task:Task,attempt:Attempt|undefined,reviews:Review[]){
 const ids=new Set(attempt?.cases.map(c=>c.id)??[]);
 const complete=attempt?.status==='evaluated'&&ids.size===task.cases.length&&attempt.cases.length===ids.size&&task.cases.every(c=>ids.has(c.id));
 const review=attempt?reviews.filter(r=>r.attemptId===attempt.id).sort((a,b)=>b.revision-a.revision)[0]:undefined;
 const objective=attempt?.status==='submission_error'?0:complete?attempt!.cases.reduce((sum,c)=>sum+c.correctness+c.operations+c.efficiency,0)/task.cases.length:null;
 const manual=review?MANUAL_KEYS.reduce((sum,k)=>sum+review[k].score,0):null;
 return {taskId:task.id,attemptId:attempt?.id??null,coverage:task.cases.filter(c=>ids.has(c.id)).length,expected:task.cases.length,passed:complete&&attempt!.cases.every(c=>c.passed),objective,manual,total:objective!==null&&manual!==null?objective+manual:null};
}
export function leaderboard(bundle:Bundle,stage:1|2){
 return bundle.models.map(model=>{
  const tasks=TASKS.map(task=>{const list=bundle.attempts.filter(a=>a.model===model&&a.taskId===task.id);const chosen=stage===1?list.find(a=>a.round===1):list.find(a=>a.round===2)??list.find(a=>a.round===1);return {...taskScore(task,chosen,bundle.reviews),module:task.module,weight:task.weight};});
  let total=0,objective=0,ready=true,objectiveReady=true;
  for(const module of ['challenge','lesson','sort'] as const){const rows=tasks.filter(t=>t.module===module),weights=rows.reduce((s,r)=>s+r.weight,0);if(rows.some(r=>r.total===null||r.coverage!==r.expected))ready=false;if(rows.some(r=>r.objective===null))objectiveReady=false;total+=rows.reduce((s,r)=>s+(r.total??0)*r.weight,0)/weights*MODULE_WEIGHTS[module];objective+=rows.reduce((s,r)=>s+(r.objective??0)*r.weight,0)/weights*MODULE_WEIGHTS[module];}
  return {model,stage,tasks,coverage:tasks.reduce((s,t)=>s+t.coverage,0),expected:tasks.reduce((s,t)=>s+t.expected,0),objective:objectiveReady?objective:null,total:ready?total:null};
 }).sort((a,b)=>(b.total??-1)-(a.total??-1));
}
export function budgetReservation(entries:{reserved:number;charged?:number}[],estimate:number|null,limit=100){
 if(estimate===null||!Number.isFinite(estimate)||estimate<0)throw Error('费用未知，禁止调用');
 if(!Number.isFinite(limit)||limit<0||entries.some(e=>!Number.isFinite(e.reserved)||e.reserved<0||(e.charged!==undefined&&(!Number.isFinite(e.charged)||e.charged<0))))throw Error('费用记录无效');
 const used=entries.reduce((sum,e)=>sum+(e.charged??e.reserved),0);if(used+estimate>limit)throw Error('预算不足');return estimate;
}

export function exportCSV(bundle:Bundle){
 const rows:unknown[][]=[['model','stage','scope','task','case','coverage','expected','correctness30','operations15','efficiency15','objective60','strategy10','correctness10','complexity10','boundaries10','manual40','total100','primary','reference','relativeSaving']];
 for(const stage of [1,2] as const)for(const model of leaderboard(bundle,stage)){
  rows.push([model.model,stage,'model','','',model.coverage,model.expected,'','','',model.objective,'','','','',null,model.total]);
  for(const t of model.tasks){
   const a=bundle.attempts.find(a=>a.id===t.attemptId),review=bundle.reviews.filter(r=>r.attemptId===a?.id).at(-1);
   const avg=(key:'correctness'|'operations'|'efficiency')=>t.objective===null?null:a?.status==='submission_error'?0:a!.cases.reduce((s,c)=>s+c[key],0)/t.expected;
   rows.push([model.model,stage,'task',t.taskId,'',t.coverage,t.expected,avg('correctness'),avg('operations'),avg('efficiency'),t.objective,...MANUAL_KEYS.map(k=>review?.[k].score),t.manual,t.total]);
   for(const c of a?.cases??[])rows.push([model.model,stage,'case',t.taskId,c.id,1,1,c.correctness,c.operations,c.efficiency,c.correctness+c.operations+c.efficiency,'','','','','','',c.primary,c.reference,c.reference===0?null:1-c.primary/c.reference]);
  }
 }
 return '\ufeff'+rows.map(row=>row.map(v=>'"'+String(typeof v==='number'?round2(v):v??'').replaceAll('"','""')+'"').join(',')).join('\n');
}
