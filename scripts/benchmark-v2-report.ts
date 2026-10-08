import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {gradeLesson} from '../packages/garden/lessons';
import {leaderboard,exportCSV,type Bundle} from '../packages/benchmark-v2/scoring';
const root=path.resolve('artifacts/scoring-v2');
const b:Bundle=JSON.parse(await readFile(path.join(root,'bundle.json'),'utf8'));
const report={version:b.version,manifestHash:b.manifest.hash,first:leaderboard(b,1),revised:leaderboard(b,2),manualReviews:b.reviews.length,maximumAdditionalRmbReserved:b.ledger.reduce((s,e)=>s+(e.charged??e.reserved),0),actualBillRmb:null,providers:b.providers};
await writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));
await writeFile(path.join(root,'report.csv'),exportCSV(b));
await writeFile(path.join(root,'ledger.json'),JSON.stringify(b.ledger,null,2));
const fmt=(n:number|null)=>n===null?'待补':n.toFixed(2);
const summary=['# 三模型评分结果','', '口径：冻结v2清单，客观60分＋用户授权的主助手AI评审40分。未完成全部93案例的模型不发布正式总分。首次与唯一修订后独立计算。','', '| 模型 | 首次覆盖 | 首次客观60 | 首次AI40 | 首次总分100 | 修订后总分100 |','|---|---:|---:|---:|---:|---:|'];
for(const first of report.first){const revised=report.revised.find(r=>r.model===first.model)!;summary.push(`| ${first.model} | ${first.coverage}/${first.expected} | ${fmt(first.objective)} | ${fmt(first.total===null||first.objective===null?null:first.total-first.objective)} | ${fmt(first.total)} | ${fmt(revised.total)} |`);}
summary.push('','## 完成情况','');
for(const stage of [report.first,report.revised])for(const m of stage){summary.push(`- ${m.model}，${m.stage===1?'首次':'一次修订后'}：案例${m.coverage}/${m.expected}，整题通关${m.tasks.filter(t=>t.passed).length}/31，已评${m.tasks.filter(t=>t.manual!==null).length}/31。`);}
const formatFailures=[];for(const stage of [report.first,report.revised])for(const m of stage)for(const t of m.tasks){const a=b.attempts.find(a=>a.id===t.attemptId);if(a?.status==='submission_error')formatFailures.push(`${m.model} ${m.stage===1?'首次':'修订'} ${t.taskId}：调用完成但提交格式错误，未执行${t.expected}例`);}
if(formatFailures.length)summary.push('','## 格式失败口径','',...formatFailures.map(x=>'- '+x),'','模型客观分按评分实现将格式失败题的客观项计0；案例覆盖仍显示未执行，人工项为空，因此不发布正式总分。');
try{const projection=JSON.parse(await readFile(path.join(root,'projections/recovered-runs.json'),'utf8'));summary.push('','## 非正式模型预估','', '| 模型 / 阶段 | 预估覆盖 | 整题通过率 | 格式正确率 | 客观60 | AI40 | 预估总分100 |','|---|---:|---:|---:|---:|---:|---:|',...projection.stages.map((s:any)=>`| grok-4.6-build / ${s.label} | ${s.coverage} | ${s.taskPasses}/${s.totalTasks} (${s.passRate.toFixed(2)}%) | 30/31 (${s.wellFormedRate.toFixed(2)}%) | ${s.objective.toFixed(2)} | ${(s.total-s.objective).toFixed(2)} | **${s.total.toFixed(2)}** |`),'','预估从格式失败响应中恢复完整代码片段并运行三种子；不改变正式榜。完整分项见 PROJECTION-SCORES.md。');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
summary.push('','评审明细与修改记录见 AI-REVIEW-REPORT.md；机器可读分项见 report.json、report.csv，原始证据由 bundle.json 引用。','',`API已结算上界或未释放预留合计：${report.maximumAdditionalRmbReserved.toFixed(8)}元，上限100元；实际账单未知。Codex订阅额度单独记录。`);
await writeFile(path.join(root,'SCORES.md'),summary.join('\n'));
console.log(JSON.stringify({first:report.first.map(({model,coverage,expected,total})=>({model,coverage,expected,total})),budgetUpper:report.maximumAdditionalRmbReserved}));

const rules=[];
for(const t of b.manifest.tasks){
 const reference=b.manifest.references[t.cases[0].id];
 const checks=t.module==='lesson'?gradeLesson(t.id.slice(7),JSON.parse(await readFile(path.join(root,reference.file),'utf8'))).checks.map(c=>c.label):t.operations;
 rules.push({...t,operationChecklist:checks,objectiveMaximum:60,manualMaximum:40,missingEvidence:'pending; no formal leaderboard'});
}
await writeFile(path.join(root,'rules.json'),JSON.stringify({version:b.version,manifestHash:b.manifest.hash,tasks:rules},null,2));
