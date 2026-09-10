import {test} from 'node:test';
import assert from 'node:assert/strict';
import {soundForEvent,SoundDensity} from '../packages/garden-view/audio';
import {Garden,gardenDefault} from '../packages/garden/core';

test('sound follows successful completions and diagnoses empty harvests',()=>{
  const garden=new Garden(gardenDefault);
  garden.act('harvest',[]);const failed=garden.events.at(-1)!;assert.equal(soundForEvent(failed)?.success,false);assert.equal(soundForEvent(failed)?.channel,'actions');
  garden.act('till',[]);garden.act('plant',['wheat']);for(let i=0;i<3;i++)garden.act('wait',[100]);
  garden.act('harvest',[]);const harvested=garden.events.at(-1)!;assert.ok(harvested.value);assert.equal(soundForEvent(harvested)?.channel,'harvest');
  assert.equal(soundForEvent({...harvested,value:0})?.success,false);
  assert.equal(soundForEvent({...harvested,kind:'dispatch'}),null);
  garden.act('get_position',[]);assert.equal(soundForEvent(garden.events.at(-1)!),null);
});

test('simultaneous drones and high speed playback have separate bounded sound density',()=>{
  const density=new SoundDensity(),counts={actions:0,harvest:0};
  for(let ms=0;ms<1000;ms++)for(let drone=0;drone<8;drone++)for(const channel of ['actions','harvest'] as const)if(density.accept(channel,ms/1000))counts[channel]++;
  assert.ok(counts.actions<=10&&counts.actions>=9);assert.ok(counts.harvest<=8&&counts.harvest>=7);
  assert.equal(density.accept('actions',NaN),false);
  const sameFrame=new SoundDensity();assert.equal(sameFrame.accept('actions',0),true);assert.equal(sameFrame.accept('harvest',0),true);assert.equal(sameFrame.accept('harvest',0),false);
});
