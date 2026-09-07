import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {CHALLENGES,challengeConfig,evaluateChallenge} from '../packages/garden/challenges';
import {challengeSource} from '../packages/garden/challenge-examples';
import {executeGarden} from '../packages/garden/runner';
import {validateGardenRun} from '../packages/garden/core';
const seeds=process.argv.includes('--full')?Array.from({length:20},(_,i)=>i):[42];
const rows=[];await mkdir('artifacts/challenges',{recursive:true});
for(const c of CHALLENGES)for(const seed of seeds)for(const variant of ['baseline','improved','failure'] as const){
  const source=challengeSource(c.id,variant),run=await executeGarden({runId:randomUUID(),config:challengeConfig(c.id,seed),source});
  validateGardenRun(run);const score=evaluateChallenge(run)!;
  const row={id:c.id,family:c.family,seed,variant,...score,message:run.result.message};rows.push(row);
  if(seed===seeds[0])await writeFile(`artifacts/challenges/${c.id}-${variant}.farmgarden`,JSON.stringify(run));
  console.log(c.id,seed,variant,score.passed,score.reason,score.tick,score.cost);
  if(variant==='failure'?score.passed:!score.passed)console.log(JSON.stringify(row));
}
const pass=rows.every(r=>r.variant==='failure'?!r.passed:r.passed);
await writeFile('artifacts/challenges/'+(seeds.length===20?'suite':'smoke')+'-qa.json',JSON.stringify({pass,seeds,runs:rows.length,rows},null,2));
if(!pass)process.exitCode=1;
