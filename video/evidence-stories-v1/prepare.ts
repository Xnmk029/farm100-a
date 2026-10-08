import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gardenAt,applyGardenEvent} from '../../packages/garden/core';
import {canonical} from '../../packages/protocol';
const root=path.resolve('video/evidence-stories-v1'),pub=path.join(root,'public');
await mkdir(pub,{recursive:true});await mkdir(path.join(root,'evidence'),{recursive:true});
const hash=(b:any)=>createHash('sha256').update(b).digest('hex');
const id='f2dd6a7c-16de-42f8-8dcf-abcb592b3dc5';
const registry=JSON.parse(await readFile('artifacts/agent-gateway/registry.json','utf8'));
const entry=registry.filter((r:any)=>r.sessionId===id).at(-1);assert(entry);
const raw=await readFile(path.join(entry.directory,'bundle.json'));assert.equal(hash(raw),entry.bundleHash);
const bundle=JSON.parse(raw.toString()),index=JSON.parse(await readFile(path.join(entry.directory,'evidence-index.json'),'utf8'));
const ledger:any={sessionId:id,bundleHash:entry.bundleHash,archive:entry.directory,identity:'Gateway self-declared; host dispatch configured gpt-6.1-sol/high',usage:null,cost:null,files:[],claims:[]};
const data:any={sessionId:id,bundleHash:entry.bundleHash,model:'GPT-6.1 Sol',reasoning:'high',stories:{}};
function stateView(s:any,visits:number[],counts:any){return {tick:s.tick,x:s.x,y:s.y,grain:s.inventory.grain,harvests:s.harvests,actors:s.fleet?.drones.map((d:any)=>({id:d.id,x:d.x,y:d.y})),crops:s.cells.map((c:any)=>!!c.crop),maze:s.maze?{seen:s.maze.seen,loot:s.maze.loot,keys:s.maze.keys,collected:s.maze.collected}:null,visits:[...visits],counts:structuredClone(counts)};}
for(const task of ['maze-3','fleet-harvest']){
 const attempts=bundle.attempts.filter((a:any)=>a.taskId===task),runs=[];
 for(const a of attempts){
  const c=a.cases.find((c:any)=>c.id.includes('/7/')),file=path.join(entry.directory,c.evidence),bytes=await readFile(file);assert.equal(hash(bytes),index[c.evidence]);
  const r=JSON.parse(bytes.toString());assert.equal(hash(a.answer.source),a.sourceHash);
  const visits=Array(r.initial.size**2).fill(0),counts={moves:0,failed:0,failedCollect:0,failedMove:0,collect:0,harvest:0,byActor:Array.from({length:r.initial.fleet?.drones.length??1},()=>({harvest:0,failed:0,moves:0}))};
  visits[0]=1;let state=r.initial;
  const trace=[{seq:0,action:'initial',value:null,...stateView(state,visits,counts)}],moves:any[]=[],notable:any[]=[];
  for(let i=0;i<r.events.length;i++){
   const e=r.events[i],actor=e.actor??0,from=e.kind==='complete'?state.fleet?.drones.find((d:any)=>d.id===actor):state;
   state=applyGardenEvent(state,e);
   if(e.kind==='dispatch')continue;
   if(actor<0){trace.push({seq:e.seq,action:e.action,value:null,...stateView(state,visits,counts)});continue;}
   if(e.value===false){counts.failed++;counts.byActor[actor].failed++;if(e.action==='collect')counts.failedCollect++;if(e.action==='move')counts.failedMove++;}
   if(e.action==='move'&&e.value===true){counts.moves++;counts.byActor[actor].moves++;const to=e.kind==='complete'?state.fleet.drones.find((d:any)=>d.id===actor):state;visits[to.y*state.size+to.x]++;moves.push({actor,seq:e.seq,start:e.fromTick,end:e.tick,from:{x:from.x,y:from.y},to:{x:to.x,y:to.y}});}
   if(e.action==='collect'&&e.value!==false)counts.collect++;
   if(e.action==='harvest'&&e.value!==false){counts.harvest++;counts.byActor[actor].harvest++;}
   if((e.action==='collect'&&e.value!==false)||(e.value===false&&!notable.some(n=>n.kind==='first-false')))notable.push({kind:e.value===false?'first-false':'collect',seq:e.seq,tick:e.tick,x:e.x,y:e.y,value:e.value,action:e.action});
   trace.push({seq:e.seq,action:e.action,value:typeof e.value==='object'?null:e.value,...stateView(state,visits,counts)});
  }
  assert.equal(canonical(state),canonical(r.result.state),'event restoration differs from archived terminal');
  for(const seq of [0,Math.floor(r.events.length/2),r.events.length]){let st=r.initial;for(let i=0;i<seq;i++)st=applyGardenEvent(st,r.events[i]);assert.equal(canonical(st),canonical(gardenAt(r,seq)));}
  const summaries=a.cases.map((c:any)=>({id:c.id,passed:c.passed,reason:c.reason,tick:c.primary,objective:c.correctness+c.operations+c.efficiency}));
  const item={attemptId:a.id,round:a.round,caseId:c.id,case:c,initial:r.initial,terminal:trace.at(-1),endTick:r.result.state.tick,reason:r.result.reason,source:a.answer.source,sourceHash:a.sourceHash,trace,moves,notable,allCases:summaries};
  runs.push(item);ledger.files.push({attempt:a.id,case:c.id,path:c.evidence,sha256:hash(bytes),sourceHash:a.sourceHash,eventCount:r.events.length,restoredTerminal:true});
  await writeFile(path.join(root,'evidence',a.id+'.js'),a.answer.source);
 }
 assert.equal(canonical(runs[0].initial),canonical(runs[1].initial),'rounds do not share initial state');
 data.stories[task]={id:task,size:runs[0].initial.size,runs};
}
const maze=data.stories['maze-3'].runs,fleet=data.stories['fleet-harvest'].runs;
assert.equal(maze[0].reason,'recording_limit');assert.equal(maze[1].endTick,1292);assert.equal(maze[0].terminal.maze.collected,3);assert.equal(maze[1].terminal.counts.failed,0);
assert.equal(fleet[0].terminal.harvests,8);assert.equal(fleet[1].terminal.harvests,64);assert.equal(fleet[1].endTick,172);
ledger.claims=[
 {id:'M1',type:'record',claim:'maze-3首答触发记录上限，修订seed7于1292 tick结束并通过',sources:maze.map((r:any)=>r.caseId+'@'+r.attemptId)},
 {id:'M2',type:'derived',claim:`首答seed7有${maze[0].terminal.counts.failedCollect}次collect返回false`,method:'count action=collect,value=false; exclude dispatch',sources:['maze-3-1']},
 {id:'M3',type:'code-analysis',claim:'loot(s)会将全局keys误识别为本地物品；collect失败仍令changed=true，反复重启DFS',sources:['maze-3-1.js'],limits:'related implementation, not recorded execution-line tracing'},
 {id:'M4',type:'code-analysis',claim:'修订限制为本地loot并用collected集合去重',sources:['maze-3-2.js']},
 {id:'F1',type:'record',claim:'fleet-harvest seed7首答8/64收获，修订64/64且172 tick结束',sources:['fleet-harvest-1','fleet-harvest-2']},
 {id:'F2',type:'code-analysis',claim:'首答y需增加时向North移动，与坐标约定相反；修订交换South/North',sources:['fleet-harvest-1.js','fleet-harvest-2.js']}
];
await writeFile(path.join(pub,'data.json'),JSON.stringify(data));await writeFile(path.join(root,'evidence-ledger.json'),JSON.stringify(ledger,null,2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(data.stories).map(([k,v]:any)=>[k,v.runs.map((r:any)=>({attempt:r.attemptId,end:r.endTick,reason:r.reason,counts:r.terminal.counts,notable:r.notable,allCases:r.allCases}))])),null,2));
