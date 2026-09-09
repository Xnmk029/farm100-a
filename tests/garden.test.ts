import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Garden,GardenStop,legacyGardenDefault as gardenDefault,gardenAt,gardenRun,applyGardenEvent,copyGarden,validateGardenRun,ready,type GardenRequest} from '../packages/garden/core';
import {executeGarden} from '../packages/garden/runner';

test('garden budgets and invalid actions never advance time or mutate resources',()=>{
  const g=new Garden({...gardenDefault,budget:2});g.act('till',[]);g.act('plant',['wheat']);const before=copyGarden(g.state);
  assert.throws(()=>g.act('wait',[1]),GardenStop);assert.deepEqual(g.state,before);assert.throws(()=>g.act('harvest',[]));assert.deepEqual(g.state,before);
  for(const [action,args]of [['move',['toString']],['wait',[0]],['plant',['unknown']],['water',[null]],['wait',[101]]] as const){
    const sim=new Garden(gardenDefault);assert.throws(()=>sim.act(action,[...args]));assert.deepEqual(sim.state,sim.initial);
  }
});
test('garden production conserves resources and water changes growth timing',()=>{
  const wet=new Garden(gardenDefault),dry=new Garden(gardenDefault);
  for(const sim of [wet,dry]){sim.act('till',[]);sim.act('plant',['wheat']);}
  wet.act('water',[]);dry.act('wait',[4]);wet.act('wait',[100]);dry.act('wait',[100]);
  assert.ok(wet.state.cells[0].growth>dry.state.cells[0].growth);
  wet.act('wait',[20]);assert.ok(ready(wet.state.cells[0]));assert.equal(wet.act('harvest',[]),3);assert.equal(wet.state.inventory.grain,3);
  assert.equal(wet.act('plant',['carrot']),true);assert.equal(wet.state.inventory.grain,2);
  assert.equal(wet.act('refill',[]),true);assert.equal(wet.state.inventory.grain,1);assert.equal(wet.state.inventory.water,71);
  wet.act('wait',[100]);wet.act('wait',[100]);wet.act('wait',[100]);wet.act('harvest',[]);assert.equal(wet.state.inventory.roots,2);
  assert.equal(wet.state.harvests,2);assert.equal(wet.state.cells[0].cycles,2);
});
test('garden runs eight real production cycles, reopens and branches deterministically',async()=>{
  const source=await readFile('examples/garden-cycle.js','utf8');
  const req:GardenRequest={runId:randomUUID(),source,config:gardenDefault};
  const r=await executeGarden(req);
  assert.equal(r.result.reason,'finished',r.result.message);assert.equal(r.result.state.harvests,8*36);assert.equal(r.result.state.planted,8*36);
  assert.equal(r.result.state.inventory.roots,7*18*2);
  const opened=validateGardenRun(JSON.parse(JSON.stringify(r)));assert.deepEqual(opened.result.state,r.result.state);
  const states=[r.initial];for(const e of r.events)states.push(applyGardenEvent(states.at(-1)!,e));
  for(let i=0;i<100;i++){const n=(i*7919)%states.length;assert.deepEqual(gardenAt(r,n),states[n]);}
  const repeated=await executeGarden({...req,runId:randomUUID()});assert.deepEqual(repeated.events,r.events);
  const middle=gardenAt(r,600);const resumeSource='let p=get_position(); move(East); inspect();';
  const a=await executeGarden({...req,source:resumeSource,initial:middle});const b=await executeGarden({...req,source:resumeSource,initial:JSON.parse(JSON.stringify(middle))});assert.deepEqual(a.events,b.events);
  const tampered=JSON.parse(JSON.stringify(r));tampered.events[100].inventory.grain++;assert.throws(()=>validateGardenRun(tampered),/事件/);
  await mkdir('artifacts/garden',{recursive:true});await writeFile('artifacts/garden/core-run.farmgarden',JSON.stringify(r));
  await writeFile('artifacts/garden/production-qa.json',JSON.stringify({reason:r.result.reason,harvests:r.result.state.harvests,planted:r.result.state.planted,inventory:r.result.state.inventory,tick:r.result.state.tick,events:r.events.length,repeatable:true,randomSeeks:100},null,2));
});
test('garden sandbox locks APIs after budget, cancellation, OOM and hostile error getters',async()=>{
  const request=(source:string):GardenRequest=>({runId:randomUUID(),source,config:{...gardenDefault,budget:3}});
  const budget=await executeGarden(request('try{while(true)till()}catch(e){} try{plant(Wheat)}catch(e){}'));assert.equal(budget.result.reason,'budget_exceeded');assert.equal(budget.result.state.planted,0);
  const loop=await executeGarden(request('while(true){}'),{wallMs:35});assert.equal(loop.result.reason,'wall_timeout');
  const oom=await executeGarden(request('new ArrayBuffer(256*1024*1024)'));assert.equal(oom.result.reason,'memory_limit');
  const hostile=await executeGarden(request('throw {get name(){till();plant(Wheat);return "Error"},get message(){while(true){}}}'));assert.equal(hostile.events.length,0);assert.equal(hostile.result.reason,'runtime_error');
  const access=await executeGarden(request('if(typeof process!="undefined"||typeof require!="undefined"||typeof fetch!="undefined"||typeof Date!="undefined") throw Error("host leak");'));assert.equal(access.result.reason,'finished');
});

test('garden setup timeout and cancellation return terminal records without executing guest code',async()=>{
  const req:GardenRequest={runId:randomUUID(),source:'till();console.log("must not run")',config:gardenDefault};
  for(const options of [{wallMs:0},{cancelled:()=>true}]){
    const r=await executeGarden(req,options);
    assert.equal(r.result.reason,'wallMs' in options?'wall_timeout':'cancelled');
    assert.equal(r.events.length,0);assert.equal(r.logs.length,0);
    assert.deepEqual(r.result.state,r.initial);validateGardenRun(r);
  }
  const next=await executeGarden({...req,source:'get_position()'});
  assert.equal(next.result.reason,'finished');assert.equal(next.events.length,1);
});
