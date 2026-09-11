import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {executeGarden} from '../packages/garden/runner';
import {challengeConfig} from '../packages/garden/challenges';
import {validateGardenRun} from '../packages/garden/core';
import {scoreChallenge,rankChallengeRuns,challengeEfficiency,compareChallengeScores} from '../packages/garden/scoring';

test('real completed, partial and failed runs have separate completion and ranking eligibility',async()=>{
  const run=async(source:string)=>validateGardenRun(await executeGarden({runId:randomUUID(),config:challengeConfig('fleet-overhead',42,1),source}));
  const fast=await run('harvest();'),slow=await run('wait(10); harvest();'),empty=await run(''),crash=await run('harvest(); throw Error("after goal");');
  assert.equal(scoreChallenge(empty)!.completion,0);
  assert.equal(scoreChallenge(crash)!.completion,100);
  assert.equal(scoreChallenge(crash)!.passed,false);
  const tied={...fast,runId:randomUUID()};
  const rows=rankChallengeRuns([slow,empty,crash,fast,tied]);
  assert.deepEqual(rows.map(r=>r.rank),[3,null,null,1,1]);
  assert.ok(challengeEfficiency(slow,fast)!.savingPercent>0);
  assert.ok(challengeEfficiency(fast,slow)!.savingPercent<0);
  assert.equal(challengeEfficiency(fast,empty),null);
  const tampered=structuredClone(fast);tampered.result.state.inventory.grain=999;
  assert.throws(()=>validateGardenRun(tampered));
});

test('seed and deployment isolate ranking cohorts; identity calls are not productive work or communication',async()=>{
  const run=async(seed:number,drones:1|4)=>validateGardenRun(await executeGarden({runId:randomUUID(),config:challengeConfig('fleet-overhead',seed,drones),source:'if(get_drone_id()===0) harvest();'}));
  const a=await run(42,1),b=await run(43,1),c=await run(42,4);
  assert.deepEqual(rankChallengeRuns([a,b,c]).map(r=>r.rank),[1,1,1]);
  assert.equal(challengeEfficiency(a,b),null);assert.equal(challengeEfficiency(a,c),null);
  assert.deepEqual(scoreChallenge(c)!.participation,{deployed:4,productive:1,successfulWork:1,communicationCalls:0});
  assert.equal(scoreChallenge({...a,version:'garden-v0.4.0'}),null);
  const score=scoreChallenge(a)!;
  assert.ok(compareChallengeScores(score,{...score,primaryValue:score.primaryValue+1})<0);
  assert.ok(compareChallengeScores(score,{...score,secondaryValue:score.secondaryValue+1})<0);
  assert.ok(compareChallengeScores(score,{...score,failedActions:score.failedActions+1})<0);
});

test('surplus in one goal cannot compensate for a missing second goal',async()=>{
  const run=validateGardenRun(await executeGarden({runId:randomUUID(),config:challengeConfig('farm-2'),source:''}));
  // Arithmetic-only fixture, not an accepted execution or leaderboard entry.
  run.result.state.inventory.grain=720;run.result.state.inventory.roots=0;
  assert.equal(scoreChallenge(run)!.completion,50);assert.equal(scoreChallenge(run)!.passed,false);
  run.result.state.inventory.roots=72;
  assert.equal(scoreChallenge(run)!.completion,100);
});
