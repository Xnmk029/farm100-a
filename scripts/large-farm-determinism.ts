import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {executeGarden} from '../packages/garden/runner';
import {Garden,applyGardenEvent,copyGarden,type GardenState} from '../packages/garden/core';
import {GardenTraceVerifier} from '../packages/garden/trace';
import {GardenJournal,GardenHistory} from '../packages/garden-storage/journal';
import {canonical} from '../packages/protocol';

const input=path.resolve(process.argv[2]??'artifacts/large-farm/preparation-v2/earned.garden.json'),out=path.resolve(process.argv[3]??'artifacts/large-farm/determinism');
await mkdir(out,{recursive:true});const raw=await readFile(input),saved=JSON.parse(raw.toString('utf8'));
assert.equal(saved.config.size,32);assert.equal(saved.config.drones,8);
// Exercise the actual earned world and production code, bounded by operation cost.
// This is a repeatability test, separate from the full 30-minute performance run.
const config={...saved.config,budget:5000},initial=new Garden(config,saved.state).initial;
const hash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const report:any={pass:false,startedAt:new Date().toISOString(),input,inputSHA256:createHash('sha256').update(raw).digest('hex'),config,sourceSHA256:createHash('sha256').update(saved.source).digest('hex'),runs:[],seeks:[]};
const save=()=>writeFile(path.join(out,'determinism-qa.json'),JSON.stringify(report,null,2));
let expectedHash='',expectedResult='',firstId='',count=0;const positions=new Set<number>(),expectedStates=new Map<number,string>();
try{
  for(let repeat=0;repeat<10;repeat++){
    const req={runId:randomUUID(),config,initial:copyGarden(initial),source:saved.source},verifier=new GardenTraceVerifier(req),eventsHash=createHash('sha256');
    const journal=repeat===0?await GardenJournal.create(path.join(out,'history'),req):undefined;
    let state:GardenState=copyGarden(initial),events=0,peak=0;const planted=new Set<string>(),started=performance.now();
    if(repeat===1)expectedStates.set(0,hash(initial));
    const receipt=await executeGarden(req,{stream:true,wallMs:600000,onBatch:async batch=>{
      verifier.append(batch);
      for(const event of batch){eventsHash.update(canonical(event)+'\n');assert.equal(event.seq,++events);state=applyGardenEvent(state,event);if(event.action==='plant'&&event.kind==='complete'&&event.value===true)planted.add(String(event.args[0]));if(repeat===1&&positions.has(events))expectedStates.set(events,hash(state));}
      peak=Math.max(peak,batch.length);if(journal)await journal.append(batch);
    }});
    verifier.finish(receipt);if(journal)await journal.finish(receipt);
    assert.equal(receipt.result.reason,'budget_exceeded');assert.deepEqual(receipt.result.state,state);assert.equal(receipt.eventCount,events);assert.ok(peak<=64);assert.equal(planted.size,8);assert.ok(state.harvests>initial.harvests);assert.ok(receipt.peakBufferedEvents<=96);
    const eventHash=eventsHash.digest('hex'),resultHash=hash(receipt.result);
    if(repeat===0){
      expectedHash=eventHash;expectedResult=resultHash;firstId=receipt.runId;count=events;
      positions.add(0);positions.add(count);let seed=20260910;while(positions.size<100){seed=(Math.imul(seed,1664525)+1013904223)>>>0;positions.add(seed%(count+1));}
      await writeFile(path.join(out,'representative-receipt.json'),JSON.stringify(receipt));
    }else{assert.equal(eventHash,expectedHash,'event stream changed');assert.equal(resultHash,expectedResult,'terminal world changed');}
    report.runs.push({repeat:repeat+1,events,eventHash,resultHash,reason:receipt.result.reason,peak,elapsedMs:performance.now()-started});await save();console.log(`repeat ${repeat+1}/10 passed`);
  }
  const history=new GardenHistory(path.join(out,'history')),opened=await history.openPaged(firstId);assert.equal(opened.warning,'');assert.equal(opened.receipt.eventCount,count);
  assert.equal(expectedStates.size,100);
  for(const seq of positions){const page=await history.window(firstId,{seq});assert.equal(page.seq,seq);assert.equal(hash(page.state),expectedStates.get(seq));assert.ok(page.events.length<=320);report.seeks.push({seq,events:page.events.length});}
  report.pass=true;
}catch(error){report.error=String(error);process.exitCode=1;}
report.completedAt=new Date().toISOString();await save();console.log(JSON.stringify({pass:report.pass,error:report.error,repeats:report.runs.length,seeks:report.seeks.length}));
