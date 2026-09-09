import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {executeGarden} from '../packages/garden/runner';
import {gardenDefault,validateGardenState} from '../packages/garden/core';
import {GardenJournal,GardenHistory} from '../packages/garden-storage/journal';
import {GardenTraceVerifier} from '../packages/garden/trace';

const dir=process.argv[2]??'artifacts/large-farm/preparation';await mkdir(dir,{recursive:true});
const source=await readFile('examples/garden-large-progress.js','utf8');
const request={runId:randomUUID(),config:{...gardenDefault,size:32 as const,budget:200000},source};
const journal=await GardenJournal.create(dir+'/history',request),verifier=new GardenTraceVerifier(request);
let batches=0;const start=performance.now();
const receipt=await executeGarden(request,{stream:true,onBatch:async events=>{
  verifier.append(events);await journal.append(events);
  if(++batches%25===0)console.log(JSON.stringify({events:verifier.eventCount,tick:verifier.state.tick,extent:verifier.state.economy!.extent,seconds:(performance.now()-start)/1000}));
}});
verifier.finish(receipt);await journal.finish(receipt);
await writeFile(dir+'/progression-receipt.json',JSON.stringify(receipt));
assert.equal(receipt.result.reason,'finished',receipt.result.message);
assert.equal(receipt.result.state.economy!.extent,32);assert.equal(receipt.result.state.economy!.unlocks.length,23);
const reopened=await new GardenHistory(dir+'/history').openPaged(receipt.runId);assert.deepEqual(reopened.receipt.result.state,receipt.result.state);
validateGardenState(receipt.result.state,request.config);
const production=await readFile('examples/garden-mixed-production.js','utf8');
await writeFile(dir+'/earned.garden.json',JSON.stringify({format:'farm100-garden-save',version:request.config.rule,config:{...request.config,drones:8},state:receipt.result.state,source:production}));
await writeFile(dir+'/preparation-qa.json',JSON.stringify({pass:true,runId:receipt.runId,sourceSHA256:createHash('sha256').update(source).digest('hex'),extent:32,research:23,events:receipt.eventCount,ticks:receipt.result.state.tick,cost:receipt.result.state.cost,elapsedMs:performance.now()-start,peakEvents:receipt.peakBufferedEvents,verifierPeak:verifier.peakBufferedEvents},null,2));
console.log('Earned 32x32 eight-drone save prepared and reopened.');
