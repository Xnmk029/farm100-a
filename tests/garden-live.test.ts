import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Garden,gardenDefault,copyGarden,applyGardenEvent} from '../packages/garden/core';
import {LiveGardenWindow} from '../packages/garden/live';

test('live viewing releases old events and preserves absolute time and the disk world',()=>{
  const sim=new Garden({...gardenDefault,size:32});
  for(let i=0;i<37;i++)sim.act('wait',[3]);
  const initial=copyGarden(sim.state),live=new LiveGardenWindow(initial);sim.events=[];
  let expected=initial;
  for(let batch=0;batch<12;batch++){
    const start=sim.events.length;
    for(let i=0;i<64;i++){sim.act(i%4===0?'move':'wait',i%4===0?[i%8?'West':'East']:[2]);}
    const events=sim.events.slice(start);live.append(events);
    for(const event of events)expected=applyGardenEvent(expected,event);
    assert.deepEqual(live.at(live.tick).state,expected);
    assert.deepEqual(live.at(live.before.tick-1).state,live.before);
    assert.deepEqual(live.at(live.tick).state,expected);
    assert.ok(live.events.length<=192);
  }
  assert.equal(live.count,768);assert.equal(live.peak,192);
  assert.throws(()=>live.append([sim.events[0]]),/顺序/);
});
