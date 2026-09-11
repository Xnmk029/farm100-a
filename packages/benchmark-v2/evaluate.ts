import {type Task,type CaseSpec} from './catalog';
import {gradeCase} from './scoring';
import {validateGardenRun} from '../garden/core';
import {evaluateChallenge} from '../garden/challenges';
import {gradeLesson} from '../garden/lessons';
import {validateRun} from '../recording';
import {canonical} from '../protocol';
export function assess(task:Task,spec:CaseSpec,raw:any,reference:number,evidence:string){
 const r:any=task.module==='sort'?validateRun(raw):validateGardenRun(raw);
 if(canonical(r.config)!==canonical(spec.config)||(spec.initial&&canonical(r.initial)!==canonical(spec.initial)))throw Error('评分配置不匹配');
 const events=r.events.filter((e:any)=>!e.kind||e.kind==='complete');
 const normal=r.complete&&(r.result.reason==='finished'||r.result.reason==='succeeded');
 let passed=false,completion=0,critical=false;
 const failures=events.filter((e:any)=>e.value===false||e.action==='harvest'&&e.value===0);
 let clean=failures.length===0;
 if(task.module==='sort'){
  passed=r.complete&&r.result.reason==='succeeded'&&r.result.state.harvested;
  const n=r.config.size,g=r.result.state.grid;let pairs=0,correct=0;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x;if(x+1<n){pairs++;if(g[i]<=g[i+1])correct++;}if(y+1<n){pairs++;if(g[i]<=g[i+n])correct++;}}
  completion=passed?1:correct/pairs;critical=passed;
 }else if(task.module==='lesson'){
  const feedback=gradeLesson(task.id.slice(7),r);passed=r.complete&&feedback.pass;
  const goals=feedback.checks.filter(c=>!['从本课固定练习田开始','程序正常结束','动作条件满足','保留作物，按目标生产'].includes(c.label));
  completion=goals.filter(g=>g.pass).length/Math.max(1,goals.length);critical=feedback.pass;
  if(task.id==='lesson-boundary')clean=failures.length===1&&failures[0].action==='move'&&failures[0].args[0]==='East';
 }else{
  const score=evaluateChallenge(r)!;passed=score.passed;completion=score.goals.reduce((s,g)=>s+Math.max(0,Math.min(1,g.value/g.target)),0)/score.goals.length;
  const counts=r.result.state.economy?.counters??{},before=r.initial.economy?.counters??{};
  const cells=r.initial.cells.map((c:any)=>({...c}));let cactus=false,pumpkin=false;
  for(const e of r.events){if(!e.kind||e.kind==='complete'){
   if(e.action==='harvest'&&typeof e.value==='number'&&e.value>0){const removed=e.changes.filter(([i,c]:any)=>cells[i]?.crop&&c.crop===null);if(removed.filter(([i]:any)=>cells[i].crop==='cactus').length>1)cactus=true;if(removed.filter(([i]:any)=>cells[i].crop==='pumpkin').length>=4)pumpkin=true;}
  }for(const [i,c] of e.changes)cells[i]=c;}
  critical=task.operations.every(op=>op==='ordered-cactus'?cactus:op==='merged-pumpkin'?pumpkin:op==='relics'?score.goals.some(g=>g.id==='relics'&&g.value>=g.target):op==='home'?score.goals.some(g=>g.id==='home'&&g.value>=g.target):op.startsWith('craft:')?events.some((e:any)=>e.action==='craft'&&e.args[0]===op.slice(6)&&e.value!==false):(counts[op]??0)>(before[op]??0));
 }
 return gradeCase({id:spec.id,passed,normal,completion,primary:r.result.state[task.primary],reference,legal:!['api_error','syntax_error','runtime_error'].includes(r.result.reason),clean,critical,reason:r.result.reason,eventCount:r.events.length,evidence});
}
