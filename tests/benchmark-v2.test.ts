import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TASKS,BENCHMARK_VERSION,MANUAL_KEYS} from '../packages/benchmark-v2/catalog';
import {gradeCase,taskScore,leaderboard,validateReview,budgetReservation,mergeImportedReviews,type Bundle,type Attempt,type Review} from '../packages/benchmark-v2/scoring';
import {runCase,assess} from '../scripts/benchmark-v2-engine';

test('v2 catalog covers 18 challenges,12 lessons,24 sort cases and exact weights',()=>{
 assert.equal(TASKS.filter(t=>t.module==='challenge').length,18);assert.equal(TASKS.filter(t=>t.module==='lesson').length,12);
 assert.equal(TASKS.find(t=>t.module==='sort')!.cases.length,24);assert.equal(TASKS.flatMap(t=>t.cases).length,93);
 assert.equal(TASKS.filter(t=>t.module==='challenge').reduce((s,t)=>s+t.weight,0),630);
 assert.equal(TASKS.filter(t=>t.module==='lesson').reduce((s,t)=>s+t.weight,0),24);
 assert.equal(new Set(TASKS.flatMap(t=>t.cases.map(c=>c.id))).size,93);
 assert.ok(TASKS.every(t=>t.operations.length));
});
const input={id:'x',passed:false,normal:false,completion:2,primary:10,reference:5,legal:true,clean:true,critical:true,reason:'runtime_error',eventCount:1,evidence:'runs/x.json'};
test('import preserves local decisions while adding new answer reviews and remains idempotent',()=>{
 const make=(attemptId:string,revision:number,score:0|10):Review=>({attemptId,revision,at:'2026-09-11T00:00:00Z',reviewer:'reviewer',...Object.fromEntries(MANUAL_KEYS.map(k=>[k,{score,reason:'evidence checked',evidence:['code:1']}]))} as Review);
 const local=[make('old',4,0),make('old',8,10)],incoming=[make('old',1,0),make('new',2,0),make('new',3,10)];
 const snapshot=structuredClone({local,incoming}),merged=mergeImportedReviews(local,incoming);
 assert.deepEqual(merged.slice(0,2),local);assert.deepEqual(merged.map(r=>r.revision),[4,8,9,10]);
 assert.deepEqual(merged.slice(2).map(r=>r.strategy.score),[0,10]);
 assert.deepEqual(mergeImportedReviews(merged,incoming),merged);assert.deepEqual({local,incoming},snapshot);
});
test('objective score caps errors, excludes failed efficiency and handles zero metrics',()=>{
 assert.equal(gradeCase(input).correctness,15);assert.equal(gradeCase(input).efficiency,0);
 assert.equal(gradeCase({...input,normal:true}).correctness,30);
 assert.equal(gradeCase({...input,passed:true}).efficiency,7.5);
 assert.equal(gradeCase({...input,passed:true,primary:0,reference:0}).efficiency,15);
 assert.equal(gradeCase({...input,passed:true,primary:10,reference:0}).efficiency,0);
 assert.throws(()=>gradeCase({...input,primary:NaN}));
});
test('real boundary lesson permits its expected failure and config mismatch is rejected',async()=>{
 const t=TASKS.find(t=>t.id==='lesson-boundary')!,s=t.cases[0];
 const r=await runCase(t,s,'get_size(); for(let i=0;i<4;i++) move(East);');
 const score=assess(t,s,r,10,'r.json');assert.equal(score.passed,true);assert.equal(score.operations,15);
 assert.throws(()=>assess(t,{...s,config:{...s.config,seed:7}},r,10,'r.json'));
 const fleet=TASKS.find(t=>t.id==='fleet-overhead')!,spec=fleet.cases.find(c=>c.config.drones===8)!;
 const run=await runCase(fleet,spec,'if(get_drone_id()===0)harvest();');
 assert.equal(assess(fleet,spec,run,10,'r.json').operations,15);
});
function fixture(){
 const attempts:Attempt[]=TASKS.map(t=>({id:t.id,taskId:t.id,model:'model',round:1,status:'evaluated',answer:{source:'// code',strategy:'s',correctness:'c',complexity:'o',boundaries:'b'},cases:t.cases.map(c=>gradeCase({...input,id:c.id,passed:true,normal:true,completion:1,primary:5,reference:5})),call:{}}));
 const b:Bundle={version:BENCHMARK_VERSION,manifest:{} as any,models:['model'],attempts,reviews:[],ledger:[],providers:[]};return b;
}
test('missing manual scores never become zero or a formal total; first and revision stay separate',()=>{
 const b=fixture();assert.equal(leaderboard(b,1)[0].objective,60);assert.equal(leaderboard(b,1)[0].total,null);
 b.reviews=b.attempts.map((a,i)=>({attemptId:a.id,reviewer:'test-only',revision:i+1,at:new Date().toISOString(),...Object.fromEntries(MANUAL_KEYS.map(k=>[k,{score:10,reason:'test fixture',evidence:['code:1']}]))} as Review));
 assert.equal(leaderboard(b,1)[0].total,100);
 b.attempts.push({...b.attempts[0],id:'revision',round:2,status:'infrastructure_error',cases:[]});
 assert.equal(leaderboard(b,1)[0].total,100);assert.equal(leaderboard(b,2)[0].total,null);
 const failed={...b.attempts[1],status:'submission_error' as const,cases:[]};assert.equal(taskScore(TASKS[1],failed,[]).objective,0);b.attempts[1]=failed;assert.equal(leaderboard(b,1)[0].total,null);
});
test('manual criteria require supported values, reviewer, reasons and existing evidence',()=>{
 const a=fixture().attempts[0];const raw:any={attemptId:a.id,reviewer:'Reviewer',...Object.fromEntries(MANUAL_KEYS.map(k=>[k,{score:7.5,reason:'Matches code',evidence:['code:1']}]))};
 assert.equal(validateReview(raw,a).strategy.score,7.5);
 assert.throws(()=>validateReview({...raw,reviewer:''},a));
 for(const bad of [1,11,NaN])assert.throws(()=>validateReview({...raw,strategy:{...raw.strategy,score:bad}},a));
 assert.throws(()=>validateReview({...raw,strategy:{...raw.strategy,evidence:['code:99']}},a));
 assert.throws(()=>validateReview({...raw,strategy:{...raw.strategy,evidence:['case:unknown']}},a));
});
test('budget reserves outstanding calls and rejects unknown/overspend estimates',()=>{
 assert.equal(budgetReservation([{reserved:80}],20),20);
 assert.throws(()=>budgetReservation([{reserved:80}],20.01));assert.throws(()=>budgetReservation([],null));
 assert.equal(budgetReservation([{reserved:80,charged:5}],90),90);
 for(const reserved of [NaN,-1,Infinity])assert.throws(()=>budgetReservation([{reserved}],0));
});
