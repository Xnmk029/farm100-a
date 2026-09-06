import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {defaultConfig,VERSION,canonical,type Request} from '../packages/protocol';
import {Simulation,Stop,generate} from '../packages/simulation';
import {execute} from '../packages/runner';
import {validateRun,stateAt,applyEvent,logicalHash} from '../packages/recording';
const request=(source:string,config=defaultConfig):Request=>({protocolVersion:VERSION,runId:randomUUID(),source,config,label:'test',attempt:1});
const ref=readFileSync('examples/reference.js','utf8'),fast=readFileSync('examples/cached-insertion.js','utf8');
function independentSorted(grid:number[],n:number){for(let i=0;i<grid.length;i++){if(i%n&&grid[i]<grid[i-1])return false;if(i>=n&&grid[i]<grid[i-n])return false;}return true;}
test('budget preflight is atomic, including swap',()=>{
  const s=new Simulation({...defaultConfig,budget:2});const before=s.state;
  assert.throws(()=>s.act('swap',['East']),(e:unknown)=>e instanceof Stop&&e.reason==='budget_exceeded');
  assert.deepEqual(s.state,before);
  const zero=new Simulation({...defaultConfig,budget:0});assert.throws(()=>zero.act('get_size',[]));assert.equal(zero.state.cost,0);
});
test('boundary probes charged; invalid arguments are terminal and do not mutate',()=>{
  const s=new Simulation(defaultConfig);assert.equal(s.act('move',['North']),false);assert.equal(s.act('measure',['West']),null);
  assert.equal(s.act('swap',['West']),false);assert.equal(s.state.cost,5);assert.equal(s.state.x,0);
  const before=s.state;assert.throws(()=>s.act('measure',[undefined]));assert.throws(()=>s.act('move',['__proto__']));assert.deepEqual(s.state,before);
});
test('harvest rejects snake-order and validates all columns',()=>{
  const s=new Simulation({...defaultConfig,initial:[0,1,2,3,7,6,5,4,8,8,9,9,9,9,9,9]});assert.equal(s.act('harvest',[]),false);
  const t=new Simulation({...defaultConfig,budget:1,initial:Array(16).fill(3)});
  assert.throws(()=>t.act('harvest',[]),(e:unknown)=>e instanceof Stop&&e.reason==='succeeded');assert.equal(t.state.cost,1);assert.ok(t.state.harvested);
});
test('seed generation and multiset preservation',()=>{
  assert.deepEqual(generate(defaultConfig),generate(defaultConfig));assert.notDeepEqual(generate(defaultConfig),generate({...defaultConfig,seed:99}));
  const s=new Simulation({...defaultConfig,budget:2000});const before=s.state.grid.toSorted();
  for(let i=0;i<100;i++){s.act('swap',['East']);s.act('move',['South']);s.act('swap',['North']);}
  assert.deepEqual(s.state.grid.toSorted(),before);
});
test('QuickJS solves complete suite with independent oracle',async()=>{
  for(const size of [4,8,16] as const)for(const seed of [0,7,42,99])for(const source of [ref,fast]){
    const r=await execute(request(source,{...defaultConfig,size,seed,budget:200000}));
    assert.equal(r.result.reason,'succeeded',`${size}/${seed}: ${r.result.message}`);
    assert.ok(independentSorted(r.result.state.grid,size));
    assert.deepEqual(r.initial.grid.toSorted(),r.result.state.grid.toSorted());
    assert.equal(r.events.length,Object.values(r.result.state.counts).reduce((a,b)=>a+b,0));
    assert.equal(r.events.at(-1)?.cost,r.result.state.cost);
  }
});
test('repeatable events, full save/reload, random-access replay, tamper rejection',async()=>{
  let first='';
  for(let i=0;i<10;i++){const r=await execute(request(fast));if(!i)first=r.logicalHash;assert.equal(r.logicalHash,first);}
  const r=await execute(request(ref));const loaded=validateRun(JSON.parse(JSON.stringify(r)));
  let state=r.initial;const states=[state];for(const e of r.events){state=applyEvent(state,e);states.push(state);}
  for(let i=0;i<100;i++){const seq=Math.floor((i*7919)%states.length);assert.deepEqual(stateAt(loaded,seq),states[seq]);}
  const bad=structuredClone(r);bad.events[0].cost++;bad.logicalHash=logicalHash(bad);assert.throws(()=>validateRun(bad));
});
test('VM cannot bypass budgets with catch or act after success',async()=>{
  const r=await execute(request('try { while(true) get_size(); } catch(e) { try { swap(East); } catch(e) {} }',{...defaultConfig,budget:10}));
  assert.equal(r.result.reason,'budget_exceeded');assert.equal(r.result.state.cost,10);assert.equal(r.events.length,10);
  const t=await execute(request('try { harvest(); } catch(e) { move(East); }',{...defaultConfig,initial:Array(16).fill(0)}));
  assert.equal(t.result.reason,'succeeded');assert.equal(t.events.length,1);
});
test('infinite loop, memory, log flooding, errors, host capabilities',async()=>{
  const busy=await execute(request('while(true) {}'),{wallMs:50});assert.equal(busy.result.reason,'wall_timeout');
  const mem=await execute(request('new ArrayBuffer(32*1024*1024);'),{memoryBytes:8*1024*1024,wallMs:2000});assert.equal(mem.result.reason,'memory_limit',mem.result.message);
  const log=await execute(request('for(let i=0;i<10000;i++)console.log("xxxxxxxxxxxxxxxx");'),{logBytes:1024});assert.ok(log.logsTruncated);assert.ok(log.logs.join('').length<=1024);
  const syntax=await execute(request('const ='));assert.equal(syntax.result.reason,'syntax_error');
  const host=await execute(request('if ([typeof process,typeof require,typeof fetch,typeof Date,typeof Math.random].some(x=>x!=="undefined")) throw Error("HOST LEAK");'));
  assert.equal(host.result.reason,'incomplete');
  const api=await execute(request('move("invalid")'));assert.equal(api.result.reason,'api_error');assert.equal(api.events.length,0);
  const getter=await execute(request('throw {get message(){harvest();return "bad";}}',{...defaultConfig,initial:Array(16).fill(0)}));assert.equal(getter.result.reason,'runtime_error');assert.equal(getter.events.length,0);
});
