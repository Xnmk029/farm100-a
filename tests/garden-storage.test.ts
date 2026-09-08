import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {GardenJournal,GardenHistory} from '../packages/garden-storage/journal';
import {executeGarden} from '../packages/garden/runner';
import {gardenDefault,gardenAt,validateGardenRun} from '../packages/garden/core';
import {challengeConfig} from '../packages/garden/challenges';
import {challengeSource} from '../packages/garden/challenge-examples';
const root=()=>mkdtemp(path.join(os.tmpdir(),'farm100-journal-test-'));
test('durable batches reopen with full deterministic state and indexed seeks',async()=>{
  for(const config of [gardenDefault,challengeConfig('fleet-repair',7,8),{...gardenDefault,rule:'garden-v0.4.0' as const}]){
    const dir=await root(),req={runId:randomUUID(),config,source:config.challenge?challengeSource(config.challenge):'for(let i=0;i<200;i++)wait(1);'},j=await GardenJournal.create(dir,req);
    const r=await executeGarden(req,{onBatch:e=>j.append(e)});await j.finish(r);
    const h=new GardenHistory(dir),recovered=await h.recover(req.runId);assert.equal(recovered.warning,'');assert.deepEqual(recovered.run,r);
    for(let i=0;i<100;i++){const seq=i*7919%(r.events.length+1);assert.deepEqual((await h.frame(req.runId,seq)).state,gardenAt(r,seq));}
    const list=await h.list({query:r.source.split('\n')[0].replace(/^\/\/\s*/,'').slice(0,12)});assert.equal(list.total,1);assert.equal(list.items[0].status,'finished');
  }
});
test('crash recovers flushed prefix without trusting stale index or partial temporary files',async()=>{
  const dir=await root(),req={runId:randomUUID(),config:challengeConfig('fleet-harvest',0,8),source:challengeSource('fleet-harvest')};
  const r=await executeGarden(req),j=await GardenJournal.create(dir,req);await j.append(r.events.slice(0,64));await j.append(r.events.slice(64,128));
  await writeFile(path.join(j.dir,'chunks','00000002.json.tmp-torn'),'{');await unlink(path.join(j.dir,'index.json'));
  const h=new GardenHistory(dir),got=await h.recover(req.runId);assert.equal(got.run.events.length,128);assert.equal(got.run.complete,false);validateGardenRun(got.run);assert.deepEqual(got.run.result.state,gardenAt(r,128));
  assert.equal((await h.list()).items[0].status,'interrupted');assert.deepEqual((await h.frame(req.runId,100)).state,gardenAt(r,100));
});
test('damaged or missing chunks recover only an intact prefix and report damage',async()=>{
  const dir=await root(),req={runId:randomUUID(),config:gardenDefault,source:'for(let i=0;i<200;i++)wait(1);'},j=await GardenJournal.create(dir,req);
  const r=await executeGarden(req,{onBatch:e=>j.append(e)});await j.finish(r);
  await writeFile(path.join(j.dir,'chunks','00000001.json'),'{torn');const recovered=await new GardenHistory(dir).recover(req.runId);
  assert.equal(recovered.run.events.length,64);assert.equal(recovered.run.complete,false);assert.match(recovered.warning,/停止恢复/);assert.deepEqual(recovered.run.result.state,gardenAt(r,64));
  const header=JSON.parse(await readFile(path.join(j.dir,'header.json'),'utf8'));header.initial.inventory.grain++;await writeFile(path.join(j.dir,'header.json'),JSON.stringify(header));
  await assert.rejects(()=>new GardenHistory(dir).recover(req.runId),/记录头损坏/);await assert.rejects(()=>new GardenHistory(dir).recover('../outside'),/无效记录编号/);
});

test('history filters, pagination and legacy imports preserve their rule versions',async()=>{
  const dir=await root(),legacy=await root(),r=await executeGarden({runId:randomUUID(),config:{...gardenDefault,rule:'garden-v0.4.0'},source:'// 旧版回归样本\nwait(1);'});
  await writeFile(path.join(legacy,r.runId+'.farmgarden'),JSON.stringify(r));
  const h=new GardenHistory(dir,legacy);assert.equal((await h.list({query:'旧版'})).total,1);assert.deepEqual((await h.open(r.runId,'legacy')).run,r);
  const partial={...r,runId:randomUUID(),complete:false,result:{...r.result,reason:'runner_crash' as const}};
  await writeFile(path.join(legacy,partial.runId+'.farmgarden'),JSON.stringify(partial));
  assert.equal((await h.list({status:'interrupted'})).total,1);assert.equal((await h.open(partial.runId,'legacy')).run.complete,false);
  for(let i=0;i<3;i++){const req={runId:randomUUID(),config:gardenDefault,source:'// searchable '+i+'\nwait(1);'},j=await GardenJournal.create(dir,req);const run=await executeGarden(req,{onBatch:e=>j.append(e)});await j.finish(run);}
  const page=await h.list({query:'searchable',limit:2});assert.equal(page.total,3);assert.equal(page.items.length,2);
  assert.equal((await h.list({query:'searchable',limit:2,offset:2})).items.length,1);assert.equal((await h.list({mode:'challenge'})).total,0);
});
