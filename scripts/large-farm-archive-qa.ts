import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import assert from 'node:assert/strict';
import {GardenHistory} from '../packages/garden-storage/journal';
import {applyGardenEvent,copyGarden} from '../packages/garden/core';
import {canonical} from '../packages/protocol';

// Run after measurement: full rule verification and archive import are CPU intensive.
const measured=path.resolve(process.argv[2]??'artifacts/large-farm/release-20260910/performance-30m');
const out=path.resolve(process.argv[3]??path.join(measured,'archive-qa'));
await mkdir(out,{recursive:true});
const report:any={startedAt:new Date().toISOString(),pass:false,measured,stages:[]};
const save=()=>writeFile(path.join(out,'archive-qa.json'),JSON.stringify(report,null,2));
const stage=async(name:string)=>{report.stages.push({name,at:new Date().toISOString()});await save();console.log(name);};
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
try{
  const measuredReport=JSON.parse(await readFile(path.join(measured,'performance-qa.json'),'utf8'));
  const receipt=JSON.parse(await readFile(path.join(measured,'production-receipt.json'),'utf8'));
  assert.equal(receipt.runId,measuredReport.runId);assert.equal(receipt.config.size,32);assert.equal(receipt.config.drones,8);
  const history=new GardenHistory(measuredReport.journalRoot),id=receipt.runId;
  await stage('reopen source with full rule verification');
  const opened=await history.openPaged(id);assert.equal(opened.warning,'');assert.deepEqual(opened.receipt.result,receipt.result);
  const positions=new Set<number>([0,receipt.eventCount]);let seed=20260910;
  while(positions.size<Math.min(100,receipt.eventCount+1)){seed=(Math.imul(seed,1664525)+1013904223)>>>0;positions.add(seed%(receipt.eventCount+1));}
  const expected=new Map<number,string>();expected.set(0,hash(receipt.initial));
  let state=copyGarden(receipt.initial),seq=0,encodedBytes=0,rawBytes=0;
  const chunks=path.join(measuredReport.journalRoot,id,'chunks'),files=(await readdir(chunks)).filter(f=>/^\d{8}\.json\.gz$/.test(f)).sort();
  assert.equal(files.length,opened.chunks);
  await stage('derive seek references from sequential event application');
  for(const file of files){
    const encoded=await readFile(path.join(chunks,file)),raw=gunzipSync(encoded,{maxOutputLength:16*1024*1024});encodedBytes+=encoded.length;rawBytes+=raw.length;
    for(const event of JSON.parse(raw.toString('utf8')).events){assert.equal(event.seq,++seq);state=applyGardenEvent(state,event);if(positions.has(seq))expected.set(seq,hash(state));}
  }
  assert.equal(seq,receipt.eventCount);assert.deepEqual(state,receipt.result.state);
  const seeks:any[]=[];
  const verifySeeks=async(h:GardenHistory,runId:string)=>{let peak=0;for(const n of positions){const t=performance.now(),page=await h.window(runId,{seq:n});assert.equal(page.seq,n);assert.equal(hash(page.state),expected.get(n));assert.ok(page.events.length<=320);peak=Math.max(peak,page.events.length);seeks.push({runId,seq:n,events:page.events.length,ms:performance.now()-t});}return peak;};
  await stage('100 out-of-order source seeks');const sourcePeak=await verifySeeks(history,id);
  const archive=path.join(out,'production.farmjournal');await stage('export complete compressed archive');await history.exportPaged(id,archive);
  const archiveHash=createHash('sha256');for await(const block of createReadStream(archive))archiveHash.update(block);
  const importedHistory=new GardenHistory(path.join(out,'imported-history'));await stage('import archive into independent history');
  const imported=await importedHistory.importPaged(archive);assert.equal(imported.warning,'');assert.equal(imported.receipt.eventCount,receipt.eventCount);assert.deepEqual(imported.receipt.initial,receipt.initial);assert.deepEqual(imported.receipt.result,receipt.result);assert.equal(imported.receipt.source,receipt.source);
  await stage('100 out-of-order imported seeks');const importPeak=await verifySeeks(importedHistory,imported.receipt.runId);
  report.archive={path:archive,bytes:(await stat(archive)).size,sha256:archiveHash.digest('hex')};
  report.events=seq;report.chunks=files.length;report.compression={encodedBytes,rawBytes,ratio:encodedBytes/rawBytes};report.seeks=seeks;report.peakWindow={source:sourcePeak,imported:importPeak};
  report.production={ticks:state.tick-receipt.initial.tick,harvests:state.harvests-receipt.initial.harvests,planted:state.planted-receipt.initial.planted,shared:state.fleet?.shared,counterDelta:Object.fromEntries(Object.entries(state.economy!.counters).map(([k,v])=>[k,v-(receipt.initial.economy.counters[k]??0)]))};
  report.pass=true;
}catch(error){report.error=String(error);process.exitCode=1;}
report.completedAt=new Date().toISOString();await save();console.log(JSON.stringify({pass:report.pass,error:report.error,events:report.events,compression:report.compression}));
