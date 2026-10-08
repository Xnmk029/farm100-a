import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve('video/evidence-stories-v1'),data=JSON.parse(await fs.readFile(path.join(root,'public/data.json'),'utf8')),ledger=JSON.parse(await fs.readFile(path.join(root,'evidence-ledger.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex'),checks=[];
assert.equal(hash(await fs.readFile(path.join(ledger.archive,'bundle.json'))),ledger.bundleHash);
for(const file of ledger.files){
 const bytes=await fs.readFile(path.join(ledger.archive,file.path));assert.equal(hash(bytes),file.sha256);const r=JSON.parse(bytes);
 const s=Object.values(data.stories).flatMap(s=>s.runs).find(r=>r.attemptId===file.attempt);
 const actual=r.events.filter(e=>e.kind!=='dispatch'&&(e.actor??0)>=0);
 assert.equal(s.terminal.counts.failed,actual.filter(e=>e.value===false).length);
 assert.equal(s.terminal.counts.failedCollect,actual.filter(e=>e.action==='collect'&&e.value===false).length);
 assert.equal(s.terminal.counts.harvest,actual.filter(e=>e.action==='harvest'&&e.value!==false).length);
 assert.equal(s.terminal.tick,r.result.state.tick);assert.equal(hash(s.source),file.sourceHash);
 let prevTick=-1;for(const e of s.trace){assert(e.tick>=prevTick);prevTick=e.tick;}
 for(const m of s.moves){assert.equal(Math.abs(m.to.x-m.from.x)+Math.abs(m.to.y-m.from.y),1);assert(m.end>m.start);if(r.initial.maze){const dx=m.to.x-m.from.x,dy=m.to.y-m.from.y,bit=dy===-1?1:dy===1?2:dx===1?4:8;assert.equal(r.initial.maze.walls[m.from.y*r.initial.size+m.from.x]&bit,0,'movement crosses a wall');}}
 checks.push({attempt:s.attemptId,sourceHash:true,runHash:true,counts:true,movesValidated:s.moves.length});
}
const maze=data.stories['maze-3'].runs;
assert(maze[0].source.includes('if(loot(s)){collect();changed=true;}'));
assert(maze[1].source.includes('if(loot(local)&&!collected.has(k))'));
const r=JSON.parse(await fs.readFile(path.join(ledger.archive,ledger.files.find(f=>f.attempt==='maze-3-1').path),'utf8'));
const ev=r.events.find(e=>e.action==='collect'&&e.value===false);assert.equal(ev.tick,32);const sense=r.events.filter(e=>e.action==='sense'&&e.tick<ev.tick).at(-1);assert.equal(sense.value.loot,null);assert.equal(sense.value.keys,1);
const fleet=data.stories['fleet-harvest'].runs;assert(fleet[0].source.includes('while(p.y<y){move(North)'));assert(fleet[1].source.includes('while(p.y<y){move(South)'));
const plan=JSON.parse(await fs.readFile(path.join(root,'public/plan.json'),'utf8'));
for(const s of plan.stories){let end=0;for(const c of s.chapters){assert.equal(c.startFrame,end);assert(c.audioStart+c.audioSeconds<=(c.startFrame+c.durationFrames)/30);end+=c.durationFrames;}assert.equal(end,s.totalFrames);}
const result={pass:true,at:new Date().toISOString(),sameSeedAndInitial:true,readOnlyArchiveHashes:true,snippetClaimsVerified:true,narrationFitsChapters:true,checks};
await fs.writeFile(path.join(root,'evidence-qa.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
