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
const summary=['# 两模型评分结果','', '口径：冻结v2清单，客观60分＋用户授权的主助手AI评审40分。未完成全部93案例的模型不发布正式总分。首次与唯一修订后独立计算。','', '| 模型 | 首次覆盖 | 首次客观60 | 首次AI40 | 首次总分100 | 修订后总分100 |','|---|---:|---:|---:|---:|---:|'];
for(const first of report.first){const revised=report.revised.find(r=>r.model===first.model)!;summary.push(`| ${first.model} | ${first.coverage}/${first.expected} | ${fmt(first.objective)} | ${fmt(first.total===null||first.objective===null?null:first.total-first.objective)} | ${fmt(first.total)} | ${fmt(revised.total)} |`);}
summary.push('','## 完成情况','');
for(const stage of [report.first,report.revised])for(const m of stage){summary.push(`- ${m.model}，${m.stage===1?'首次':'一次修订后'}：案例${m.coverage}/${m.expected}，整题通关${m.tasks.filter(t=>t.passed).length}/31，已评${m.tasks.filter(t=>t.manual!==null).length}/31。`);}
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
