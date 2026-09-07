import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Garden,copyGarden,freshGarden,gardenDefault,gardenAt,applyGardenEvent,validateGardenRun} from '../packages/garden/core';
import {canonical} from '../packages/protocol';
import {CHALLENGES,challengeConfig,makeMaze,mazeDirections,evaluateChallenge} from '../packages/garden/challenges';
import {challengeSource} from '../packages/garden/challenge-examples';
import {executeGarden} from '../packages/garden/runner';

test('challenge initial state, capabilities and budget cannot inherit free-farm upgrades',()=>{
  for(const c of CHALLENGES){const config=challengeConfig(c.id,7),initial=freshGarden(config);const changed=copyGarden(initial);changed.inventory.grain++;
    assert.throws(()=>new Garden(config,changed),/固定初始/);assert.throws(()=>new Garden({...config,budget:config.budget+1}),/固定规则/);
    const g=new Garden(config);assert.throws(()=>g.act('research',['harvester']),/未开放/);assert.deepEqual(g.state,g.initial);
  }
  assert.throws(()=>new Garden({...gardenDefault,challenge:'unknown'}));
});
test('maze topology is symmetric, connected without gates, and key is reachable before unlocking',()=>{
  for(let seed=0;seed<20;seed++)for(const size of [4,6,8]){
    const m=makeMaze(size,seed,size===8?3:2,3);assert.deepEqual(makeMaze(size,seed,size===8?3:2,3),m);
    const visit=(keys:boolean)=>{const reached=new Set([0]),queue=[0];for(let k=0;k<queue.length;k++){const i=queue[k];for(const d of Object.values(mazeDirections)){
      const x=i%size+d.dx,y=Math.floor(i/size)+d.dy,j=y*size+x;
      if(x<0||y<0||x>=size||y>=size){assert.ok(m.walls[i]&d.bit);continue;}
      assert.equal(!!(m.walls[i]&d.bit),!!(m.walls[j]&d.opposite));assert.equal(!!(m.gates[i]&d.bit),!!(m.gates[j]&d.opposite));
      if(!(m.walls[i]&d.bit)&&(keys||!(m.gates[i]&d.bit))&&!reached.has(j)){reached.add(j);queue.push(j);}
    }}return reached;};
    assert.equal(visit(true).size,size*size);if(size===8)assert.ok(visit(false).has(m.loot.indexOf('key')));
  }
});
test('walls block movement and sense reveals only local facts',()=>{
  const g=new Garden(challengeConfig('maze-3'));const sense=g.act('sense',[]) as Record<string,unknown>;assert.deepEqual(Object.keys(sense).sort(),['collected','exits','keys','loot','required']);
  const tick=g.state.tick;assert.equal(g.act('move',['North']),false);assert.equal(g.state.x,0);assert.equal(g.state.y,0);assert.equal(g.state.tick,tick+4);assert.equal(g.state.maze!.seen.filter(Boolean).length,1);
});
test('maze execution, inventory and fog reproduce across repeats and random seeks',async()=>{
  const req={runId:randomUUID(),config:challengeConfig('maze-3',19),source:challengeSource('maze-3')};const r=await executeGarden(req);assert.ok(evaluateChallenge(r)!.passed,r.result.message);assert.deepEqual(validateGardenRun(r).result.state,r.result.state);
  const again=await executeGarden({...req,runId:randomUUID()});assert.deepEqual(again.events,r.events);const states=[r.initial];for(const e of r.events)states.push(applyGardenEvent(states.at(-1)!,e));for(let i=0;i<100;i++){const n=i*7919%states.length;assert.deepEqual(gardenAt(r,n),states[n]);}
  const tampered=JSON.parse(JSON.stringify(r));tampered.events[3].maze.collected++;assert.throws(()=>validateGardenRun(tampered),/事件/);
  const forged=JSON.parse(JSON.stringify(r));forged.initial.inventory.grain=100;assert.throws(()=>validateGardenRun(forged),/固定初始/);
});
test('old economy run retains frozen v0.3 semantics and remains playable',async()=>{
  const expected=JSON.parse(await readFile('tests/fixtures/garden-v03-reference.json','utf8'));const source=await readFile(expected.source,'utf8');const r=await executeGarden({runId:randomUUID(),config:expected.config,source});assert.equal(r.version,'garden-v0.3.0');assert.equal(r.events.length,expected.events);assert.equal(createHash('sha256').update(canonical(r.events)).digest('hex'),expected.eventHash);assert.equal(createHash('sha256').update(canonical(r.result.state)).digest('hex'),expected.finalHash);assert.deepEqual(validateGardenRun(r).result.state,r.result.state);
});
test('combined tasks expose downstream material and scheduling effects of strategy changes',async()=>{
  const pair=async(id:string)=>Promise.all((['baseline','improved'] as const).map(variant=>executeGarden({runId:randomUUID(),config:challengeConfig(id),source:challengeSource(id,variant)})));
  const layout=await pair('layout-2');const [dense,spaced]=layout.map(r=>evaluateChallenge(r)!);assert.ok(dense.passed&&spaced.passed);assert.ok(dense.spent.boards>spaced.spent.boards,'symbiosis reduces bean cycles and board consumption');
  const repair=await pair('schedule-3');const [serial,batch]=repair.map(r=>evaluateChallenge(r)!);assert.ok(serial.passed&&batch.passed);assert.deepEqual(serial.spent,batch.spent);assert.equal(serial.produced.parts,batch.produced.parts);assert.ok(repair[0].events.find(e=>e.action==='craft')!.tick>repair[1].events.find(e=>e.action==='craft')!.tick,'batch repairs bring assembly forward');
  const harvest=await pair('sort-3');const [dry,wet]=harvest.map(r=>evaluateChallenge(r)!);assert.ok(dry.passed&&wet.passed);assert.equal(wet.spent.water,4);assert.equal(dry.spent.water??0,0);assert.equal(dry.produced.pumpkins,wet.produced.pumpkins);assert.ok(wet.tick<dry.tick,'early irrigation changes the shared harvest window');
});
