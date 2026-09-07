import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Garden,gardenDefault,freshGarden,CROPS,copyGarden,ready,gardenAt,applyGardenEvent,validateGardenRun,type Crop} from '../packages/garden/core';
import {TECH} from '../packages/garden/content';
import {executeGarden} from '../packages/garden/runner';
function fixture(){const s=freshGarden(gardenDefault);s.economy!.unlocks=TECH.map(t=>t.id);s.inventory.grain=100;s.inventory.roots=100;for(const k of Object.keys(s.economy!.stock))s.economy!.stock[k]=100;return s;}
function crop(s:ReturnType<typeof fixture>,i:number,c:Crop,trait=0){Object.assign(s.cells[i],{soil:true,crop:c,growth:CROPS[c].growth,trait});}
test('research prerequisites, costs, land boundary and failed calls are enforced',()=>{
  const g=new Garden(gardenDefault);g.act('till',[]);assert.equal(g.act('plant',['carrot']),false);assert.equal(g.act('research',['carrot']),false);assert.equal(g.state.inventory.grain,0);assert.equal(g.act('craft',['boards']),false);
  for(let i=0;i<3;i++)assert.equal(g.act('move',['East']),true);assert.equal(g.act('move',['East']),false);assert.equal(g.state.x,3);
  const s=freshGarden(gardenDefault);s.inventory.grain=12;const r=new Garden(gardenDefault,s);assert.equal(r.act('research',['carrot']),true);assert.equal(r.state.inventory.grain,0);assert.equal(r.act('research',['carrot']),true);assert.equal(r.state.economy!.unlocks.length,1);
  const a=fixture();a.economy!.stock.timber=1;const f=new Garden(gardenDefault,a);assert.equal(f.act('craft',['boards',2]),false);assert.equal(f.state.economy!.stock.timber,1);assert.equal(f.state.economy!.stock.boards,100);
  const before=copyGarden(f.state);assert.throws(()=>f.act('craft',['boards',0]));assert.deepEqual(f.state,before);
  const b=new Garden({...gardenDefault,budget:1},fixture());b.act('inspect',[]);const frozen=copyGarden(b.state);assert.throws(()=>b.act('expand',[]));assert.deepEqual(b.state,frozen);
});
test('rotation, sunflower selection, pumpkin merging and cactus sorting change yields',()=>{
  const a=fixture();crop(a,0,'carrot');a.cells[0].lastCrop='carrot';assert.equal(new Garden(gardenDefault,a).act('harvest',[]),1);a.cells[0].fertility=1;assert.equal(new Garden(gardenDefault,a).act('harvest',[]),3);
  const b=fixture();crop(b,0,'sunflower',1);crop(b,1,'sunflower',9);assert.equal(new Garden(gardenDefault,b).act('harvest',[]),4);b.x=1;assert.equal(new Garden(gardenDefault,b).act('harvest',[]),8);
  const c=fixture();for(const i of [0,1,8,9])crop(c,i,'pumpkin');const p=new Garden(gardenDefault,c);assert.equal(p.act('harvest',[]),16);assert.equal(p.state.harvests,4);assert.ok([0,1,8,9].every(i=>p.state.cells[i].crop===null));
  const d=fixture();crop(d,0,'cactus',9);crop(d,1,'cactus',1);assert.equal(new Garden(gardenDefault,d).act('harvest',[]),2);const sorted=new Garden(gardenDefault,d);assert.equal(sorted.act('swap',['East']),true);assert.equal(sorted.act('harvest',[]),8);assert.equal(sorted.state.harvests,2);
});
test('spacing and symbiosis affect timing, crystals stall until repaired',()=>{
  const a=fixture();crop(a,0,'tree');a.cells[0].growth=0;const b=copyGarden(a);crop(b,1,'tree');const sparse=new Garden(gardenDefault,a),dense=new Garden(gardenDefault,b);sparse.act('wait',[100]);dense.act('wait',[100]);assert.ok(sparse.state.cells[0].growth>dense.state.cells[0].growth);
  const c=fixture();crop(c,0,'bean');assert.equal(new Garden(gardenDefault,c).act('harvest',[]),3);crop(c,1,'tree');assert.equal(new Garden(gardenDefault,c).act('harvest',[]),5);
  const d=fixture();crop(d,0,'crystal');d.cells[0].growth=129;const crystal=new Garden(gardenDefault,d);crystal.act('wait',[100]);assert.equal(crystal.state.cells[0].damaged,true);const growth=crystal.state.cells[0].growth;crystal.act('wait',[100]);assert.equal(crystal.state.cells[0].growth,growth);assert.equal(crystal.act('harvest',[]),false);assert.equal(crystal.act('repair',[]),true);assert.equal(crystal.state.economy!.stock.boards,99);for(let i=0;i<4;i++)crystal.act('wait',[100]);assert.ok(ready(crystal.state.cells[0]));assert.equal(crystal.act('harvest',[]),3);
});
test('exhausted inventory and a field full of damaged crystals can recover with free wheat',()=>{
  const s=freshGarden(gardenDefault);s.economy!.unlocks=TECH.map(t=>t.id);s.inventory.water=0;
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){crop(s,y*s.size+x,'crystal');s.cells[y*s.size+x].growth=130;s.cells[y*s.size+x].damaged=true;}
  const g=new Garden(gardenDefault,s);assert.equal(g.act('repair',[]),false);assert.equal(g.act('clear',[]),true);assert.equal(g.act('plant',['wheat']),true);for(let i=0;i<3;i++)g.act('wait',[100]);assert.equal(g.act('harvest',[]),3);assert.equal(g.state.inventory.grain,3);
});
test('fresh campaign unlocks all content, preserves replay and branches through real VM',async()=>{
  const source=await readFile('examples/garden-progress.js','utf8');const request={runId:randomUUID(),config:gardenDefault,source};const r=await executeGarden(request);assert.equal(r.result.reason,'finished',r.result.message);assert.equal(r.result.state.economy!.unlocks.length,20);assert.equal(r.result.state.economy!.quests.length,12);assert.equal(r.result.state.economy!.extent,8);
  assert.deepEqual(validateGardenRun(JSON.parse(JSON.stringify(r))).result.state,r.result.state);const again=await executeGarden({...request,runId:randomUUID()});assert.deepEqual(again.events,r.events);
  const states=[r.initial];for(const event of r.events)states.push(applyGardenEvent(states.at(-1)!,event));for(let i=0;i<100;i++){const n=i*7919%states.length;assert.deepEqual(gardenAt(r,n),states[n]);}
  const tampered=JSON.parse(JSON.stringify(r));tampered.events[100].economy.stock.boards++;assert.throws(()=>validateGardenRun(tampered),/事件/);
  const branch=await executeGarden({...request,source:'if (!Array.isArray(get_progress().unlocks)) throw Error("array bridge"); console.log(craft("boards", 1));',initial:r.result.state});assert.equal(branch.result.reason,'finished');assert.deepEqual(validateGardenRun(branch).result.state,branch.result.state);
  const beginner=await executeGarden({...request,source:await readFile('examples/garden-start.js','utf8')});assert.equal(beginner.result.reason,'finished');assert.equal(beginner.result.state.harvests,4);assert.equal(beginner.result.state.inventory.grain,12);
});
