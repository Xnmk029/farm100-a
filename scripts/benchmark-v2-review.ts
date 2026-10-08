import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {validateReview,leaderboard,exportCSV,type Bundle} from '../packages/benchmark-v2/scoring';
import {writeJSON,sha} from './benchmark-v2-engine';
import {canonical} from '../packages/protocol';
const root=path.resolve('artifacts/scoring-v2');
const b:Bundle=JSON.parse(await readFile(path.join(root,'bundle.json'),'utf8'));
const agentFiles=await readdir(path.join(root,'agent-results')).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return [];throw e;});
for(const file of agentFiles){const a=JSON.parse(await readFile(path.join(root,'agent-results',file),'utf8'));const old=b.attempts.find(x=>x.id===a.id);if(old&&old.sourceHash!==a.sourceHash)throw Error('重复首答不一致');if(!old)b.attempts.push(a);if(!b.ledger.some(e=>e.id===a.call.id))b.ledger.push(a.call);}
const drafts=JSON.parse(await readFile(path.join(root,'review-drafts.json'),'utf8'));
const prepared=[];
for(const raw of drafts){const a=b.attempts.find(a=>a.id===raw.attemptId);if(!a)throw Error('找不到提交 '+raw.attemptId);if(sha(a.answer?.source??'')!==a.sourceHash)throw Error('评审源码变化');const checked=validateReview(raw,a);for(const k of ['strategy','correctness','complexity','boundaries'] as const){const c=a.cases[0];if(c&&!checked[k].evidence.some(e=>e.startsWith('case:')))checked[k].evidence.push('case:'+c.id);}const previous=b.reviews.filter(r=>r.attemptId===a.id).at(-1);const priorContent=previous?(({revision,at,...content})=>content)(previous):null;if(!priorContent||canonical(priorContent)!==canonical(checked))prepared.push(checked);}
let revision=b.reviews.at(-1)?.revision??0;
for(const r of prepared)b.reviews.push({...r,revision:++revision,at:new Date().toISOString()});
// Snapshot by default: the model worker owns bundle.json while it runs.
const output=process.argv.includes('--commit')?'bundle.json':'reviewed-preview.json';
await writeJSON(path.join(root,output),b);
await writeJSON(path.join(root,'reviewed-scores.json'),{first:leaderboard(b,1),revised:leaderboard(b,2),reviewer:'Codex AI; user-authorized',complete:b.models.every(m=>leaderboard(b,2).find(r=>r.model===m)?.total!==null)});
console.log(JSON.stringify({output,added:prepared.length,first:leaderboard(b,1).map(r=>({model:r.model,coverage:r.coverage,total:r.total})),revised:leaderboard(b,2).map(r=>({model:r.model,coverage:r.coverage,total:r.total}))}));

const lines=['# 三模型 v2 阶段评分','', '评审：Codex 主助手（AI，用户授权）。四项人工维度由助手逐份阅读后判定，不是通关率换算。基础设施缺证不记零，完整总分仅在全部案例齐全时发布。',''];
for(const stage of [1,2] as const){lines.push(stage===1?'## 首次提交':'## 一次修订后（无修订保留首次）','','| 模型 / 题目 | 案例覆盖 | 客观60 | AI评审40 | 单题100 |','|---|---:|---:|---:|---:|');for(const m of leaderboard(b,stage))for(const t of m.tasks){if(t.objective===null&&t.manual===null)continue;const fmt=(n:number|null)=>n===null?'待补':n.toFixed(2);lines.push(`| ${m.model} / ${t.taskId} | ${t.coverage}/${t.expected} | ${fmt(t.objective)} | ${fmt(t.manual)} | ${fmt(t.total)} |`);}lines.push('');}
lines.push('## 逐项评语与修改记录','', '同一提交按修订号保留全部评语，总分采用该提交最新评审。','');for(const r of b.reviews){lines.push('### '+r.attemptId+' · 评审修订 '+r.revision,'');for(const k of ['strategy','correctness','complexity','boundaries'] as const)lines.push(`- ${k}：${r[k].score}/10。${r[k].reason}（${r[k].evidence.join('，')}）`);lines.push('');}
await writeFile(path.join(root,'AI-REVIEW-REPORT.md'),lines.join('\n'));
