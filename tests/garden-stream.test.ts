import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {executeGarden} from '../packages/garden/runner';
import {EventBuffer} from '../packages/garden/stream';
import {GardenTraceVerifier} from '../packages/garden/trace';
import {gardenDefault,freshGarden,validateGardenRun,type GardenRequest,type GardenEvent} from '../packages/garden/core';
import {TECH} from '../packages/garden/content';
function request(source:string,drones?:1|2|4|8,budget=200000):GardenRequest{
  const config={...gardenDefault,size:4 as const,drones,budget},initial=freshGarden(config);initial.economy!.unlocks=TECH.map(t=>t.id);return {runId:randomUUID(),config,initial,source};
}
test('event buffer retains absolute sequence across release and speculative pop',()=>{
  const b=new EventBuffer();b.push({seq:0} as GardenEvent,{seq:0} as GardenEvent);b.release(1);b.push({seq:0} as GardenEvent);b.pop();b.push({seq:0} as GardenEvent);
  assert.deepEqual(b.map(e=>e.seq),[2,3]);assert.equal(b.total,3);assert.equal(b.peak,2);assert.ok(!(b.slice() instanceof EventBuffer));assert.throws(()=>b.release(3));
});
test('streamed and retained traces agree with delayed sinks for all fleet sizes',async()=>{
  for(const drones of [undefined,1,2,4,8] as const){
    const req=request(drones?'const id=get_drone_id();for(let i=0;i<35;i++){write_shared("d"+id,i);wait(id+1);}barrier("done");':'for(let i=0;i<140;i++){till();wait(1);}',drones);
    const retained=await executeGarden(req),events:GardenEvent[]=[],verifier=new GardenTraceVerifier(req);validateGardenRun(retained);
    const receipt=await executeGarden(req,{stream:true,onBatch:async batch=>{assert.ok(batch.length<=64);await new Promise(r=>setTimeout(r,1));events.push(...batch);verifier.append(batch);}});verifier.finish(receipt);assert.ok(verifier.peakBufferedEvents<=8);
    assert.deepEqual(events,retained.events);assert.deepEqual(receipt.result,retained.result);assert.deepEqual(receipt.initial,retained.initial);assert.equal(receipt.eventCount,events.length);assert.equal(receipt.format,'farm100-garden-receipt');assert.ok(!('events' in receipt));assert.ok(receipt.peakBufferedEvents<=96);
  }
});
test('streaming stops on cancellation, budgets, compute loops and hostile diagnostic getters',async()=>{
  for(const drones of [undefined,8] as const){
    let cancel=false;const cancelled=await executeGarden(request('for(let i=0;i<1000;i++)wait(1);',drones),{stream:true,cancelled:()=>cancel,onBatch:async()=>{cancel=true;}});assert.equal(cancelled.result.reason,'cancelled');
    const budget=await executeGarden(request('while(true)wait(1);',drones,90),{stream:true,onBatch:async()=>{}});assert.equal(budget.result.reason,'budget_exceeded');assert.equal(budget.result.state.cost,drones?88:90);
    const busy=await executeGarden(request('while(true){}',drones),{stream:true,onBatch:async()=>{}});assert.equal(busy.result.reason,'instruction_limit');
    const hostile=await executeGarden(request('throw {get name(){till();return "x"},get message(){while(true){}}};',drones),{stream:true,onBatch:async()=>{}});assert.equal(hostile.result.reason,'runtime_error');assert.equal(hostile.result.state.cells[0].soil,false);
  }
});
test('sink failures are propagated once without retrying an uncommitted batch',async()=>{
  for(const drones of [undefined,8] as const){let calls=0;const failure=Error('ENOSPC test');await assert.rejects(()=>executeGarden(request('try{for(let i=0;i<1000;i++)wait(1);}catch(e){wait(1);}',drones),{stream:true,onBatch:async()=>{calls++;throw failure;}}),e=>e===failure);assert.equal(calls,1);}
  await assert.rejects(()=>executeGarden(request('wait(1);'),{stream:true}),/消费者/);
});
test('large streams pass former caps while retaining bounded event windows',async()=>{
  for(const drones of [undefined,8] as const){let count=0;const req=request(`for(let i=0;i<${drones?4000:12000};i++)wait(1);`,drones),verifier=new GardenTraceVerifier(req);const receipt=await executeGarden(req,{stream:true,onBatch:async events=>{for(const e of events)assert.equal(e.seq,++count);verifier.append(events);}});verifier.finish(receipt);assert.equal(receipt.result.reason,'finished');assert.equal(receipt.eventCount,count);assert.equal(count,drones?64008:12000);assert.ok(receipt.peakBufferedEvents<=96);assert.ok(verifier.peakBufferedEvents<=8);}
});
test('incremental verifier rolls back corrupt chunks and preserves mid-tie prefixes',async()=>{
  assert.throws(()=>new GardenTraceVerifier({...request('wait(1);'),source:undefined as any}));
  const req=request('wait(1);wait(2);',8),run=await executeGarden(req),verifier=new GardenTraceVerifier(req);
  verifier.append(run.events.slice(0,9));const state=verifier.state;assert.equal(verifier.eventCount,9);
  const bad=structuredClone(run.events.slice(9,20));bad.at(-1)!.cost++;
  assert.throws(()=>verifier.append(bad),/引擎不一致/);assert.equal(verifier.eventCount,9);assert.deepEqual(verifier.state,state);
  verifier.append(run.events.slice(9));assert.deepEqual(verifier.state,run.result.state);
  const {events,snapshots,...metadata}=run,receipt={...metadata,format:'farm100-garden-receipt' as const,eventCount:events.length,peakBufferedEvents:64};verifier.finish(receipt);
  assert.throws(()=>verifier.finish({...receipt,result:{...receipt.result,reason:'cancelled'}}),/终止事件/);
});
