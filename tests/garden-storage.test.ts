import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,unlink,readdir} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {canonical} from '../packages/protocol';
import {GardenJournal,GardenHistory} from '../packages/garden-storage/journal';
import {executeGarden} from '../packages/garden/runner';
import {gardenDefault,gardenAt,gardenSequence,validateGardenRun} from '../packages/garden/core';
import {challengeConfig} from '../packages/garden/challenges';
import {challengeSource} from '../packages/garden/challenge-examples';
const root=()=>mkdtemp(path.join(os.tmpdir(),'farm100-journal-test-'));
test('large journals compress losslessly, export portably, and reject oversized decompression',async()=>{
  const dir=await root(),req={runId:randomUUID(),config:{...gardenDefault,size:32 as const},source:'for(let i=0;i<200;i++)wait(1);'};
  const journal=await GardenJournal.create(dir,req),history=new GardenHistory(dir);
  const receipt=await executeGarden(req,{stream:true,onBatch:e=>journal.append(e)});await journal.finish(receipt);
  const files=await readdir(path.join(journal.dir,'chunks'));assert.ok(files.every(f=>f.endsWith('.json.gz')));
  const first=await readFile(path.join(journal.dir,'chunks',files.sort()[0]));assert.ok(first.length<gunzipSync(first).length/4);
  assert.deepEqual((await history.openPaged(req.runId)).receipt.result.state,receipt.result.state);
  assert.deepEqual((await history.window(req.runId,{seq:200})).state,receipt.result.state);
  const file=path.join(dir,'compressed.farmjournal');await history.exportPaged(req.runId,file);
  const imported=await history.importPaged(file);assert.deepEqual(imported.receipt.result.state,receipt.result.state);
  assert.equal(imported.receipt.eventCount,200);
  const lines=(await readFile(file,'utf8')).trim().split('\n');assert.equal(JSON.parse(lines[0]).format,'farm100-journal-export-v2');
  lines[1]=JSON.stringify({chunkGzip:gzipSync(Buffer.alloc(16*1024*1024+1,32)).toString('base64')});
  const hostile=path.join(dir,'oversized.farmjournal');await writeFile(hostile,lines.join('\n')+'\n');
  await assert.rejects(()=>history.importPaged(hostile));assert.equal((await history.list()).total,2);
});
test('a sealed live journal can be viewed without repeating full validation and detects changed chunks',async()=>{
  const dir=await root(),req={runId:randomUUID(),config:gardenDefault,source:'for(let i=0;i<160;i++)wait(1);'};
  const journal=await GardenJournal.create(dir,req),history=new GardenHistory(dir);
  const receipt=await executeGarden(req,{stream:true,onBatch:events=>journal.append(events)});
  assert.throws(()=>history.adopt(journal,receipt),/尚未完成/);
  await journal.finish(receipt);
  assert.throws(()=>new GardenHistory(dir+'/other').adopt(journal,receipt),/目录/);
  history.adopt(journal,receipt);
  assert.deepEqual((await history.window(req.runId,{seq:160})).state,receipt.result.state);
  const file=path.join(journal.dir,'chunks','00000000.json');
  const chunk=JSON.parse(await readFile(file,'utf8'));chunk.events[0].value=999;await writeFile(file,JSON.stringify(chunk));
  await assert.rejects(()=>history.window(req.runId,{seq:1}),/片段已改变/);
});
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
test('paged records validate and seek by time or sequence without materializing a run',async()=>{
  for(const config of [gardenDefault,challengeConfig('fleet-repair',7,8)]){
    const dir=await root(),req={runId:randomUUID(),config,source:config.challenge?challengeSource(config.challenge):'for(let i=0;i<150;i++){till();wait(1);}'},j=await GardenJournal.create(dir,req);
    const expected=await executeGarden(req),receipt=await executeGarden(req,{stream:true,onBatch:e=>j.append(e)});await j.finish(receipt);
    const h=new GardenHistory(dir);await assert.rejects(()=>h.window(req.runId,{seq:0}),/先校验/);
    const opened=await h.openPaged(req.runId);assert.equal(opened.warning,'');assert.deepEqual(opened.receipt.result,receipt.result);assert.equal(opened.receipt.eventCount,expected.events.length);
    for(let i=0;i<100;i++){
      const tick=i*7919%(expected.result.state.tick+1),seq=gardenSequence(expected,tick),window=await h.window(req.runId,{tick});
      assert.equal(window.seq,seq);assert.deepEqual(window.state,gardenAt(expected,seq));assert.ok(window.events.length<=320);
      const n=i*313%(expected.events.length+1);assert.deepEqual((await h.window(req.runId,{seq:n})).state,gardenAt(expected,n));
      for(const e of window.future)assert.deepEqual(e,expected.events[e.seq-1]);
      for(const p of window.events.at(-1)?.fleet?.pending??[]){if(p.action!=='move')continue;const completion=expected.events.find(e=>e.kind==='complete'&&e.actor===p.actor&&e.fromTick===p.start&&e.tick===p.end);if(completion)assert.ok(window.future.some(e=>e.seq===completion.seq));}
    }
    await unlink(path.join(j.dir,'index.json'));assert.deepEqual((await h.window(req.runId,{seq:7})).state,gardenAt(expected,7));
    const changed=JSON.parse(await readFile(path.join(j.dir,'chunks','00000000.json'),'utf8'));changed.events[0].cost++;await writeFile(path.join(j.dir,'chunks','00000000.json'),JSON.stringify(changed));
    await assert.rejects(()=>h.window(req.runId,{seq:1}),/改变/);
  }
});
test('paged recovery rejects rule forgery even with recomputed checksums and accepts no part of the chunk',async()=>{
  const dir=await root(),req={runId:randomUUID(),config:challengeConfig('fleet-harvest',0,8),source:challengeSource('fleet-harvest')},j=await GardenJournal.create(dir,req),run=await executeGarden(req,{onBatch:e=>j.append(e)});await j.finish(run);
  const file=path.join(j.dir,'chunks','00000001.json'),chunk=JSON.parse(await readFile(file,'utf8'));chunk.events.at(-1).cost++;
  const {hash,...payload}=chunk;chunk.hash=createHash('sha256').update(canonical(payload)).digest('hex');await writeFile(file,JSON.stringify(chunk));
  const h=new GardenHistory(dir),opened=await h.openPaged(req.runId);assert.equal(opened.receipt.eventCount,64);assert.equal(opened.receipt.complete,false);assert.match(opened.warning,/引擎不一致/);assert.deepEqual(opened.receipt.result.state,gardenAt(run,64));
  assert.deepEqual((await h.window(req.runId,{seq:1000})).state,gardenAt(run,64));
});
test('paged recovery preserves a prefix ending inside tied completions',async()=>{
  const dir=await root(),req={runId:randomUUID(),config:challengeConfig('fleet-harvest',0,8),source:'wait(1);'},run=await executeGarden(req),j=await GardenJournal.create(dir,req);await j.append(run.events.slice(0,9));
  const h=new GardenHistory(dir),opened=await h.openPaged(req.runId);assert.equal(opened.receipt.eventCount,9);assert.equal(opened.receipt.complete,false);assert.deepEqual(opened.receipt.result.state,gardenAt(run,9));
  assert.deepEqual((await h.window(req.runId,{tick:1})).state,gardenAt(run,9));
});
test('portable streamed archive imports under a fresh identity and rejects incomplete or forged data',async()=>{
  const dir=await root(),req={runId:randomUUID(),config:challengeConfig('fleet-harvest',0,8),source:challengeSource('fleet-harvest')},j=await GardenJournal.create(dir,req),run=await executeGarden(req,{stream:true,onBatch:e=>j.append(e)});await j.finish(run);
  const h=new GardenHistory(dir),file=path.join(dir,'export.farmjournal');await h.exportPaged(req.runId,file);const imported=await h.importPaged(file);
  assert.notEqual(imported.receipt.runId,req.runId);assert.equal(imported.warning,'');assert.equal(imported.receipt.eventCount,run.eventCount);assert.deepEqual(imported.receipt.result,run.result);assert.equal((await h.list()).total,2);
  const text=await readFile(file,'utf8'),lines=text.trimEnd().split('\n');
  await writeFile(file,lines.slice(0,-1).join('\n')+'\n');await assert.rejects(()=>h.importPaged(file),/不完整/);assert.equal((await h.list()).total,2);
  const forged=JSON.parse(lines.at(-1)!);forged.receipt.result.state.cost++;lines[lines.length-1]=JSON.stringify(forged);await writeFile(file,lines.join('\n')+'\n');await assert.rejects(()=>h.importPaged(file),/结束状态不一致/);assert.equal((await h.list()).total,2);
});
