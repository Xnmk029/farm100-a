import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {Gateway,locked} from '../packages/agent-gateway/gateway';
import {TASKS,BENCHMARK_VERSION} from '../packages/benchmark-v2/catalog';
import {canonical} from '../packages/protocol';
import {runCase,assess,sha,writeJSON} from '../scripts/benchmark-v2-engine';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const answer=(source:string)=>JSON.stringify({source,strategy:'QA fixture; not a model result',correctness:'one step east',complexity:'O(1)',boundaries:'fixed lesson initial state'});
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'farm100-agent-test-')),g=new Gateway(repo,root),task=TASKS.find(t=>t.id==='lesson-position')!,spec=task.cases[0];
 const run=await runCase(task,spec,'move(East); get_position();'),text=JSON.stringify(run),score=assess(task,spec,run,1,'reference');assert.equal(score.passed,true);
 const file='references/lesson-position.json';await mkdir(path.join(g.referenceDir,'references'),{recursive:true});await writeFile(path.join(g.referenceDir,file),text);
 const body={version:BENCHMARK_VERSION,frozenAt:new Date().toISOString(),tasks:TASKS,references:{[spec.id]:{primary:score.primary,sourceHash:sha(run.source),recordHash:sha(text),file}}};
 const prompts={'lesson-position':'Move one cell East using move(East). Return the five JSON string fields.'};
 await writeJSON(path.join(g.referenceDir,'index.json'),{manifest:{...body,hash:sha(canonical(body))},prompts,promptsHash:sha(canonical(prompts))});return g;
}
test('gateway isolates identities, persists tickets, prohibits early export and grades real VM evidence',async()=>{
 const g=await fixture(),started=await g.start({agent:'External QA',tasks:['lesson-position']}),id=started.sessionId;
 assert.equal((await g.status(id)).participant.model,undefined);
 assert.throws(()=>g.dir('../escape'));await assert.rejects(()=>g.start({agent:'x'}),/不完整/);
 const ticket=await g.next(id);assert.equal(ticket.state,'question');assert.deepEqual(await g.next(id),ticket);
 await assert.rejects(()=>g.export(id),/完成/);
 await assert.rejects(()=>g.archive(id),/完成/);
 const raw=answer('move(East); get_position();');await g.submit(id,(ticket as any).id,raw,false);
 await assert.rejects(()=>g.submit(id,(ticket as any).id,answer('move(West);'),false),/覆盖/);
 await g.work(id);assert.equal((await g.status(id)).complete,true);
 assert.equal((await g.submit(id,(ticket as any).id,raw,false)).idempotent,true);
 assert.equal((await g.next(id)).state,'complete');
 const exported=await g.export(id);assert.equal(exported.first.coverage,1);assert.equal(exported.first.total,null);
 const bundle=JSON.parse(await readFile(exported.bundle,'utf8'));assert.equal(bundle.attempts[0].cases[0].passed,true);assert.equal(bundle.attempts[0].call.actualModel,null);
 const archived=await g.archive(id);assert.equal(archived.mode,'practice');assert.equal(archived.historicalLeaderboardEligible,false);
 assert.deepEqual(await g.archive(id),archived);
 assert.equal(JSON.parse(await readFile(archived.registry,'utf8')).length,1);
 const archivedBundle=await readFile(path.join(archived.directory,'bundle.json'),'utf8');assert.equal(sha(archivedBundle),archived.bundleHash);
 await writeFile(path.join(archived.directory,'REPORT.md'),'tampered');
 await assert.rejects(()=>g.archive(id),/哈希/);
 const evidence=path.join(g.dir(id),bundle.attempts[0].cases[0].evidence),record=JSON.parse(await readFile(evidence,'utf8'));record.source='harvest();';await writeJSON(evidence,record);
 await assert.rejects(()=>g.export(id),/证据/);
 await assert.rejects(()=>g.archive(id),/证据/);
});
test('gateway spends malformed and runtime-failed attempts, permits exactly one revision and no resampling',async()=>{
 const g=await fixture(),{sessionId:id}=await g.start({agent:'QA',model:'declared-only',tasks:['lesson-position']});
 const q1:any=await g.next(id);const malformed:any=await g.submit(id,q1.id,'not json',false);assert.equal(malformed.status,'submission_error');
 const q2:any=await g.next(id);assert.equal(q2.round,2);assert.match(q2.prompt,/not json/);
 await g.submit(id,q2.id,answer('throw Error("failed");'),false);await g.work(id);
 assert.equal((await g.next(id)).state,'complete');assert.equal((await g.status(id)).lastFeedback?.cases[0].passed,false);
 await assert.rejects(()=>g.submit(id,q2.id,answer('move(East); get_position();'),false),/更换答案/);
 const exported=await g.export(id);const bundle=JSON.parse(await readFile(exported.bundle,'utf8'));assert.equal(bundle.attempts.length,2);
});
test('gateway recovers the exact persisted answer after worker interruption, concurrent next keeps one ticket',async()=>{
 const g=await fixture(),{sessionId:id}=await g.start({agent:'QA',tasks:['lesson-position']});
 const [q1,q2]:any[]=await Promise.all([g.next(id),g.next(id)]);assert.equal(q1.id,q2.id);
 await g.submit(id,q1.id,answer('move(East); get_position();'),false);
 const otherProcess=new Gateway(repo,g.root);await otherProcess.work(id);assert.equal((await otherProcess.status(id)).complete,true);
 const s=await otherProcess.load(id);assert.equal(s.attempts[0].sourceHash,sha('move(East); get_position();'));
 await writeJSON(path.join(g.dir(id),'test.lock'),{pid:2147483647,token:'dead'});
 assert.equal(await locked(path.join(g.dir(id),'test.lock'),async()=>true),true);
});
test('actual MCP stdio handshake, invalid request, question, asynchronous worker and export from another cwd',async()=>{
 const g=await fixture();
 const child=spawn(process.execPath,[path.join(repo,'scripts/farm100-agent.mjs'),'mcp','--root',g.root],{cwd:os.tmpdir(),windowsHide:true,stdio:['pipe','pipe','pipe']});
 let nextId=0,buffer='',stderr='';const waiting=new Map<number,{resolve:(x:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 child.stderr.on('data',c=>stderr+=c);
 child.stdout.on('data',c=>{buffer+=c;let i:number;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);const m=JSON.parse(line),w=waiting.get(m.id);if(w){clearTimeout(w.timer);waiting.delete(m.id);w.resolve(m);}}});
 const rpc=(method:string,params?:unknown)=>new Promise<any>((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>reject(Error('MCP timeout '+stderr)),30000);waiting.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
 const call=async(name:string,args:unknown)=>{const r=await rpc('tools/call',{name,arguments:args});assert.equal(r.result?.isError,undefined,JSON.stringify(r));return JSON.parse(r.result.content[0].text);};
 try{
  const init=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'QA',version:'1'}});assert.equal(init.result.protocolVersion,'2025-06-18');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  assert.equal((await rpc('tools/list')).result.tools.length,6);
  assert.equal((await rpc('tools/call',{name:'farm100_status',arguments:{sessionId:'x',bogus:true}})).error.code,-32602);
  const session=await call('farm100_start',{agent:'Protocol QA',tasks:['lesson-position']}),q=await call('farm100_next',{sessionId:session.sessionId});
  await call('farm100_submit',{sessionId:session.sessionId,ticketId:q.id,submission:answer('move(East); get_position();')});
  let complete=false;for(let i=0;i<60;i++){const status=await call('farm100_status',{sessionId:session.sessionId});if(status.complete){complete=true;break;}await new Promise(r=>setTimeout(r,250));}
  assert.equal(complete,true);assert.equal((await call('farm100_next',{sessionId:session.sessionId})).state,'complete');
  const out=await call('farm100_export',{sessionId:session.sessionId});assert.equal(out.first.coverage,1);assert.equal(out.first.total,null);
 }finally{child.stdin.end();child.kill();for(const w of waiting.values())clearTimeout(w.timer);}
});
