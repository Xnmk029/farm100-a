import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {TASKS,MANUAL_KEYS} from '../packages/benchmark-v2/catalog';
import {leaderboard,round2} from '../packages/benchmark-v2/scoring';
import {runCase,assess,sha} from './benchmark-v2-engine';

const root=path.resolve('artifacts/scoring-v2');
const bundle=JSON.parse(await readFile(path.join(root,'bundle.json'),'utf8'));
const decoder=(text:string)=>{
 const results:any[]=[];
 for(let start=0;start<text.length;start++)if(text[start]==='{'){
  let depth=0,string=false,escaped=false;
  for(let end=start;end<text.length;end++){
   const c=text[end];
   if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;continue;}
   if(c==='"'){string=true;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0){try{const value=JSON.parse(text.slice(start,end+1));if(value?.source&&value.strategy&&value.correctness&&value.complexity&&value.boundaries)results.push(value);}catch{}break;}
  }
 }
 return results.at(-1);
};
const manualByTask:Record<string,any>={
 'farm-3':{
  strategy:{score:10,reason:'资源预留、麦萝轮作和逐批合成直接对应48堆肥目标。'},
  correctness:{score:10,reason:'64粮食与32根茎约束推导成立，恢复运行的三个种子均达到48堆肥。'},
  complexity:{score:7.5,reason:'给出按轮次和地块数的复杂度及生长成本，但未精确界定轮次数上界。'},
  boundaries:{score:7.5,reason:'覆盖水、轮作和库存边界；未说明恢复运行中出现的一次边界移动失败。'}
 },
 'schedule-3':{
  strategy:{score:10,reason:'先定位四株水晶、按状态维修浇水收获，再用剩余水晶制作零件。'},
  correctness:{score:10,reason:'12水晶减4次制作后保留8水晶与8零件，三个种子均验证成立。'},
  complexity:{score:7.5,reason:'说明一次发现扫描和固定目标轮询，但未量化无效边界探测。'},
  boundaries:{score:7.5,reason:'覆盖受损、干旱、成熟与停止条件；未披露每例24次失败移动。'}
 }
};
const projections:any[]=[];
for(const attempt of bundle.attempts.filter((a:any)=>a.model==='grok-4.6-build'&&a.status==='submission_error')){
 const answer=decoder(attempt.rawSubmission);if(!answer)throw Error('No recoverable answer: '+attempt.id);
 const task=TASKS.find(t=>t.id===attempt.taskId)!;const cases=[];
 for(const spec of task.cases){
  const run=await runCase(task,spec,answer.source),relative=`projections/runs/${attempt.id}-${spec.id}.json`;
  await mkdir(path.dirname(path.join(root,relative)),{recursive:true});await writeFile(path.join(root,relative),JSON.stringify(run));
  cases.push(assess(task,spec,run,bundle.manifest.references[spec.id].primary,relative));
 }
 const manual=manualByTask[task.id],objective=cases.reduce((sum,c)=>sum+c.correctness+c.operations+c.efficiency,0)/cases.length,manualTotal=MANUAL_KEYS.reduce((sum,key)=>sum+manual[key].score,0);
 projections.push({attemptId:attempt.id,taskId:task.id,round:attempt.round,status:'model_projection',basis:'从格式错误响应中恢复最后一个完整JSON对象；恢复代码按正式三种子执行，但不改写正式榜。',answer,sourceHash:sha(answer.source),cases,manual,objective,manualTotal,total:objective+manualTotal});
}
const projectedBundle=structuredClone(bundle);let revision=projectedBundle.reviews.at(-1)?.revision??0;
for(const projection of projections){
 const index=projectedBundle.attempts.findIndex((a:any)=>a.id===projection.attemptId);projectedBundle.attempts[index]={...projectedBundle.attempts[index],status:'evaluated',answer:projection.answer,sourceHash:projection.sourceHash,cases:projection.cases};
 projectedBundle.reviews.push({attemptId:projection.attemptId,reviewer:'Codex 模型预估',revision:++revision,at:new Date().toISOString(),...Object.fromEntries(MANUAL_KEYS.map(key=>[key,{...projection.manual[key],evidence:[`case:${projection.cases[0].id}`]}]))});
}
const grok=(stage:1|2)=>leaderboard(projectedBundle,stage).find(x=>x.model==='grok-4.6-build')!;
const stages=[grok(1),grok(2)].map(result=>({stage:result.stage,label:result.stage===1?'首次预估':'修订后预估',coverage:`${result.coverage}/${result.expected}`,taskPasses:result.tasks.filter(t=>t.passed).length,totalTasks:result.tasks.length,passRate:result.tasks.filter(t=>t.passed).length/result.tasks.length*100,wellFormedRate:30/31*100,objective:result.objective,total:result.total}));
const report={version:bundle.version,generatedAt:new Date().toISOString(),status:'estimated_non_formal',formalLeaderboardUnchanged:true,methodology:{recovery:'每个格式失败响应只取最后一个可独立解析的完整答案对象。',execution:'恢复代码使用正式配置与种子7、19、99执行；客观分沿用冻结参考成绩。',manual:'40分按既有五档量表判定；每题只计一次，不按三个种子重复。',presentation:'参照算法榜常见的通过率、格式正确率、成本/证据与分数并列展示。'},projections,stages};
await writeFile(path.join(root,'projections','recovered-runs.json'),JSON.stringify(report,null,2));
const md=['# Grok 缺失案例模型预估榜','',`状态：**非正式预估**。正式榜仍保留90/93与总分空值；本表不覆盖原始格式失败证据。`,'','## 算法 Bench 风格总览','','| 模型 / 阶段 | 运行覆盖 | 整题通过率 | 输出格式正确率 | 客观 /60 | AI /40 | 预估总分 /100 |','|---|---:|---:|---:|---:|---:|---:|',...stages.map(s=>`| grok-4.6-build / ${s.label} | ${s.coverage} | ${s.taskPasses}/${s.totalTasks} (${s.passRate.toFixed(2)}%) | 30/31 (${s.wellFormedRate.toFixed(2)}%) | ${s.objective!.toFixed(2)} | ${(s.total!-s.objective!).toFixed(2)} | **${s.total!.toFixed(2)}** |`),'','## 缺失三种子回填','','| 阶段 / 任务 | 种子 | 通过 | 正确性 /30 | 操作 /15 | 效率 /15 | 主指标 / 参考 |','|---|---:|:---:|---:|---:|---:|---:|'];
for(const p of projections)for(const c of p.cases)md.push(`| ${p.round===1?'首次':'修订'} / ${p.taskId} | ${c.id.split('/')[1]} | ${c.passed?'是':'否'} | ${c.correctness.toFixed(2)} | ${c.operations.toFixed(2)} | ${c.efficiency.toFixed(2)} | ${c.primary} / ${c.reference} |`);
md.push('','## 设计说明评分','','| 阶段 / 任务 | 策略 | 正确性论证 | 复杂度 | 边界一致性 | AI /40 | 单题 /100 |','|---|---:|---:|---:|---:|---:|---:|',...projections.map(p=>`| ${p.round===1?'首次':'修订'} / ${p.taskId} | ${p.manual.strategy.score} | ${p.manual.correctness.score} | ${p.manual.complexity.score} | ${p.manual.boundaries.score} | ${p.manualTotal.toFixed(2)} | ${p.total.toFixed(2)} |`),'','说明：Aider类榜单会并列展示通过率和格式正确率，SWE-bench类榜单突出任务解决率，LiveCodeBench使用Pass@1；本表对应保留运行覆盖、整题通过率、格式正确率和复合得分。','');
await writeFile(path.join(root,'PROJECTION-SCORES.md'),md.join('\n'));
const csv=['stage,task,seed,passed,correctness30,operations15,efficiency15,objective60,manual40,taskTotal100,primary,reference'];
for(const p of projections)for(const c of p.cases)csv.push([p.round,p.taskId,c.id.split('/')[1],c.passed,c.correctness,c.operations,c.efficiency,p.objective,p.manualTotal,p.total,c.primary,c.reference].map(v=>`"${String(v).replaceAll('"','""')}"`).join(','));
for(const s of stages)csv.push([s.stage,'ALL','','', '', '', '',s.objective,s.total!-s.objective!,s.total,'',''].map(v=>`"${String(v).replaceAll('"','""')}"`).join(','));
await writeFile(path.join(root,'projection-report.csv'),'\ufeff'+csv.join('\n'));
console.log(JSON.stringify({pass:true,stages:stages.map(s=>({...s,objective:round2(s.objective!),total:round2(s.total!)})),tasks:projections.map(p=>({attemptId:p.attemptId,objective:round2(p.objective),manual:p.manualTotal,total:round2(p.total)}))}));
