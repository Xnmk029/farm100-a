import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {TECH} from '../packages/garden/content';
import {Garden,gardenDefault,freshGarden,copyGarden,gardenAt,applyGardenEvent,validateGardenRun,type GardenRequest} from '../packages/garden/core';
import {executeFleet} from '../packages/fleet/runner';
function request(source:string,drones:1|2|4|8=2,budget=10000):GardenRequest{const config={...gardenDefault,size:4 as const,drones,budget},initial=freshGarden(config);initial.economy!.unlocks=TECH.map(t=>t.id);return {runId:randomUUID(),config,initial,source};}
const run=async(source:string,n:1|2|4|8=2)=>{const r=await executeFleet(request(source,n));validateGardenRun(r);return r;};
test('restarted fleet host and worker use identical initial state and reject outstanding actions',async()=>{
  const first=await run('write_shared("kept",7);move(East);');
  const req={runId:randomUUID(),config:first.config,source:'wait(1);',initial:first.result.state};
  const host=new Garden(req.config,req.initial),restarted=await executeFleet(req);validateGardenRun(restarted);
  assert.deepEqual(host.initial,restarted.initial);assert.equal(host.initial.fleet!.shared.kept,7);
  assert.equal(first.result.state.fleet!.drones[0].status,'done');
  const pending=copyGarden(first.initial);pending.fleet!.pending=[{actor:0,action:'wait',args:[1],start:0,end:1,cost:1}];
  assert.throws(()=>new Garden(req.config,pending),/取消未完成/);
});
test('independent drone programs share one simulation clock and stable completion order',async()=>{
  const source='var local=get_drone_id();wait(10);if(local!==get_drone_id())throw Error("shared heap");';
  for(const n of [1,2,4,8] as const){const r=await run(source,n);assert.equal(r.result.reason,'finished');assert.equal(r.result.state.tick,12);assert.equal(r.result.state.cost,n*12);assert.deepEqual(r.events.filter(e=>e.kind==='complete'&&e.action==='wait').map(e=>e.actor),Array.from({length:n},(_,i)=>i));}
});
test('same-cell harvest and last input material are conserved across competing drones',async()=>{
  const req=request('harvest();plant(Carrot);',4);Object.assign(req.initial!.cells[0],{soil:true,crop:'wheat',growth:120});req.initial!.inventory.grain=0;
  const r=await executeFleet(req);validateGardenRun(r);assert.equal(r.result.state.harvests,1);assert.equal(r.result.state.inventory.grain,2);assert.equal(r.events.filter(e=>e.kind==='complete'&&e.action==='harvest'&&e.value!==false).length,1);assert.equal(r.result.state.planted,1);
  const craft=request('craft("boards");',4);craft.initial!.economy!.stock.timber=2;const c=await executeFleet(craft);validateGardenRun(c);assert.equal(c.result.state.economy!.stock.timber,0);assert.equal(c.result.state.economy!.stock.boards,2);assert.equal(c.events.filter(e=>e.kind==='complete'&&e.action==='craft'&&e.value===false).length,3);
});
test('atomic claims are unique, barriers synchronize, and mismatched barriers terminate',async()=>{
  const r=await run('const id=get_drone_id();if(id===0)write_shared("next",0);barrier("ready");let old;do{old=read_shared("next");}while(!compare_exchange("next",old,old+1).exchanged);write_shared("job"+id,old);barrier("done");',8);
  assert.equal(r.result.reason,'finished');assert.equal(r.result.state.fleet!.shared.next,8);assert.deepEqual(Object.entries(r.result.state.fleet!.shared).filter(([k])=>k.startsWith('job')).map(([,v])=>v).sort(),[0,1,2,3,4,5,6,7]);
  for(const source of ['barrier("phase"+get_drone_id());','if(get_drone_id()===0)barrier("alone");']){const d=await run(source);assert.equal(d.result.reason,'deadlock');assert.equal(d.result.state.fleet!.pending.length,0);}
});
test('aggregate budget reservations are atomic and forbidden values cannot enter shared state',async()=>{
  const r=await executeFleet(request('till();',2,1));validateGardenRun(r);assert.equal(r.result.reason,'budget_exceeded');assert.equal(r.result.state.cost,0);assert.equal(r.result.state.tick,0);assert.equal(r.result.state.cells[0].soil,false);assert.equal(r.result.state.fleet!.pending.length,0);
  for(const source of ['write_shared("__proto__",1);','write_shared("x",{});','compare_exchange("x",null,Infinity);']){const bad=await run(source);assert.equal(bad.result.reason,'api_error');assert.deepEqual(bad.result.state.fleet!.shared,{});}
});
test('fleet sandbox stops compute loops, OOM, cancellation and hostile error getters',async()=>{
  const busy=await executeFleet(request('while(true){}'),{interruptLimit:5});assert.equal(busy.result.reason,'instruction_limit');validateGardenRun(busy);
  const oom=await run('new ArrayBuffer(256*1024*1024);');assert.equal(oom.result.reason,'memory_limit');
  const hostile=await run('throw {get name(){till();return "Oops"},get message(){while(true){}}};');assert.equal(hostile.result.reason,'runtime_error');assert.equal(hostile.result.state.cells[0].soil,false);
  let cancel=false;const cancelled=await executeFleet(request('for(let i=0;i<1000;i++)wait(1);'),{cancelled:()=>cancel,onBatch:async()=>{cancel=true;}});assert.equal(cancelled.result.reason,'cancelled');validateGardenRun(cancelled);
  const safe=await run('if(typeof process!=="undefined"||typeof require!=="undefined"||typeof fetch!=="undefined"||typeof Date!=="undefined")throw Error("leak");');assert.equal(safe.result.reason,'finished');
});
test('fleet queues, shared state and growth replay exactly, including prefixes and tamper rejection',async()=>{
  const req=request('const id=get_drone_id();for(let i=0;i<12;i++){write_shared("d"+id,i);wait(id+1);}');
  const a=await executeFleet(req),b=await executeFleet({...req,runId:randomUUID()},{onBatch:async()=>{await new Promise(r=>setTimeout(r,2));}});assert.deepEqual(a.events,b.events);validateGardenRun(a);
  const states=[a.initial];for(const e of a.events)states.push(applyGardenEvent(states.at(-1)!,e));for(let i=0;i<100;i++){const n=i*7919%states.length;assert.deepEqual(gardenAt(a,n),states[n]);}
  const bad=JSON.parse(JSON.stringify(a));bad.events.find((e:any)=>e.kind==='dispatch').fleet.pending[0].end++;assert.throws(()=>validateGardenRun(bad),/事件/);
  const index=a.events.findIndex((e,i)=>e.kind==='complete'&&a.events[i+1]?.tick===e.tick&&a.events[i+1]?.kind==='complete');const prefix={...a,events:a.events.slice(0,index+1),snapshots:a.snapshots.filter(s=>s.seq<=index+1),complete:false,result:{reason:'runner_crash' as const,message:'prefix',state:states[index+1]}};validateGardenRun(prefix);
});

test('complete failed fleet records require an explicit terminal event',async()=>{
  const r=await run('wait(1);');const changed=JSON.parse(JSON.stringify(r));changed.result.reason='cancelled';
  assert.throws(()=>validateGardenRun(changed),/终止事件/);
});
