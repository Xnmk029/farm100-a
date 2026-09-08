import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {executeGarden} from '../packages/garden/runner';
import {gardenDefault,validateGardenRun,gardenAt,applyGardenEvent,type GardenRun} from '../packages/garden/core';
import {challengeConfig,evaluateChallenge} from '../packages/garden/challenges';
import {challengeSource} from '../packages/garden/challenge-examples';
const full=process.argv.includes('--full'),dir='artifacts/fleet';await mkdir(dir,{recursive:true});
const rows:any[]=[],hash=(r:GardenRun)=>createHash('sha256').update(JSON.stringify(r.events)).digest('hex');
for(const id of ['fleet-harvest','fleet-repair','fleet-overhead'])for(const drones of [1,2,4,8] as const)for(let seed=0;seed<(full?20:1);seed++)for(const variant of ['baseline','improved','failure'] as const){
  const request={runId:randomUUID(),config:challengeConfig(id,seed,drones),source:challengeSource(id,variant)};
  const run=await executeGarden(request);validateGardenRun(run);const score=evaluateChallenge(run)!;
  assert.equal(score.passed,variant!=='failure',`${id}/${drones}/${variant}: ${run.result.message}`);
  rows.push({id,drones,seed,variant,...score,hash:hash(run)});
  if(seed===0)await writeFile(`${dir}/${id}-${drones}-${variant}.farmgarden`,JSON.stringify(run));
}
const representatives=[];
for(const [id,drones] of [['fleet-overhead',1],['fleet-repair',4],['fleet-harvest',8]] as const){
  const req={runId:randomUUID(),config:challengeConfig(id,42,drones),source:challengeSource(id,'improved')};
  const r=await executeGarden(req),expected=hash(r);validateGardenRun(r);
  for(let repeat=1;repeat<10;repeat++){const next=await executeGarden({...req,runId:randomUUID()});assert.equal(hash(next),expected);}
  const states=[r.initial];for(const e of r.events)states.push(applyGardenEvent(states.at(-1)!,e));
  for(let i=0;i<100;i++){const seq=i*7919%states.length;assert.deepEqual(gardenAt(r,seq),states[seq]);}
  representatives.push({id,drones,repeats:10,seeks:100,hash:expected});
}
// The original families also accept fleet code; only drone 0 owns this sequential reference.
const families=[];
for(const id of ['farm-1','layout-1','schedule-3','sort-1','maze-3']){
  const r=await executeGarden({runId:randomUUID(),config:challengeConfig(id,42,8),source:`if(get_drone_id()===0){${challengeSource(id)}\n}`});
  validateGardenRun(r);assert.ok(evaluateChallenge(r)!.passed);families.push({id,score:evaluateChallenge(r)});
}
const progression=await executeGarden({runId:randomUUID(),config:{...gardenDefault,budget:200000},source:await readFile('examples/garden-fleet-progress.js','utf8')});
validateGardenRun(progression);assert.equal(progression.result.reason,'finished',progression.result.message);assert.equal(progression.result.state.economy!.unlocks.length,23);
const deployment=await executeGarden({runId:randomUUID(),config:{...progression.config,drones:8},initial:progression.result.state,source:'const id=get_drone_id();write_shared("station"+id,id);barrier("ready");move(South);'});
validateGardenRun(deployment);assert.equal(deployment.result.reason,'finished');assert.equal(Object.keys(deployment.result.state.fleet!.shared).length,8);
await writeFile(`${dir}/progression.farmgarden`,JSON.stringify(progression));await writeFile(`${dir}/deployment.farmgarden`,JSON.stringify(deployment));
const benefit=['fleet-harvest','fleet-repair'].map(id=>{const a=rows.find(r=>r.id===id&&r.drones===1&&r.seed===0&&r.variant==='improved'),b=rows.find(r=>r.id===id&&r.drones===8&&r.seed===0&&r.variant==='improved');assert.ok(b.tick<a.tick);return {id,one:a.tick,eight:b.tick,speedup:a.tick/b.tick,oneCost:a.cost,eightCost:b.cost};});
const overhead=rows.filter(r=>r.id==='fleet-overhead'&&r.drones===8&&r.seed===0);assert.ok(overhead.find(r=>r.variant==='improved').tick>overhead.find(r=>r.variant==='baseline').tick);
const report={pass:true,challengeRuns:rows.length,representatives,families,benefit,overhead,progression:{research:23,ticks:progression.result.state.tick,events:progression.events.length,deployed:8},rows};
await writeFile(`${dir}/${full?'full':'smoke'}-qa.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:undefined,families:families.map(f=>f.id)},null,2));
