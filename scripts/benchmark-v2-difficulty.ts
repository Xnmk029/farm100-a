import {readFile,writeFile} from 'node:fs/promises';
import {TASKS,MODULE_WEIGHTS} from '../packages/benchmark-v2/catalog';
import {leaderboard,type Bundle} from '../packages/benchmark-v2/scoring';
const dir='artifacts/scoring-v2';
const b:Bundle=JSON.parse(await readFile(dir+'/bundle.json','utf8'));
const f=(n:number|null)=>n===null?'缺证':n.toFixed(2);
const lines=['# FARM100 v2 题目难度观察','',
'本报告只反映两模型在本版冻结题面上的表现，不是经过大样本校准的难度等级。首次与一次修订后分开；AI设计评分为主助手受用户授权的判分。',
'','## 模块表现','','| 模型 | 阶段 | 模块 | 完整通关题数 | 客观60 | 设计40 | 模块100 |','|---|---|---|---:|---:|---:|---:|'];
for(const stage of [1,2] as const)for(const m of leaderboard(b,stage))for(const mod of ['challenge','lesson','sort'] as const){
 const ts=m.tasks.filter(t=>t.module===mod),w=ts.reduce((s,t)=>s+t.weight,0);
 const avg=(key:'objective'|'manual'|'total')=>ts.every(t=>t[key]!==null)?ts.reduce((s,t)=>s+t[key]!*t.weight,0)/w:null;
 lines.push(`| ${m.model} | ${stage===1?'首次':'一次修订后'} | ${mod}（总榜${MODULE_WEIGHTS[mod]*100}%） | ${ts.filter(t=>t.passed).length}/${ts.length} | ${f(avg('objective'))} | ${f(avg('manual'))} | ${f(avg('total'))} |`);
}
lines.push('','## 逐题表现','','“通过”表示该题所有固定案例均通过，旧排序需24例全部通过。失败不等于高算法难度，必须结合接口错误、状态假设和预算耗尽等原因解释。','','| 题目 | 权重 | 模型 | 首次 | 修订后 | 首次分 | 修订后分 |','|---|---:|---|---|---|---:|---:|');
for(const task of TASKS)for(const model of b.models){
 const first=leaderboard(b,1).find(m=>m.model===model)!.tasks.find(t=>t.taskId===task.id)!;
 const revised=leaderboard(b,2).find(m=>m.model===model)!.tasks.find(t=>t.taskId===task.id)!;
 const status=(t:typeof first)=>t.coverage<t.expected?'缺证':t.passed?'通过':'未全通关';
 lines.push(`| ${task.id} · ${task.name} | ${task.weight} | ${model} | ${status(first)} | ${status(revised)} | ${f(first.total)} | ${f(revised.total)} |`);
}
lines.push('','## 如何解读与下一版调整','',
'1. 本轮保持20/35/50等冻结权重，不依据已知模型成绩临时改权重。两模型样本不足以重新标定一、二、三阶的普遍难度。',
'2. 多道生产、布局、课程失败涉及初态、研究前置与生产链；应区分资源状态建模缺陷与 API 合约误解，具体证据见逐项评语。',
'3. 迷宫 collect 的冻结提示未明确写出无参签名，排序 swap 的描述也未展开所有随作物移动的状态。下一版先补齐签名、返回值和错误消息，再独立运行，不回填或重抽本轮首答。',
'4. 入门课重点判断规定操作与状态变化，不能只按最终库存判断教学目标；高阶题同时看通关与运行成本。已通关但低效率的方案仍可因准确的复杂度说明获得相应设计分。',
'5. 后续难度校准应增加独立模型与重复采样，并报告首答通关率、一次反馈提升、失败类型及成本分布；本轮单次答卷不支持稳定排名的统计置信结论。','');
await writeFile(dir+'/DIFFICULTY.md',lines.join('\n'));
console.log('Wrote DIFFICULTY.md');
